import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../utils/api';
import PwStrengthBar, { calcStrength } from '../components/PwStrengthBar';

export default function ProfilePage() {
  const { user } = useAuth();
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleSubmit = async e => {
    e.preventDefault();
    setError(''); setSuccess('');
    if (form.newPassword !== form.confirm) { setError('รหัสผ่านใหม่ทั้งสองช่องไม่ตรงกัน'); return; }
    if (calcStrength(form.newPassword) < 4) {
      setError('รหัสผ่านต้องมีครบทุกเงื่อนไข: ≥8 ตัว, ตัวพิมพ์ใหญ่, ตัวเลข, อักขระพิเศษ');
      return;
    }
    setLoading(true);
    try {
      const res = await api.patch('/auth/change-password', {
        currentPassword: form.currentPassword,
        newPassword: form.newPassword
      });
      setSuccess(res.data.message);
      setForm({ currentPassword: '', newPassword: '', confirm: '' });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fade-in" style={{ maxWidth: 520 }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 6, letterSpacing: '-0.5px' }}>โปรไฟล์ของฉัน</h1>
      <p className="text-secondary fs-13" style={{ marginBottom: 28 }}>จัดการข้อมูลบัญชีและรหัสผ่าน</p>

      {/* User info */}
      <div className="card" style={{ marginBottom: 24 }}>
        <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase',
          letterSpacing: '0.8px', fontFamily: 'var(--font-mono)', marginBottom: 16 }}>ข้อมูลบัญชี</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px',
              color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginBottom: 4 }}>ชื่อผู้ใช้</div>
            <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{user?.username}</div>
          </div>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px',
              color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginBottom: 4 }}>บทบาท</div>
            <span className={`badge badge-${user?.role}`}>
              {user?.role === 'super_admin' ? 'Super Admin'
                : user?.role === 'admin' ? 'ผู้ดูแล'
                : user?.role === 'researcher' ? 'นักวิจัย'
                : 'ผู้ใช้ทั่วไป'}
            </span>
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px',
              color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginBottom: 4 }}>อีเมล</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-secondary)' }}>{user?.email}</div>
          </div>
        </div>
      </div>

      {/* Change password */}
      <div className="card">
        <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase',
          letterSpacing: '0.8px', fontFamily: 'var(--font-mono)', marginBottom: 20 }}>เปลี่ยนรหัสผ่าน</h3>
        {error && <div className="alert alert-error mb-4">⚠ {error}</div>}
        {success && <div className="alert alert-success mb-4">✓ {success}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">รหัสผ่านปัจจุบัน</label>
            <input type="password" className="form-control" placeholder="••••••••"
              value={form.currentPassword}
              onChange={e => setForm(f => ({ ...f, currentPassword: e.target.value }))} required />
          </div>
          <div className="form-group">
            <label className="form-label">รหัสผ่านใหม่</label>
            <input type="password" className="form-control"
              placeholder="อย่างน้อย 8 ตัว, พิมพ์ใหญ่, ตัวเลข, อักขระพิเศษ"
              value={form.newPassword}
              onChange={e => setForm(f => ({ ...f, newPassword: e.target.value }))} required />
            {form.newPassword && <PwStrengthBar password={form.newPassword} />}
          </div>
          <div className="form-group">
            <label className="form-label">ยืนยันรหัสผ่านใหม่</label>
            <input type="password" className="form-control" placeholder="กรอกรหัสผ่านใหม่อีกครั้ง"
              value={form.confirm}
              onChange={e => setForm(f => ({ ...f, confirm: e.target.value }))} required />
            {form.confirm && form.newPassword !== form.confirm && (
              <span className="form-error">รหัสผ่านไม่ตรงกัน</span>
            )}
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: 8, borderTop: '1px solid var(--border)' }}>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? <><span className="spinner" style={{ width: 16, height: 16 }} /> กำลังบันทึก...</> : '🔑 เปลี่ยนรหัสผ่าน'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
