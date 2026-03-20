const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { body, validationResult } = require('express-validator');
const rateLimit = require('express-rate-limit');
const { query } = require('../models/db');
const { authenticate } = require('../middleware/auth');
const logger = require('../utils/logger');

const router = express.Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 10,
  message: { error: 'คำขอมากเกินไป กรุณารอ 15 นาทีแล้วลองใหม่' },
  standardHeaders: true, legacyHeaders: false,
  handler: (req, res, next, options) => {
    logger.warn('Rate limit exceeded', { ip: req.ip, path: req.path });
    res.status(429).json(options.message);
  }
});

const registerValidation = [
  body('email').isEmail().normalizeEmail().withMessage('กรุณากรอกอีเมลที่ถูกต้อง'),
  body('password')
    .isLength({ min: 8 }).withMessage('รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร')
    .matches(/[A-Z]/).withMessage('รหัสผ่านต้องมีตัวพิมพ์ใหญ่')
    .matches(/[0-9]/).withMessage('รหัสผ่านต้องมีตัวเลข')
    .matches(/[^A-Za-z0-9]/).withMessage('รหัสผ่านต้องมีอักขระพิเศษ'),
  body('username').trim()
    .isLength({ min: 3, max: 50 }).withMessage('ชื่อผู้ใช้ต้องมี 3-50 ตัวอักษร')
    .matches(/^[a-zA-Z0-9_\- ]+$/).withMessage('ชื่อผู้ใช้มีอักขระที่ไม่อนุญาต')
];

// POST /api/auth/register
router.post('/register', authLimiter, registerValidation, async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { email, password, username } = req.body;
    const existing = await query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) return res.status(409).json({ error: 'อีเมลนี้ถูกใช้แล้ว' });

    const passwordHash = await bcrypt.hash(password, 12);
    const result = await query(
      'INSERT INTO users (email, password_hash, username, role) VALUES ($1, $2, $3, $4) RETURNING id, email, username, role',
      [email, passwordHash, username, 'researcher']
    );
    const user = result.rows[0];

    await query('INSERT INTO audit_logs (user_id, action, ip_address, user_agent) VALUES ($1, $2, $3, $4)',
      [user.id, 'REGISTER', req.ip, req.get('User-Agent')]);

    logger.info('User registered', { userId: user.id });

    const token = jwt.sign(
      { id: user.id, email: user.email, username: user.username, role: user.role },
      process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
    );
    res.status(201).json({ token, user: { id: user.id, email: user.email, username: user.username, role: user.role } });
  } catch (err) { next(err); }
});

// POST /api/auth/login
router.post('/login', authLimiter, [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty()
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: 'กรุณากรอกข้อมูลให้ครบถ้วน' });

    const { email, password } = req.body;
    await query('INSERT INTO login_attempts (ip_address, email) VALUES ($1, $2)', [req.ip, email]);

    const recentAttempts = await query(
      "SELECT COUNT(*) FROM login_attempts WHERE ip_address = $1 AND attempted_at > NOW() - INTERVAL '15 minutes'",
      [req.ip]
    );
    if (parseInt(recentAttempts.rows[0].count) > 20) {
      return res.status(429).json({ error: 'คำขอมากเกินไป กรุณารอสักครู่' });
    }

    const result = await query(
      'SELECT id, email, password_hash, username, role FROM users WHERE email = $1', [email]
    );
    if (result.rows.length === 0) {
      // Timing-safe: always run bcrypt even when user not found
      await bcrypt.compare(password, '$2b$12$invalidhashfortiming000000000000000000000000000000000000');
      return res.status(401).json({ error: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' });
    }

    const user = result.rows[0];
    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      logger.warn('Login failed', { userId: user.id, ip: req.ip });
      return res.status(401).json({ error: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' });
    }

    await query('INSERT INTO audit_logs (user_id, action, ip_address, user_agent) VALUES ($1, $2, $3, $4)',
      [user.id, 'LOGIN', req.ip, req.get('User-Agent')]);
    logger.info('User logged in', { userId: user.id, role: user.role });

    const token = jwt.sign(
      { id: user.id, email: user.email, username: user.username, role: user.role },
      process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
    );
    res.json({ token, user: { id: user.id, email: user.email, username: user.username, role: user.role } });
  } catch (err) { next(err); }
});

// POST /api/auth/forgot-password
router.post('/forgot-password', authLimiter, [
  body('email').isEmail().normalizeEmail().withMessage('กรุณากรอกอีเมลที่ถูกต้อง')
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: 'กรุณากรอกอีเมลที่ถูกต้อง' });

    const { email } = req.body;
    // Always return same message to prevent email enumeration
    const genericMsg = { message: 'หากอีเมลนี้ถูกลงทะเบียนไว้ คุณจะได้รับลิงก์รีเซ็ตรหัสผ่าน' };

    const result = await query('SELECT id, username FROM users WHERE email = $1', [email]);
    if (result.rows.length === 0) return res.json(genericMsg);

    const user = result.rows[0];
    await query('DELETE FROM password_resets WHERE user_id = $1', [user.id]);
    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    await query('INSERT INTO password_resets (user_id, token, expires_at) VALUES ($1, $2, $3)', [user.id, token, expires]);

    const resetUrl = `${process.env.SITE_URL || 'http://localhost:3000'}/reset-password?token=${token}`;

    // Log reset URL for dev/demo environments (no real email server)
    logger.info('Password reset token created', { userId: user.id, resetUrl });

    res.json(genericMsg);
  } catch (err) { next(err); }
});

// POST /api/auth/reset-password
router.post('/reset-password', [
  body('token').notEmpty().withMessage('Token จำเป็น'),
  body('password')
    .isLength({ min: 8 }).withMessage('รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร')
    .matches(/[A-Z]/).withMessage('ต้องมีตัวพิมพ์ใหญ่')
    .matches(/[0-9]/).withMessage('ต้องมีตัวเลข')
    .matches(/[^A-Za-z0-9]/).withMessage('ต้องมีอักขระพิเศษ')
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { token, password } = req.body;
    const result = await query('SELECT * FROM password_resets WHERE token = $1 AND used = FALSE', [token]);
    if (result.rows.length === 0) return res.status(400).json({ error: 'ลิงก์รีเซ็ตไม่ถูกต้องหรือถูกใช้แล้ว' });

    const reset = result.rows[0];
    if (new Date(reset.expires_at) < new Date()) {
      await query('DELETE FROM password_resets WHERE id = $1', [reset.id]);
      return res.status(400).json({ error: 'ลิงก์รีเซ็ตหมดอายุแล้ว กรุณาขอใหม่' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    await query('UPDATE users SET password_hash = $1 WHERE id = $2', [passwordHash, reset.user_id]);
    await query('UPDATE password_resets SET used = TRUE WHERE id = $1', [reset.id]);

    logger.info('Password reset successful', { userId: reset.user_id });
    res.json({ message: 'รีเซ็ตรหัสผ่านสำเร็จ! คุณสามารถเข้าสู่ระบบได้แล้ว' });
  } catch (err) { next(err); }
});

// PATCH /api/auth/change-password
router.patch('/change-password', authenticate, [
  body('currentPassword').notEmpty().withMessage('กรุณากรอกรหัสผ่านปัจจุบัน'),
  body('newPassword')
    .isLength({ min: 8 }).withMessage('รหัสผ่านใหม่ต้องมีอย่างน้อย 8 ตัวอักษร')
    .matches(/[A-Z]/).withMessage('ต้องมีตัวพิมพ์ใหญ่')
    .matches(/[0-9]/).withMessage('ต้องมีตัวเลข')
    .matches(/[^A-Za-z0-9]/).withMessage('ต้องมีอักขระพิเศษ')
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { currentPassword, newPassword } = req.body;
    const result = await query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'ไม่พบผู้ใช้' });

    const valid = await bcrypt.compare(currentPassword, result.rows[0].password_hash);
    if (!valid) return res.status(401).json({ error: 'รหัสผ่านปัจจุบันไม่ถูกต้อง' });
    if (currentPassword === newPassword) return res.status(400).json({ error: 'รหัสผ่านใหม่ต้องต่างจากรหัสผ่านเดิม' });

    const newHash = await bcrypt.hash(newPassword, 12);
    await query('UPDATE users SET password_hash = $1 WHERE id = $2', [newHash, req.user.id]);
    await query('INSERT INTO audit_logs (user_id, action, ip_address) VALUES ($1, $2, $3)',
      [req.user.id, 'CHANGE_PASSWORD', req.ip]);

    logger.info('Password changed', { userId: req.user.id });
    res.json({ message: 'เปลี่ยนรหัสผ่านสำเร็จ' });
  } catch (err) { next(err); }
});

// GET /api/auth/me
router.get('/me', authenticate, async (req, res, next) => {
  try {
    const result = await query(
      'SELECT id, email, username, role, is_super_admin, created_at FROM users WHERE id = $1', [req.user.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'ไม่พบผู้ใช้' });
    res.json(result.rows[0]);
  } catch (err) { next(err); }
});

module.exports = router;
