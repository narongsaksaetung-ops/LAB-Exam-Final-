const express = require('express');
const bcrypt = require('bcrypt');
const { body, param, validationResult } = require('express-validator');
const { query } = require('../models/db');
const { authenticate, requireAdmin } = require('../middleware/auth');
const logger = require('../utils/logger');

const router = express.Router();
router.use(authenticate, requireAdmin);

// GET /api/admin/users
// super_admin: sees all users except themselves
// regular admin: sees all non-super-admin users except themselves
router.get('/users', async (req, res, next) => {
  try {
    let whereClause;
    if (req.user.role === 'super_admin') {
      // Super admin sees everyone except themselves (including other admins)
      whereClause = `u.id != $1 AND u.role != 'super_admin'`;
    } else {
      // Regular admin sees everyone except super_admin and themselves
      whereClause = `u.id != $1 AND u.is_super_admin = FALSE AND u.role != 'super_admin'`;
    }

    const result = await query(
      `SELECT u.id, u.email, u.username, u.role, u.is_super_admin, u.created_at,
              COUNT(r.id)::int AS report_count
       FROM users u
       LEFT JOIN reports r ON r.reporter_id = u.id
       WHERE ${whereClause}
       GROUP BY u.id
       ORDER BY
         CASE u.role
           WHEN 'admin'      THEN 1
           WHEN 'researcher' THEN 2
           WHEN 'user'       THEN 3
           ELSE 4
         END,
         u.created_at DESC`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) { next(err); }
});

// PATCH /api/admin/users/:id/role
// super_admin: can set user/researcher/admin
// regular admin: can only toggle user <-> researcher (not promote to admin)
router.patch('/users/:id/role', [
  param('id').isInt({ min: 1 }),
  body('role').isIn(['user', 'researcher', 'admin']).withMessage('บทบาทไม่ถูกต้อง')
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { role } = req.body;
    const targetId = parseInt(req.params.id);

    if (targetId === req.user.id) {
      return res.status(400).json({ error: 'ไม่สามารถเปลี่ยนบทบาทของตัวเองได้' });
    }

    const targetResult = await query(
      'SELECT id, username, role, is_super_admin FROM users WHERE id = $1',
      [targetId]
    );
    if (targetResult.rows.length === 0) return res.status(404).json({ error: 'ไม่พบผู้ใช้' });
    const target = targetResult.rows[0];

    if (target.is_super_admin) {
      return res.status(403).json({ error: 'ไม่สามารถเปลี่ยนบทบาทของ Super Admin ได้' });
    }

    // Regular admin cannot promote to admin or modify existing admins
    if (req.user.role === 'admin') {
      if (role === 'admin') {
        return res.status(403).json({ error: 'ต้องเป็น Super Admin เพื่อเลื่อนขั้นเป็น Admin ได้' });
      }
      if (target.role === 'admin') {
        return res.status(403).json({ error: 'ไม่มีสิทธิ์จัดการบัญชีผู้ดูแลระบบ' });
      }
    }

    const result = await query(
      'UPDATE users SET role = $1 WHERE id = $2 RETURNING id, email, username, role',
      [role, targetId]
    );

    await query(
      'INSERT INTO audit_logs (user_id, action, resource, resource_id, ip_address, details) VALUES ($1,$2,$3,$4,$5,$6)',
      [req.user.id, 'CHANGE_USER_ROLE', 'users', targetId, req.ip,
       JSON.stringify({ newRole: role, previousRole: target.role })]
    );
    logger.info('User role changed', { targetUserId: targetId, newRole: role, adminId: req.user.id });
    res.json(result.rows[0]);
  } catch (err) { next(err); }
});

// PATCH /api/admin/users/:id/password
router.patch('/users/:id/password', [
  param('id').isInt({ min: 1 }),
  body('newPassword')
    .isLength({ min: 8 }).withMessage('รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร')
    .matches(/[A-Z]/).withMessage('ต้องมีตัวพิมพ์ใหญ่')
    .matches(/[0-9]/).withMessage('ต้องมีตัวเลข')
    .matches(/[^A-Za-z0-9]/).withMessage('ต้องมีอักขระพิเศษ')
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const targetId = parseInt(req.params.id);
    const targetResult = await query(
      'SELECT id, is_super_admin, role FROM users WHERE id = $1', [targetId]
    );
    if (targetResult.rows.length === 0) return res.status(404).json({ error: 'ไม่พบผู้ใช้' });

    if (targetResult.rows[0].is_super_admin) {
      return res.status(403).json({ error: 'ไม่มีสิทธิ์รีเซ็ตรหัสผ่าน Super Admin' });
    }
    if (req.user.role === 'admin' && targetResult.rows[0].role === 'admin') {
      return res.status(403).json({ error: 'ไม่มีสิทธิ์รีเซ็ตรหัสผ่านผู้ดูแลระบบคนอื่น' });
    }

    const newHash = await bcrypt.hash(req.body.newPassword, 12);
    await query('UPDATE users SET password_hash = $1 WHERE id = $2', [newHash, targetId]);
    await query(
      'INSERT INTO audit_logs (user_id, action, resource, resource_id, ip_address) VALUES ($1,$2,$3,$4,$5)',
      [req.user.id, 'ADMIN_RESET_PASSWORD', 'users', targetId, req.ip]
    );
    logger.info('Admin reset password', { adminId: req.user.id, targetUserId: targetId });
    res.json({ message: 'รีเซ็ตรหัสผ่านสำเร็จ' });
  } catch (err) { next(err); }
});

// DELETE /api/admin/users/:id
router.delete('/users/:id', [
  param('id').isInt({ min: 1 })
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const targetId = parseInt(req.params.id);
    if (targetId === req.user.id) {
      return res.status(400).json({ error: 'ไม่สามารถลบบัญชีตัวเองได้' });
    }

    const userCheck = await query(
      'SELECT id, username, role, is_super_admin FROM users WHERE id = $1', [targetId]
    );
    if (userCheck.rows.length === 0) return res.status(404).json({ error: 'ไม่พบผู้ใช้' });
    const target = userCheck.rows[0];

    if (target.is_super_admin) {
      return res.status(403).json({ error: 'ไม่สามารถลบบัญชี Super Admin ได้' });
    }
    if (req.user.role === 'admin' && target.role === 'admin') {
      return res.status(403).json({ error: 'ไม่มีสิทธิ์ลบบัญชีผู้ดูแลระบบ' });
    }

    await query('UPDATE audit_logs SET user_id = NULL WHERE user_id = $1', [targetId]);
    await query('DELETE FROM users WHERE id = $1', [targetId]);
    await query(
      'INSERT INTO audit_logs (user_id, action, resource, resource_id, ip_address, details) VALUES ($1,$2,$3,$4,$5,$6)',
      [req.user.id, 'DELETE_USER', 'users', targetId, req.ip,
       JSON.stringify({ deletedUsername: target.username, deletedRole: target.role })]
    );
    logger.info('User deleted', { targetUserId: targetId, adminId: req.user.id });
    res.json({ message: 'ลบผู้ใช้สำเร็จ' });
  } catch (err) { next(err); }
});

// GET /api/admin/stats
router.get('/stats', async (req, res, next) => {
  try {
    const [totalReports, byStatus, bySeverity, totalUsers, recentActivity] = await Promise.all([
      query('SELECT COUNT(*) FROM reports'),
      query('SELECT status, COUNT(*) as count FROM reports GROUP BY status ORDER BY count DESC'),
      query('SELECT severity, COUNT(*) as count FROM reports GROUP BY severity ORDER BY count DESC'),
      query("SELECT COUNT(*) FROM users WHERE is_super_admin = FALSE"),
      query(`SELECT r.id, r.title, r.status, r.severity, u.username, r.updated_at
             FROM reports r JOIN users u ON r.reporter_id = u.id
             ORDER BY r.updated_at DESC LIMIT 5`)
    ]);
    res.json({
      totalReports: parseInt(totalReports.rows[0].count),
      totalUsers: parseInt(totalUsers.rows[0].count),
      byStatus: byStatus.rows,
      bySeverity: bySeverity.rows,
      recentActivity: recentActivity.rows
    });
  } catch (err) { next(err); }
});

// GET /api/admin/audit-logs
router.get('/audit-logs', async (req, res, next) => {
  try {
    const result = await query(
      `SELECT al.*, u.username, u.email FROM audit_logs al
       LEFT JOIN users u ON al.user_id = u.id
       ORDER BY al.created_at DESC LIMIT 100`
    );
    res.json(result.rows);
  } catch (err) { next(err); }
});

module.exports = router;
