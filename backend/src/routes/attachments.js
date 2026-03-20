const express = require('express');
const path = require('path');
const fs = require('fs');
const { param, validationResult } = require('express-validator');
const { query } = require('../models/db');
const { authenticate } = require('../middleware/auth');
const { upload, UPLOAD_DIR } = require('../middleware/upload');
const logger = require('../utils/logger');

const router = express.Router();

// POST /api/reports/:id/attachments — upload images (max 5)
// Multer error handler wrapper
const multerUpload = (req, res, next) => {
  upload.array('images', 5)(req, res, (err) => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: 'ไฟล์ขนาดใหญ่เกินไป สูงสุด 5MB ต่อไฟล์' });
    if (err.code === 'LIMIT_FILE_COUNT') return res.status(400).json({ error: 'อัปโหลดได้สูงสุด 5 ไฟล์ต่อครั้ง' });
    if (err.code === 'LIMIT_UNEXPECTED_FILE') return res.status(400).json({ error: 'ชื่อ field ไม่ถูกต้อง ใช้ "images"' });
    return res.status(400).json({ error: err.message || 'อัปโหลดไฟล์ไม่สำเร็จ' });
  });
};

router.post(
  '/:id/attachments',
  authenticate,
  (req, res, next) => {
    const reportId = parseInt(req.params.id);
    if (!reportId || isNaN(reportId)) return res.status(400).json({ error: 'Invalid report ID.' });
    next();
  },
  multerUpload,
  async (req, res, next) => {
    try {
      const reportId = parseInt(req.params.id);

      // Verify report exists and user has access
      const reportResult = await query('SELECT reporter_id, status FROM reports WHERE id = $1', [reportId]);
      if (reportResult.rows.length === 0) {
        // Clean up any uploaded files
        if (req.files) req.files.forEach(f => fs.unlink(f.path, () => {}));
        return res.status(404).json({ error: 'Report not found.' });
      }

      const report = reportResult.rows[0];
      if (req.user.role !== 'admin' && req.user.role !== 'super_admin' && report.reporter_id !== req.user.id) {
        if (req.files) req.files.forEach(f => fs.unlink(f.path, () => {}));
        return res.status(403).json({ error: 'Forbidden.' });
      }

      if (!req.files || req.files.length === 0) {
        return res.status(400).json({ error: 'No files uploaded.' });
      }

      // Check total attachments limit per report (max 10 total)
      const countResult = await query(
        'SELECT COUNT(*) FROM report_attachments WHERE report_id = $1',
        [reportId]
      );
      const currentCount = parseInt(countResult.rows[0].count);
      if (currentCount + req.files.length > 10) {
        req.files.forEach(f => fs.unlink(f.path, () => {}));
        return res.status(400).json({ error: `Too many attachments. Max 10 per report (currently ${currentCount}).` });
      }

      // Insert records
      const inserted = [];
      for (const file of req.files) {
        const result = await query(
          `INSERT INTO report_attachments (report_id, uploaded_by, filename, original_name, mimetype, size)
           VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
          [reportId, req.user.id, file.filename, file.originalname, file.mimetype, file.size]
        );
        inserted.push(result.rows[0]);
      }

      logger.info('Attachments uploaded', { reportId, userId: req.user.id, count: inserted.length });

      res.status(201).json(inserted);
    } catch (err) {
      // Clean up files on error
      if (req.files) req.files.forEach(f => fs.unlink(f.path, () => {}));
      next(err);
    }
  }
);

// GET /api/reports/:id/attachments — list attachments
router.get('/:id/attachments', authenticate, [
  param('id').isInt({ min: 1 })
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const reportId = parseInt(req.params.id);

    const reportResult = await query('SELECT reporter_id FROM reports WHERE id = $1', [reportId]);
    if (reportResult.rows.length === 0) return res.status(404).json({ error: 'Report not found.' });

    if (req.user.role !== 'admin' && req.user.role !== 'super_admin' && reportResult.rows[0].reporter_id !== req.user.id) {
      return res.status(403).json({ error: 'Forbidden.' });
    }

    const result = await query(
      `SELECT ra.id, ra.filename, ra.original_name, ra.mimetype, ra.size, ra.created_at,
              u.username as uploaded_by_name
       FROM report_attachments ra
       JOIN users u ON ra.uploaded_by = u.id
       WHERE ra.report_id = $1
       ORDER BY ra.created_at ASC`,
      [reportId]
    );

    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

// GET /api/attachments/:filename — serve image file (authenticated)
router.get('/file/:filename', authenticate, async (req, res, next) => {
  try {
    const filename = req.params.filename;

    // Validate filename — only allow hex + extension (our generated names)
    if (!/^[a-f0-9]{32}\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(filename)) {
      return res.status(400).json({ error: 'Invalid filename.' });
    }

    // Check DB — verify the requesting user can access this file
    const result = await query(
      `SELECT ra.report_id, r.reporter_id
       FROM report_attachments ra
       JOIN reports r ON ra.report_id = r.id
       WHERE ra.filename = $1`,
      [filename]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'File not found.' });
    }

    const { reporter_id } = result.rows[0];
    if (req.user.role !== 'admin' && req.user.role !== 'super_admin' && reporter_id !== req.user.id) {
      return res.status(403).json({ error: 'Forbidden.' });
    }

    const filePath = path.join(UPLOAD_DIR, filename);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found on disk.' });
    }

    // Security: prevent path traversal
    const resolvedPath = path.resolve(filePath);
    const resolvedUploadDir = path.resolve(UPLOAD_DIR);
    if (!resolvedPath.startsWith(resolvedUploadDir)) {
      return res.status(400).json({ error: 'Invalid path.' });
    }

    // Set security headers for served images
    res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'");
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.sendFile(resolvedPath);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/reports/:id/attachments/:attachmentId — delete attachment
router.delete('/:id/attachments/:attachmentId', authenticate, async (req, res, next) => {
  try {
    const reportId = parseInt(req.params.id);
    const attachmentId = parseInt(req.params.attachmentId);

    if (isNaN(reportId) || isNaN(attachmentId)) {
      return res.status(400).json({ error: 'Invalid ID.' });
    }

    const result = await query(
      `SELECT ra.*, r.reporter_id FROM report_attachments ra
       JOIN reports r ON ra.report_id = r.id
       WHERE ra.id = $1 AND ra.report_id = $2`,
      [attachmentId, reportId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Attachment not found.' });
    }

    const attachment = result.rows[0];

    // Only uploader or admin can delete
    if (req.user.role !== 'admin' && req.user.role !== 'super_admin' && attachment.reporter_id !== req.user.id) {
      return res.status(403).json({ error: 'Forbidden.' });
    }

    // Delete from DB
    await query('DELETE FROM report_attachments WHERE id = $1', [attachmentId]);

    // Delete from disk
    const filePath = path.join(UPLOAD_DIR, attachment.filename);
    fs.unlink(filePath, (err) => {
      if (err) logger.warn('Failed to delete file from disk', { filename: attachment.filename });
    });

    logger.info('Attachment deleted', { attachmentId, reportId, userId: req.user.id });
    res.json({ message: 'Attachment deleted.' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
