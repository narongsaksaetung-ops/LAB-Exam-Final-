import React, { useState } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import api from '../utils/api';
import PwStrengthBar, { calcStrength } from '../components/PwStrengthBar';
import './AuthPages.css';

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token');

  const [form, setForm] = useState({ password: '', confirm: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  if (!token) {
    return (
      <div className="auth-page">
        <div className="auth-bg"><div className="auth-grid" /><div className="auth-glow" /></div>
        <div className="auth-card fade-in">
          <div className="auth-logo"><span className="auth-logo-icon">⬡</span><span className="auth-logo-text">VulnTrack</span></div>
          <div className="alert alert-error mb-4">⚠ ลิงก์รีเซ็ตไม่ถูกต้อง</div>
          <p className="text-secondary fs-13" style={{ marginBottom: 16 }}>
            ลิงก์นี้ไม่ถูกต้องหรือหมดอายุแล้ว กรุณาขอลิงก์รีเซ็ตใหม่
          </p>
          <button className="btn btn-primary w-full" style={{ justifyContent: 'center' }}
            onClick={() => navigate('/forgot-password')}>ขอลิงก์ใหม่</button>
        </div>
      </div>
    );
  }

  const handleSubmit = async e => {
    e.preventDefault();
    setError('');
    if (form.password !== form.confirm) { setError('รหัสผ่านทั้งสองช่องไม่ตรงกัน'); return; }
    if (calcStrength(form.password) < 4) {
      setError('รหัสผ่านต้องมีครบทุกเงื่อนไข: ≥8 ตัว, ตัวพิมพ์ใหญ่, ตัวเลข, อักขระพิเศษ');
      return;
    }
    setLoading(true);
    try {
      await api.post('/auth/reset-password', { token, password: form.password });
      setSuccess(true);
      setTimeout(() => navigate('/login'), 2500);
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
        <div className="auth-logo"><span className="auth-logo-icon">⬡</span><span className="auth-logo-text">VulnTrack</span></div>
        <h1 className="auth-title">ตั้งรหัสผ่านใหม่</h1>
        <p className="auth-subtitle">กรอกรหัสผ่านใหม่ของคุณ</p>
        {success ? (
          <div className="alert alert-success mb-4">✓ รีเซ็ตรหัสผ่านสำเร็จ! กำลังนำไปหน้าเข้าสู่ระบบ...</div>
        ) : (
          <>
            {error && <div className="alert alert-error mb-4">⚠ {error}</div>}
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label className="form-label">รหัสผ่านใหม่</label>
                <input type="password" className="form-control"
                  placeholder="อย่างน้อย 8 ตัว, พิมพ์ใหญ่, ตัวเลข, อักขระพิเศษ"
                  value={form.password}
                  onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                  required autoFocus />
                {form.password && <PwStrengthBar password={form.password} />}
              </div>
              <div className="form-group">
                <label className="form-label">ยืนยันรหัสผ่านใหม่</label>
                <input type="password" className="form-control" placeholder="กรอกรหัสผ่านอีกครั้ง"
                  value={form.confirm}
                  onChange={e => setForm(f => ({ ...f, confirm: e.target.value }))}
                  required />
                {form.confirm && form.password !== form.confirm && (
                  <span className="form-error">รหัสผ่านไม่ตรงกัน</span>
                )}
              </div>
              <button type="submit" className="btn btn-primary w-full"
                style={{ justifyContent: 'center', marginTop: 8 }}
                disabled={loading || !form.password || form.password !== form.confirm}>
                {loading
                  ? <><span className="spinner" style={{ width: 16, height: 16 }} /> กำลังบันทึก...</>
                  : '🔑 ตั้งรหัสผ่านใหม่'}
              </button>
            </form>
          </>
        )}
        <div className="auth-footer"><Link to="/login">← กลับหน้าเข้าสู่ระบบ</Link></div>
      </div>
    </div>
  );
}
