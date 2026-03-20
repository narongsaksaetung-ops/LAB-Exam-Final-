import React from 'react';
import { Link } from 'react-router-dom';
import './AuthPages.css';

// Email verification is not required in this system.
// Users can log in immediately after registration.
export default function VerifyEmailPage() {
  return (
    <div className="auth-page">
      <div className="auth-bg"><div className="auth-grid" /><div className="auth-glow" /></div>
      <div className="auth-card fade-in">
        <div className="auth-logo">
          <span className="auth-logo-icon">⬡</span>
          <span className="auth-logo-text">VulnTrack</span>
        </div>
        <div style={{ textAlign: 'center', padding: '8px 0 16px' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
          <h2 className="auth-title">บัญชีของคุณพร้อมใช้งาน</h2>
          <p className="text-secondary fs-13" style={{ marginTop: 8, marginBottom: 24 }}>
            ระบบนี้ไม่จำเป็นต้องยืนยันอีเมล คุณสามารถเข้าสู่ระบบได้ทันที
          </p>
          <Link to="/login" className="btn btn-primary w-full" style={{ justifyContent: 'center' }}>
            → เข้าสู่ระบบ
          </Link>
        </div>
      </div>
    </div>
  );
}
