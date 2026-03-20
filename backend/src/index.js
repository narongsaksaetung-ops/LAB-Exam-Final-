require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');
const xss = require('xss');
const path = require('path');
const fs = require('fs');
const { query } = require('./models/db');
const logger = require('./utils/logger');
const { errorHandler, notFound } = require('./middleware/errorHandler');

const app = express();
const server = http.createServer(app);

// ─── Security Headers ─────────────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'blob:'],
      connectSrc: ["'self'", 'ws:', 'wss:'],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"]
    }
  },
  crossOriginEmbedderPolicy: false
}));

// ─── CORS ─────────────────────────────────────────────────────────────────────
const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:3000').split(',');
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      logger.warn('CORS blocked request from', { origin });
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// ─── Body parsing ─────────────────────────────────────────────────────────────
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: false, limit: '100kb' }));

// ─── Request Logging ─────────────────────────────────────────────────────────
app.use(morgan('combined', {
  stream: { write: (msg) => logger.info(msg.trim()) }
}));

// ─── Global Rate Limiter ─────────────────────────────────────────────────────
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please slow down.' }
});
app.use(globalLimiter);

// ─── Trust proxy (for rate limiting behind Docker NAT) ───────────────────────
app.set('trust proxy', 1);

// ─── Ensure uploads directory exists ─────────────────────────────────────────
const UPLOAD_DIR = path.join(__dirname, '../uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// ─── Routes ──────────────────────────────────────────────────────────────────
const attachmentRouter = require('./routes/attachments');

app.use('/api/auth', require('./routes/auth'));
app.use('/api/reports', require('./routes/reports'));
// Attachment routes: both /api/reports/:id/attachments AND /api/attachments/file/:filename
app.use('/api/reports', attachmentRouter);
app.use('/api/attachments', attachmentRouter);
app.use('/api/admin', require('./routes/admin'));

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

// ─── 404 & Error handlers ────────────────────────────────────────────────────
app.use(notFound);
app.use(errorHandler);

// ─── Socket.IO with JWT Auth ─────────────────────────────────────────────────
const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// Socket.IO JWT authentication middleware
// Fetches fresh role from DB (same as HTTP authenticate middleware)
// so role changes take effect immediately without requiring reconnection
io.use(async (socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) {
    logger.warn('WebSocket rejected: no token', { socketId: socket.id });
    return next(new Error('Authentication required'));
  }
  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    logger.warn('WebSocket rejected: invalid token', { socketId: socket.id });
    return next(new Error('Invalid token'));
  }
  // Fetch current role from DB — JWT role may be stale after promotion
  try {
    const result = await query(
      'SELECT id, email, username, role, is_super_admin FROM users WHERE id = $1',
      [decoded.id]
    );
    if (result.rows.length === 0) {
      return next(new Error('User not found'));
    }
    socket.user = result.rows[0];
    next();
  } catch (err) {
    logger.error('WebSocket DB auth failed', { error: err.message });
    next(new Error('Authentication error'));
  }
});

io.on('connection', (socket) => {
  logger.info('WebSocket connected', { userId: socket.user.id, socketId: socket.id });

  // Join report room (with access control)
  socket.on('join_report', async ({ reportId }) => {
    try {
      if (!reportId || isNaN(parseInt(reportId))) return;

      const reportResult = await query('SELECT reporter_id FROM reports WHERE id = $1', [parseInt(reportId)]);
      if (reportResult.rows.length === 0) return;

      const report = reportResult.rows[0];
      if (socket.user.role !== 'admin' && socket.user.role !== 'super_admin' && report.reporter_id !== socket.user.id) {
        logger.warn('Unauthorized room join attempt', { userId: socket.user.id, reportId });
        socket.emit('error', 'Access denied to this report.');
        return;
      }

      socket.join(`report_${reportId}`);
      logger.info('User joined report room', { userId: socket.user.id, reportId });
    } catch (err) {
      logger.error('Error joining report room', err);
    }
  });

  // Handle chat message
  socket.on('send_message', async ({ reportId, content }) => {
    try {
      if (!reportId || !content || typeof content !== 'string') return;
      if (content.trim().length === 0) return;
      if (content.length > 2000) {
        socket.emit('error', 'Message too long (max 2000 chars).');
        return;
      }

      const reportResult = await query('SELECT reporter_id FROM reports WHERE id = $1', [parseInt(reportId)]);
      if (reportResult.rows.length === 0) return;

      const report = reportResult.rows[0];
      if (socket.user.role !== 'admin' && socket.user.role !== 'super_admin' && report.reporter_id !== socket.user.id) {
        socket.emit('error', 'Access denied.');
        return;
      }

      // Sanitize message (XSS prevention)
      const safeContent = xss(content.trim(), {
        whiteList: {},
        stripIgnoreTag: true,
        stripIgnoreTagBody: ['script', 'style']
      });

      if (!safeContent) return;

      const msgResult = await query(
        'INSERT INTO messages (report_id, user_id, content) VALUES ($1, $2, $3) RETURNING id, content, created_at',
        [parseInt(reportId), socket.user.id, safeContent]
      );

      const message = {
        id: msgResult.rows[0].id,
        content: msgResult.rows[0].content,
        created_at: msgResult.rows[0].created_at,
        username: socket.user.username,
        role: socket.user.role,
        user_id: socket.user.id
      };

      io.to(`report_${reportId}`).emit('new_message', message);
      logger.info('Chat message sent', { reportId, userId: socket.user.id });
    } catch (err) {
      logger.error('Error sending message', err);
      socket.emit('error', 'Failed to send message.');
    }
  });

  socket.on('leave_report', ({ reportId }) => {
    socket.leave(`report_${reportId}`);
  });

  socket.on('disconnect', () => {
    logger.info('WebSocket disconnected', { userId: socket.user?.id, socketId: socket.id });
  });
});

// ─── Start server ─────────────────────────────────────────────────────────────
// Run migrations + seed BEFORE accepting connections.
// Ensures is_super_admin column and role constraints exist before
// authenticate() queries them on the very first request.
const seed = require('./seed');
const PORT = process.env.PORT || 5000;

(async () => {
  try {
    await seed();
    server.listen(PORT, '0.0.0.0', () => {
      logger.info(`Server running on port ${PORT} in ${process.env.NODE_ENV} mode`);
    });
  } catch (err) {
    logger.error('Startup failed', { error: err.message });
    process.exit(1);
  }
})();

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  server.close(() => {
    logger.info('Process terminated');
    process.exit(0);
  });
});

process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception', { error: err.message, stack: err.stack });
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled Rejection', { reason });
});
