import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../utils/api';
import PwStrengthBar, { calcStrength } from '../components/PwStrengthBar';
import './AuthPages.css';

export default function RegisterPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '', confirmPassword: '', username: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleChange = e => setForm(f => ({ ...f, [e.target.name]: e.target.value }));

  const handleSubmit = async e => {
    e.preventDefault();
    setError('');
    if (form.username.length < 3) {
      setError('ชื่อผู้ใช้ต้องมีอย่างน้อย 3 ตัวอักษร'); return;
    }
    if (calcStrength(form.password) < 4) {
      setError('รหัสผ่านต้องมีครบทุกเงื่อนไข: ≥8 ตัว, ตัวพิมพ์ใหญ่, ตัวเลข, อักขระพิเศษ'); return;
    }
    if (form.password !== form.confirmPassword) {
      setError('รหัสผ่านทั้งสองช่องไม่ตรงกัน'); return;
    }
    setLoading(true);
    try {
      const res = await api.post('/auth/register', {
        email: form.email,
        password: form.password,
        username: form.username
      });
      login(res.data.token, res.data.user);
      navigate('/dashboard');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const passwordsMatch = form.confirmPassword && form.password === form.confirmPassword;
  const passwordsMismatch = form.confirmPassword && form.password !== form.confirmPassword;

  return (
    <div className="auth-page">
      <div className="auth-bg"><div className="auth-grid" /><div className="auth-glow" /></div>
      <div className="auth-card fade-in">
        <div className="auth-logo">
          <span className="auth-logo-icon">⬡</span>
          <span className="auth-logo-text">VulnTrack</span>
        </div>
        <h1 className="auth-title">สมัครสมาชิก</h1>
        <p className="auth-subtitle">ลงทะเบียนเป็นนักวิจัยความปลอดภัย</p>

        {error && <div className="alert alert-error mb-4">⚠ {error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">ชื่อผู้ใช้</label>
            <input
              type="text" name="username" className="form-control"
              placeholder="your_handle"
              value={form.username} onChange={handleChange}
              required minLength={3} maxLength={50}
            />
          </div>

          <div className="form-group">
            <label className="form-label">อีเมล</label>
            <input
              type="email" name="email" className="form-control"
              placeholder="you@example.com"
              value={form.email} onChange={handleChange}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">รหัสผ่าน</label>
            <input
              type="password" name="password" className="form-control"
              placeholder="อย่างน้อย 8 ตัว, พิมพ์ใหญ่, ตัวเลข, อักขระพิเศษ"
              value={form.password} onChange={handleChange}
              required
            />
            {form.password && <PwStrengthBar password={form.password} />}
          </div>

          <div className="form-group">
            <label className="form-label">ยืนยันรหัสผ่าน</label>
            <input
              type="password" name="confirmPassword" className="form-control"
              placeholder="กรอกรหัสผ่านอีกครั้ง"
              value={form.confirmPassword} onChange={handleChange}
              required
              style={form.confirmPassword ? {
                borderColor: passwordsMatch ? 'var(--green)' : passwordsMismatch ? 'var(--red)' : undefined
              } : {}}
            />
            {passwordsMatch && (
              <span style={{ fontSize: 12, color: 'var(--green)', marginTop: 4, display: 'block' }}>
                ✓ รหัสผ่านตรงกัน
              </span>
            )}
            {passwordsMismatch && (
              <span className="form-error">รหัสผ่านไม่ตรงกัน</span>
            )}
          </div>

          <button
            type="submit"
            className="btn btn-primary w-full"
            style={{ justifyContent: 'center', marginTop: 8 }}
            disabled={loading}
          >
            {loading
              ? <><span className="spinner" style={{ width: 16, height: 16 }} /> กำลังสร้างบัญชี...</>
              : '→ สมัครสมาชิก'}
          </button>
        </form>

        <div className="auth-footer">มีบัญชีอยู่แล้ว? <Link to="/login">เข้าสู่ระบบ</Link></div>
      </div>
    </div>
  );
}
