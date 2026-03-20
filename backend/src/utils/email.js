const nodemailer = require('nodemailer');
const logger = require('./logger');

// Create transporter — reads from env vars
// In dev/Docker: uses Mailpit SMTP (localhost:1025)
// In production: set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS
const createTransporter = () => {
  return nodemailer.createTransporter({
    host: process.env.SMTP_HOST || 'mailpit',
    port: parseInt(process.env.SMTP_PORT || '1025'),
    secure: false,
    auth: process.env.SMTP_USER ? {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    } : undefined,
    ignoreTLS: true
  });
};

const SITE_URL = process.env.SITE_URL || 'http://localhost:3000';
const FROM_EMAIL = process.env.FROM_EMAIL || 'noreply@vulntrack.local';

const sendVerificationEmail = async (toEmail, username, token) => {
  const verifyUrl = `${SITE_URL}/verify-email?token=${token}`;
  const transporter = createTransporter();

  try {
    await transporter.sendMail({
      from: `"VulnTrack" <${FROM_EMAIL}>`,
      to: toEmail,
      subject: 'ยืนยันอีเมลของคุณ — VulnTrack',
      html: `
        <!DOCTYPE html>
        <html>
        <head><meta charset="UTF-8"></head>
        <body style="font-family: 'Segoe UI', sans-serif; background: #0a0e1a; color: #e8f0fe; margin: 0; padding: 40px 20px;">
          <div style="max-width: 520px; margin: 0 auto; background: #141d35; border: 1px solid #1e2d4a; border-radius: 12px; padding: 40px;">
            <div style="font-family: monospace; font-size: 22px; color: #00d4ff; margin-bottom: 24px;">⬡ VulnTrack</div>
            <h2 style="color: #e8f0fe; margin: 0 0 12px;">สวัสดี, ${username}!</h2>
            <p style="color: #8899bb; line-height: 1.6; margin: 0 0 28px;">
              ขอบคุณที่สมัครสมาชิก VulnTrack<br>
              กรุณาคลิกปุ่มด้านล่างเพื่อยืนยันอีเมลของคุณ
            </p>
            <a href="${verifyUrl}"
               style="display: inline-block; background: #00d4ff; color: #000; font-weight: 700;
                      padding: 14px 32px; border-radius: 8px; text-decoration: none; font-size: 15px;">
              ยืนยันอีเมล →
            </a>
            <p style="color: #4a5a7a; font-size: 12px; margin: 28px 0 0; font-family: monospace;">
              ลิงก์นี้จะหมดอายุใน 24 ชั่วโมง<br>
              หากคุณไม่ได้สมัครสมาชิก ไม่ต้องทำอะไร
            </p>
            <div style="margin-top: 16px; padding: 12px; background: #0f1628; border-radius: 6px; font-size: 11px; color: #4a5a7a; font-family: monospace; word-break: break-all;">
              ${verifyUrl}
            </div>
          </div>
        </body>
        </html>
      `,
      text: `ยืนยันอีเมล VulnTrack\n\nคลิกลิงก์นี้: ${verifyUrl}\n\nลิงก์หมดอายุใน 24 ชั่วโมง`
    });
    logger.info('Verification email sent', { to: toEmail });
  } catch (err) {
    logger.error('Failed to send verification email', { error: err.message, to: toEmail });
    throw err;
  }
};

const sendPasswordResetEmail = async (toEmail, username, token) => {
  const resetUrl = `${SITE_URL}/reset-password?token=${token}`;
  const transporter = createTransporter();

  try {
    await transporter.sendMail({
      from: `"VulnTrack" <${FROM_EMAIL}>`,
      to: toEmail,
      subject: 'รีเซ็ตรหัสผ่าน — VulnTrack',
      html: `
        <!DOCTYPE html>
        <html>
        <head><meta charset="UTF-8"></head>
        <body style="font-family: 'Segoe UI', sans-serif; background: #0a0e1a; color: #e8f0fe; margin: 0; padding: 40px 20px;">
          <div style="max-width: 520px; margin: 0 auto; background: #141d35; border: 1px solid #1e2d4a; border-radius: 12px; padding: 40px;">
            <div style="font-family: monospace; font-size: 22px; color: #00d4ff; margin-bottom: 24px;">⬡ VulnTrack</div>
            <h2 style="color: #e8f0fe; margin: 0 0 12px;">รีเซ็ตรหัสผ่าน</h2>
            <p style="color: #8899bb; line-height: 1.6; margin: 0 0 8px;">สวัสดี, ${username}</p>
            <p style="color: #8899bb; line-height: 1.6; margin: 0 0 28px;">
              คุณได้ขอรีเซ็ตรหัสผ่าน กรุณาคลิกปุ่มด้านล่าง<br>
              หากไม่ได้ขอ ลิงก์นี้จะหมดอายุใน 1 ชั่วโมงและไม่มีผลกระทบใดๆ
            </p>
            <a href="${resetUrl}"
               style="display: inline-block; background: #ff4466; color: #fff; font-weight: 700;
                      padding: 14px 32px; border-radius: 8px; text-decoration: none; font-size: 15px;">
              รีเซ็ตรหัสผ่าน →
            </a>
            <p style="color: #4a5a7a; font-size: 12px; margin: 28px 0 0; font-family: monospace;">
              ลิงก์นี้จะหมดอายุใน 1 ชั่วโมง และใช้ได้เพียงครั้งเดียว
            </p>
          </div>
        </body>
        </html>
      `,
      text: `รีเซ็ตรหัสผ่าน VulnTrack\n\nคลิกลิงก์นี้: ${resetUrl}\n\nลิงก์หมดอายุใน 1 ชั่วโมง`
    });
    logger.info('Password reset email sent', { to: toEmail });
  } catch (err) {
    logger.error('Failed to send password reset email', { error: err.message, to: toEmail });
    throw err;
  }
};

module.exports = { sendVerificationEmail, sendPasswordResetEmail };
