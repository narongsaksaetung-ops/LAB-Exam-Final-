import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../utils/api';
import './AuthPages.css';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async e => {
    e.preventDefault();
    setError('');
    if (!email) { setError('กรุณากรอกอีเมล'); return; }
    setLoading(true);
    try {
      await api.post('/auth/forgot-password', { email });
      setSent(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-bg"><div className="auth-grid" /><div className="auth-glow" /></div>
      <div className="auth-card fade-in">
        <div className="auth-logo">
          <span className="auth-logo-icon">⬡</span>
          <span className="auth-logo-text">VulnTrack</span>
        </div>
        <h1 className="auth-title">ลืมรหัสผ่าน</h1>
        <p className="auth-subtitle">กรอกอีเมลเพื่อรับลิงก์รีเซ็ตรหัสผ่าน</p>

        {sent ? (
          <div>
            <div className="alert alert-success mb-4">
              ✓ ส่งคำขอแล้ว — หากอีเมลนี้ถูกลงทะเบียนไว้ คุณจะได้รับลิงก์รีเซ็ตรหัสผ่านทางอีเมล
            </div>
            <p className="text-secondary fs-13" style={{ marginBottom: 20, lineHeight: 1.6 }}>
              กรุณาตรวจสอบกล่องจดหมายและโฟลเดอร์ Spam ลิงก์จะหมดอายุใน 1 ชั่วโมง
            </p>
            <button className="btn btn-secondary w-full" style={{ justifyContent: 'center' }}
              onClick={() => { setSent(false); setEmail(''); }}>
              ส่งอีกครั้ง
            </button>
          </div>
        ) : (
          <>
            {error && <div className="alert alert-error mb-4">⚠ {error}</div>}
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label className="form-label">อีเมล</label>
                <input
                  type="email"
                  className="form-control"
                  placeholder="your@email.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  autoFocus
                />
              </div>
              <button
                type="submit"
                className="btn btn-primary w-full"
                style={{ justifyContent: 'center', marginTop: 8 }}
                disabled={loading}
              >
                {loading
                  ? <><span className="spinner" style={{ width: 16, height: 16 }} /> กำลังส่ง...</>
                  : '→ ส่งลิงก์รีเซ็ต'}
              </button>
            </form>
          </>
        )}

        <div className="auth-footer">
          <Link to="/login">← กลับหน้าเข้าสู่ระบบ</Link>
        </div>
      </div>
    </div>
  );
}
