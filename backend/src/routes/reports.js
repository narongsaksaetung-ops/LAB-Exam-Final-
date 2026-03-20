const express = require('express');
const { body, param, query: queryValidator, validationResult } = require('express-validator');
const xss = require('xss');
const { query } = require('../models/db');
const { authenticate, requireAdmin, requireResearcher } = require('../middleware/auth');
const logger = require('../utils/logger');

const router = express.Router();

const OWASP_TYPES = [
  'A01:2025 - Broken Access Control',
  'A02:2025 - Security Misconfiguration',
  'A03:2025 - Software Supply Chain Failures',
  'A04:2025 - Cryptographic Failures',
  'A05:2025 - Injection',
  'A06:2025 - Insecure Design',
  'A07:2025 - Authentication Failures',
  'A08:2025 - Software or Data Integrity Failures',
  'A09:2025 - Security Logging and Alerting Failures',
  'A10:2025 - Mishandling of Exceptional Conditions',
  'Other'
];

const VALID_SEVERITIES = ['low', 'medium', 'high', 'critical'];
const VALID_STATUSES = ['pending', 'triaging', 'accepted', 'duplicate', 'resolved', 'rejected'];

// Sanitize user input to prevent XSS
const sanitize = (str) => {
  if (typeof str !== 'string') return str;
  return xss(str, {
    whiteList: {},
    stripIgnoreTag: true,
    stripIgnoreTagBody: ['script', 'style']
  });
};

// Report submission validation
const reportValidation = [
  body('title').trim().isLength({ min: 10, max: 500 }).withMessage('Title must be 10-500 chars'),
  body('vuln_type').isIn(OWASP_TYPES).withMessage('Invalid vulnerability type'),
  body('severity').isIn(VALID_SEVERITIES).withMessage('Invalid severity level'),
  body('description').trim().isLength({ min: 50, max: 10000 }).withMessage('Description must be 50-10000 chars'),
  body('poc').optional().trim().isLength({ max: 10000 }).withMessage('PoC too long'),
  body('affected_url').optional().trim().isURL({ require_protocol: true }).withMessage('Invalid URL format')
];

// GET /api/reports - list reports (researcher: own only, admin: all)
router.get('/', authenticate, async (req, res, next) => {
  try {
    const { severity, status, page = 1, limit = 20 } = req.query;
    const safePage = Math.max(1, parseInt(page) || 1);
    const safeLimit = Math.min(50, Math.max(1, parseInt(limit) || 20));
    const safeOffset = (safePage - 1) * safeLimit;

    let conditions = [];
    let params = [];
    let paramIdx = 1;

    // Researchers can only see their own reports (Access Control)
    if (req.user.role !== 'admin' && req.user.role !== 'super_admin') {
      conditions.push(`r.reporter_id = $${paramIdx++}`);
      params.push(req.user.id);
    }

    if (severity && VALID_SEVERITIES.includes(severity)) {
      conditions.push(`r.severity = $${paramIdx++}`);
      params.push(severity);
    }

    if (status && VALID_STATUSES.includes(status)) {
      conditions.push(`r.status = $${paramIdx++}`);
      params.push(status);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await query(
      `SELECT COUNT(*) FROM reports r ${whereClause}`,
      params
    );

    const result = await query(
      `SELECT r.id, r.title, r.vuln_type, r.severity, r.status, r.affected_url,
              r.created_at, r.updated_at,
              u.username as reporter_name, u.email as reporter_email
       FROM reports r
       JOIN users u ON r.reporter_id = u.id
       ${whereClause}
       ORDER BY r.created_at DESC
       LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
      [...params, safeLimit, safeOffset]
    );

    res.json({
      reports: result.rows,
      total: parseInt(countResult.rows[0].count),
      page: safePage,
      limit: safeLimit
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/reports/:id - get single report
router.get('/:id', authenticate, [
  param('id').isInt({ min: 1 }).withMessage('Invalid report ID')
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const result = await query(
      `SELECT r.*, u.username as reporter_name, u.email as reporter_email
       FROM reports r
       JOIN users u ON r.reporter_id = u.id
       WHERE r.id = $1`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Report not found.' });
    }

    const report = result.rows[0];

    // Researchers can only view their own reports
    if (req.user.role !== 'admin' && req.user.role !== 'super_admin' && report.reporter_id !== req.user.id) {
      logger.warn('Unauthorized report access attempt', {
        userId: req.user.id,
        reportId: req.params.id,
        ip: req.ip
      });
      return res.status(403).json({ error: 'Forbidden. You can only view your own reports.' });
    }

    res.json(report);
  } catch (err) {
    next(err);
  }
});

// POST /api/reports - submit new report (researcher, admin, super_admin only)
router.post('/', authenticate, requireResearcher, reportValidation, async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { title, vuln_type, severity, description, poc, affected_url } = req.body;

    // Sanitize all text inputs to prevent XSS
    const safeTitle = sanitize(title.trim());
    const safeDescription = sanitize(description.trim());
    const safePoc = poc ? sanitize(poc.trim()) : null;
    const safeUrl = affected_url ? affected_url.trim() : null;

    const result = await query(
      `INSERT INTO reports (title, vuln_type, severity, description, poc, affected_url, reporter_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [safeTitle, vuln_type, severity, safeDescription, safePoc, safeUrl, req.user.id]
    );

    await query(
      'INSERT INTO audit_logs (user_id, action, resource, resource_id, ip_address) VALUES ($1, $2, $3, $4, $5)',
      [req.user.id, 'SUBMIT_REPORT', 'reports', result.rows[0].id, req.ip]
    );

    logger.info('Report submitted', { reportId: result.rows[0].id, userId: req.user.id });

    res.status(201).json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

// PATCH /api/reports/:id - update report (admin only for status, researcher can edit own open reports)
router.patch('/:id', authenticate, [
  param('id').isInt({ min: 1 }).withMessage('Invalid report ID'),
  body('status').optional().isIn(VALID_STATUSES).withMessage('Invalid status'),
  body('title').optional().trim().isLength({ min: 10, max: 500 }),
  body('severity').optional().isIn(VALID_SEVERITIES),
  body('description').optional().trim().isLength({ min: 50, max: 10000 }),
  body('poc').optional().trim().isLength({ max: 10000 })
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const reportResult = await query('SELECT * FROM reports WHERE id = $1', [req.params.id]);
    if (reportResult.rows.length === 0) return res.status(404).json({ error: 'Report not found.' });

    const report = reportResult.rows[0];

    if (req.user.role !== 'admin' && req.user.role !== 'super_admin') {
      // Researchers can only edit their own reports while status is 'pending'
      // Once admin starts triaging, the report is locked to preserve audit integrity
      if (report.reporter_id !== req.user.id) {
        return res.status(403).json({ error: 'Forbidden.' });
      }
      if (report.status !== 'pending') {
        return res.status(403).json({ error: 'ไม่สามารถแก้ไขรายงานที่อยู่ระหว่างการตรวจสอบหรือปิดแล้ว' });
      }
      if (req.body.status) {
        return res.status(403).json({ error: 'Researchers cannot change report status.' });
      }
    }

    const { status, title, severity, description, poc, affected_url } = req.body;
    const updates = [];
    const params = [];
    let idx = 1;

    if (status) { updates.push(`status = $${idx++}`); params.push(status); }
    if (title) { updates.push(`title = $${idx++}`); params.push(sanitize(title.trim())); }
    if (severity) { updates.push(`severity = $${idx++}`); params.push(severity); }
    if (description) { updates.push(`description = $${idx++}`); params.push(sanitize(description.trim())); }
    if (poc !== undefined) { updates.push(`poc = $${idx++}`); params.push(poc ? sanitize(poc.trim()) : null); }
    if (affected_url !== undefined) { updates.push(`affected_url = $${idx++}`); params.push(affected_url || null); }

    if (updates.length === 0) return res.status(400).json({ error: 'No fields to update.' });

    params.push(req.params.id);
    const result = await query(
      `UPDATE reports SET ${updates.join(', ')} WHERE id = $${idx} RETURNING *`,
      params
    );

    await query(
      'INSERT INTO audit_logs (user_id, action, resource, resource_id, ip_address, details) VALUES ($1, $2, $3, $4, $5, $6)',
      [req.user.id, 'UPDATE_REPORT', 'reports', req.params.id, req.ip, JSON.stringify({ changes: req.body })]
    );

    logger.info('Report updated', { reportId: req.params.id, userId: req.user.id, changes: Object.keys(req.body) });

    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/reports/:id - admin only
router.delete('/:id', authenticate, requireAdmin, [
  param('id').isInt({ min: 1 }).withMessage('Invalid report ID')
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const result = await query('DELETE FROM reports WHERE id = $1 RETURNING id, title', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Report not found.' });

    await query(
      'INSERT INTO audit_logs (user_id, action, resource, resource_id, ip_address) VALUES ($1, $2, $3, $4, $5)',
      [req.user.id, 'DELETE_REPORT', 'reports', req.params.id, req.ip]
    );

    logger.info('Report deleted', { reportId: req.params.id, userId: req.user.id });

    res.json({ message: 'Report deleted successfully.' });
  } catch (err) {
    next(err);
  }
});

// GET /api/reports/:id/messages - get chat messages
router.get('/:id/messages', authenticate, [
  param('id').isInt({ min: 1 }).withMessage('Invalid report ID')
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    // Verify access to report
    const reportResult = await query('SELECT reporter_id FROM reports WHERE id = $1', [req.params.id]);
    if (reportResult.rows.length === 0) return res.status(404).json({ error: 'Report not found.' });

    const report = reportResult.rows[0];
    if (req.user.role !== 'admin' && req.user.role !== 'super_admin' && report.reporter_id !== req.user.id) {
      return res.status(403).json({ error: 'Forbidden.' });
    }

    const result = await query(
      `SELECT m.id, m.content, m.created_at, u.username, u.role
       FROM messages m
       JOIN users u ON m.user_id = u.id
       WHERE m.report_id = $1
       ORDER BY m.created_at ASC`,
      [req.params.id]
    );

    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
