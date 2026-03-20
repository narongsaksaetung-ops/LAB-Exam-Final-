import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../utils/api';
import './AuthPages.css';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleChange = e => setForm(f => ({ ...f, [e.target.name]: e.target.value }));

  const handleSubmit = async e => {
    e.preventDefault(); setError(''); setLoading(true);
    try {
      const res = await api.post('/auth/login', form);
      login(res.data.token, res.data.user);
      navigate('/dashboard');
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
        <h1 className="auth-title">เข้าสู่ระบบ</h1>
        <p className="auth-subtitle">แพลตฟอร์มรายงานช่องโหว่ความปลอดภัย</p>
        {error && <div className="alert alert-error mb-4">⚠ {error}</div>}
        <form onSubmit={handleSubmit} autoComplete="off">
          <div className="form-group">
            <label className="form-label">อีเมล</label>
            <input type="email" name="email" className="form-control" placeholder="researcher@example.com"
              value={form.email} onChange={handleChange} required autoFocus />
          </div>
          <div className="form-group">
            <label className="form-label">รหัสผ่าน</label>
            <input type="password" name="password" className="form-control" placeholder="••••••••"
              value={form.password} onChange={handleChange} required />
            <div style={{ textAlign: 'right', marginTop: 6 }}>
              <Link to="/forgot-password" style={{ fontSize: 12, color: 'var(--text-muted)' }}>ลืมรหัสผ่าน?</Link>
            </div>
          </div>
          <button type="submit" className="btn btn-primary w-full" style={{ justifyContent: 'center', marginTop: 8 }} disabled={loading}>
            {loading ? <><span className="spinner" style={{ width: 16, height: 16 }} /> กำลังตรวจสอบ...</> : '→ เข้าสู่ระบบ'}
          </button>
        </form>
        <div className="auth-footer">ยังไม่มีบัญชี? <Link to="/register">สมัครสมาชิก</Link></div>
      </div>
    </div>
  );
}
