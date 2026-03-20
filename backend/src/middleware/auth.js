const jwt = require('jsonwebtoken');
const { query } = require('../models/db');
const logger = require('../utils/logger');

// authenticate: verify JWT then fetch CURRENT role from DB.
// This ensures role changes take effect immediately without requiring re-login.
const authenticate = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    logger.warn('Authentication failed: no token', { ip: req.ip, path: req.path });
    return res.status(401).json({ error: 'Access denied. No token provided.' });
  }

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    logger.warn('Authentication failed: invalid token', { ip: req.ip, path: req.path });
    return res.status(401).json({ error: 'Invalid or expired token.' });
  }

  // Fetch fresh user data from DB — so role changes are reflected immediately
  try {
    const result = await query(
      'SELECT id, email, username, role, is_super_admin FROM users WHERE id = $1',
      [decoded.id]
    );
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'User account not found.' });
    }
    req.user = result.rows[0];
    next();
  } catch (err) {
    logger.error('Auth DB lookup failed', { error: err.message });
    return res.status(500).json({ error: 'Authentication error.' });
  }
};

// requireAdmin: allow admin AND super_admin
const requireAdmin = (req, res, next) => {
  if (!req.user || (req.user.role !== 'admin' && req.user.role !== 'super_admin')) {
    logger.warn('Authorization failed: admin required', {
      userId: req.user?.id, role: req.user?.role, ip: req.ip, path: req.path
    });
    return res.status(403).json({ error: 'Forbidden. Admin access required.' });
  }
  next();
};

// requireSuperAdmin: only super_admin
const requireSuperAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== 'super_admin') {
    logger.warn('Authorization failed: super_admin required', {
      userId: req.user?.id, role: req.user?.role, ip: req.ip, path: req.path
    });
    return res.status(403).json({ error: 'Forbidden. Super admin access required.' });
  }
  next();
};

// requireResearcher: allow researcher, admin, super_admin (not plain 'user')
const requireResearcher = (req, res, next) => {
  const allowed = ['researcher', 'admin', 'super_admin'];
  if (!req.user || !allowed.includes(req.user.role)) {
    return res.status(403).json({ error: 'Forbidden. Researcher access required.' });
  }
  next();
};

const requireRole = (roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    logger.warn('Authorization failed: insufficient role', {
      userId: req.user?.id, role: req.user?.role, requiredRoles: roles, ip: req.ip
    });
    return res.status(403).json({ error: 'Forbidden. Insufficient permissions.' });
  }
  next();
};

module.exports = { authenticate, requireAdmin, requireSuperAdmin, requireResearcher, requireRole };
