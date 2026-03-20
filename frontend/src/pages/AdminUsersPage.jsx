import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../utils/api';
import { format } from 'date-fns';
import { th } from 'date-fns/locale';
import PwStrengthBar, { calcStrength } from '../components/PwStrengthBar';
import './AdminUsersPage.css';

const ROLE_LABEL = {
  super_admin: '⬡ Super Admin',
  admin:       '⬡ ผู้ดูแล',
  researcher:  '◈ นักวิจัย',
  user:        '◉ ผู้ใช้ทั่วไป',
};

const ROLE_BADGE = {
  super_admin: 'badge-super-admin',
  admin:       'badge-admin',
  researcher:  'badge-researcher',
  user:        'badge-user',
};

export default function AdminUsersPage() {
  const { user: currentUser, isSuperAdmin } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [deleteModal, setDeleteModal]   = useState(null);
  const [resetPwModal, setResetPwModal] = useState(null);
  const [roleModal, setRoleModal]       = useState(null);

  const [newPw, setNewPw]               = useState('');
  const [newPwConfirm, setNewPwConfirm] = useState('');
  const [pwError, setPwError]           = useState('');
  const [pwLoading, setPwLoading]       = useState(false);

  useEffect(() => { loadUsers(); }, []);

  const loadUsers = () => {
    setLoading(true);
    api.get('/admin/users')
      .then(res => setUsers(res.data))
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  };

  const flash = (msg, isErr = false) => {
    if (isErr) { setError(msg); }
    else { setSuccess(msg); setTimeout(() => setSuccess(''), 3000); }
  };

  // ── Role change ──────────────────────────────────────────────────────────────
  const confirmRoleChange = (user, newRole) => {
    if (newRole === user.role) return;
    setRoleModal({ user, newRole });
  };

  const doRoleChange = async () => {
    const { user, newRole } = roleModal;
    setRoleModal(null);
    try {
      const res = await api.patch(`/admin/users/${user.id}/role`, { role: newRole });
      setUsers(prev => prev.map(u => u.id === user.id ? { ...u, role: res.data.role } : u));
      flash(`เปลี่ยนบทบาทของ "${user.username}" เป็น "${ROLE_LABEL[newRole]}" สำเร็จ`);
    } catch (err) { flash(err.message, true); }
  };

  // ── Delete user ──────────────────────────────────────────────────────────────
  const doDelete = async () => {
    const user = deleteModal;
    setDeleteModal(null);
    try {
      await api.delete(`/admin/users/${user.id}`);
      setUsers(prev => prev.filter(u => u.id !== user.id));
      flash(`ลบผู้ใช้ "${user.username}" สำเร็จ`);
    } catch (err) { flash(err.message, true); }
  };

  // ── Reset password ───────────────────────────────────────────────────────────
  const openResetPw = (user) => {
    setResetPwModal(user);
    setNewPw(''); setNewPwConfirm(''); setPwError('');
  };

  const doResetPw = async () => {
    setPwError('');
    if (calcStrength(newPw) < 4) {
      setPwError('รหัสผ่านต้องมีครบทุกเงื่อนไข: ≥8 ตัว, ตัวพิมพ์ใหญ่, ตัวเลข, อักขระพิเศษ');
      return;
    }
    if (newPw !== newPwConfirm) { setPwError('รหัสผ่านไม่ตรงกัน'); return; }
    setPwLoading(true);
    try {
      await api.patch(`/admin/users/${resetPwModal.id}/password`, { newPassword: newPw });
      setResetPwModal(null);
      flash(`รีเซ็ตรหัสผ่านของ "${resetPwModal.username}" สำเร็จ`);
    } catch (err) { setPwError(err.message); }
    finally { setPwLoading(false); }
  };

  // ── Stats ────────────────────────────────────────────────────────────────────
  const adminCount      = users.filter(u => u.role === 'admin').length;
  const researcherCount = users.filter(u => u.role === 'researcher').length;
  const userCount       = users.filter(u => u.role === 'user').length;

  // Build role options for dropdown based on current admin's role
  const getRoleOptions = (targetUser) => {
    if (isSuperAdmin) {
      // Super admin can set: user, researcher, admin (but not super_admin)
      return [
        { value: 'user',       label: 'ผู้ใช้ทั่วไป' },
        { value: 'researcher', label: 'นักวิจัย' },
        { value: 'admin',      label: 'ผู้ดูแล' },
      ];
    }
    // Regular admin can only toggle user <-> researcher
    return [
      { value: 'user',       label: 'ผู้ใช้ทั่วไป' },
      { value: 'researcher', label: 'นักวิจัย' },
    ];
  };

  return (
    <div className="admin-users fade-in">
      <div className="au-header">
        <div>
          <h1 className="page-title">จัดการผู้ใช้</h1>
          <p className="text-secondary fs-13" style={{ marginTop: 4 }}>
            {isSuperAdmin
              ? 'Super Admin — จัดการบัญชีทั้งหมดรวมถึงผู้ดูแลระบบ'
              : 'จัดการบัญชีผู้ใช้และนักวิจัย'}
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="au-stats">
        <div className="au-stat">
          <span className="au-stat-num">{users.length}</span>
          <span className="au-stat-lbl">ทั้งหมด</span>
        </div>
        {isSuperAdmin && (
          <div className="au-stat au-stat-admin">
            <span className="au-stat-num" style={{ color: 'var(--accent)' }}>{adminCount}</span>
            <span className="au-stat-lbl">ผู้ดูแล</span>
          </div>
        )}
        <div className="au-stat au-stat-res">
          <span className="au-stat-num" style={{ color: 'var(--green)' }}>{researcherCount}</span>
          <span className="au-stat-lbl">นักวิจัย</span>
        </div>
        <div className="au-stat">
          <span className="au-stat-num" style={{ color: 'var(--text-muted)' }}>{userCount}</span>
          <span className="au-stat-lbl">ผู้ใช้ทั่วไป</span>
        </div>
      </div>

      {error   && <div className="alert alert-error mb-4">⚠ {error}</div>}
      {success && <div className="alert alert-success mb-4">✓ {success}</div>}

      {/* Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <div className="flex-center" style={{ padding: 60 }}>
            <div className="spinner" style={{ width: 32, height: 32 }} />
          </div>
        ) : users.length === 0 ? (
          <div className="flex-center" style={{ padding: 60, color: 'var(--text-muted)' }}>ไม่พบผู้ใช้</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>ผู้ใช้</th>
                  <th>อีเมล</th>
                  <th>บทบาท</th>
                  <th>เปลี่ยนบทบาท</th>
                  <th>วันที่สมัคร</th>
                  <th>จัดการ</th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => {
                  const isMe = u.id === currentUser.id;
                  // Can manage = not self, not super_admin, and if regular admin then target must not be admin
                  const canManage = !isMe && !u.is_super_admin &&
                    !(currentUser.role === 'admin' && u.role === 'admin');
                  const roleOpts = getRoleOptions(u);
                  return (
                    <tr key={u.id}>
                      <td>
                        <div className="au-user-cell">
                          <div className={`au-avatar ${(u.role === 'admin' || u.role === 'super_admin') ? 'au-avatar-admin' : ''}`}>
                            {u.username[0].toUpperCase()}
                          </div>
                          <div>
                            <div className="au-username">
                              {u.username}
                              {isMe && <span className="au-you-tag">(คุณ)</span>}
                              {u.role === 'admin' && isSuperAdmin && (
                                <span className="au-you-tag" style={{ color: 'var(--accent)' }}> Admin</span>
                              )}
                            </div>
                            <div className="au-userid text-mono">
                              #{u.id} · {u.report_count || 0} รายงาน
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="text-secondary fs-13 text-mono">{u.email}</td>
                      <td>
                        <span className={`badge ${ROLE_BADGE[u.role] || 'badge-user'}`}>
                          {ROLE_LABEL[u.role] || u.role}
                        </span>
                      </td>
                      <td>
                        {canManage ? (
                          <select
                            className="au-role-select"
                            value={u.role}
                            onChange={e => confirmRoleChange(u, e.target.value)}
                          >
                            {roleOpts.map(opt => (
                              <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                          </select>
                        ) : (
                          <span className="text-muted fs-12">—</span>
                        )}
                      </td>
                      <td className="text-muted fs-12 text-mono">
                        {format(new Date(u.created_at), 'd MMM yyyy', { locale: th })}
                      </td>
                      <td>
                        {canManage ? (
                          <div className="flex gap-2">
                            <button className="btn btn-secondary btn-sm" onClick={() => openResetPw(u)}>
                              🔑 รีเซ็ต
                            </button>
                            <button className="btn btn-danger btn-sm" onClick={() => setDeleteModal(u)}>
                              ลบ
                            </button>
                          </div>
                        ) : (
                          <span className="text-muted fs-12">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Role change confirmation modal ── */}
      {roleModal && (
        <div className="modal-overlay" onClick={() => setRoleModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3 className="modal-title">เปลี่ยนบทบาท</h3>
            <p className="text-secondary" style={{ marginTop: 8, lineHeight: 1.6 }}>
              ต้องการเปลี่ยนบทบาทของ{' '}
              <strong style={{ color: 'var(--text-primary)' }}>{roleModal.user.username}</strong>{' '}
              จาก <span className={`badge ${ROLE_BADGE[roleModal.user.role]}`} style={{ verticalAlign: 'middle' }}>
                {ROLE_LABEL[roleModal.user.role]}
              </span>{' '}
              เป็น{' '}
              <span className={`badge ${ROLE_BADGE[roleModal.newRole]}`} style={{ verticalAlign: 'middle' }}>
                {ROLE_LABEL[roleModal.newRole]}
              </span>?
            </p>
            {roleModal.newRole === 'admin' && (
              <div className="alert alert-info" style={{ marginTop: 12, fontSize: 13 }}>
                ⚠ ผู้ดูแลจะสามารถเข้าถึงรายงานทั้งหมดและจัดการผู้ใช้ได้ การเปลี่ยนแปลงมีผลทันที
              </div>
            )}
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setRoleModal(null)}>ยกเลิก</button>
              <button className="btn btn-primary" onClick={doRoleChange}>ยืนยัน</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete confirmation modal ── */}
      {deleteModal && (
        <div className="modal-overlay" onClick={() => setDeleteModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3 className="modal-title">ลบผู้ใช้</h3>
            <p className="text-secondary" style={{ marginTop: 8, lineHeight: 1.6 }}>
              ต้องการลบ{' '}
              <strong style={{ color: 'var(--text-primary)' }}>{deleteModal.username}</strong>{' '}
              ออกจากระบบ?
            </p>
            <p style={{ fontSize: 13, color: 'var(--red)', marginTop: 8 }}>
              รายงานและข้อความแชทของผู้ใช้นี้จะถูกลบทั้งหมด ไม่สามารถย้อนกลับได้
            </p>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setDeleteModal(null)}>ยกเลิก</button>
              <button className="btn btn-danger" onClick={doDelete}>ลบผู้ใช้</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Reset password modal ── */}
      {resetPwModal && (
        <div className="modal-overlay" onClick={() => setResetPwModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3 className="modal-title">🔑 รีเซ็ตรหัสผ่าน</h3>
            <p className="text-secondary fs-13" style={{ marginTop: 4, marginBottom: 16 }}>
              ตั้งรหัสผ่านใหม่ให้{' '}
              <strong style={{ color: 'var(--accent)' }}>{resetPwModal.username}</strong>
            </p>
            {pwError && <div className="alert alert-error mb-4">⚠ {pwError}</div>}
            <div className="form-group">
              <label className="form-label">รหัสผ่านใหม่</label>
              <input
                type="password" className="form-control"
                placeholder="อย่างน้อย 8 ตัว, พิมพ์ใหญ่, ตัวเลข, อักขระพิเศษ"
                value={newPw} onChange={e => setNewPw(e.target.value)} autoFocus
              />
              {newPw && <PwStrengthBar password={newPw} />}
            </div>
            <div className="form-group">
              <label className="form-label">ยืนยันรหัสผ่านใหม่</label>
              <input
                type="password" className="form-control"
                placeholder="กรอกรหัสผ่านอีกครั้ง"
                value={newPwConfirm} onChange={e => setNewPwConfirm(e.target.value)}
              />
              {newPwConfirm && newPw !== newPwConfirm && (
                <span className="form-error">รหัสผ่านไม่ตรงกัน</span>
              )}
            </div>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setResetPwModal(null)}>ยกเลิก</button>
              <button
                className="btn btn-primary" onClick={doResetPw}
                disabled={pwLoading || !newPw || newPw !== newPwConfirm}
              >
                {pwLoading
                  ? <><span className="spinner" style={{ width: 14, height: 14 }} /> กำลังบันทึก...</>
                  : 'บันทึก'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
