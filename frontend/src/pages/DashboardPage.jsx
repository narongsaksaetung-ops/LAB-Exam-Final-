import React, { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../utils/api';
import { formatDistanceToNow } from 'date-fns';
import { th } from 'date-fns/locale';
import './DashboardPage.css';

const SEVERITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3 };
const STATUS_LABELS = {
  pending: 'รอดำเนินการ', triaging: 'กำลังตรวจสอบ', accepted: 'รับเรื่องแล้ว',
  duplicate: 'ซ้ำกัน', resolved: 'แก้ไขแล้ว', rejected: 'ปฏิเสธ'
};
const SEVERITY_LABELS = { critical: 'วิกฤต', high: 'สูง', medium: 'ปานกลาง', low: 'ต่ำ' };

export default function DashboardPage() {
  const { user, isAdmin, isResearcher } = useAuth();
  const navigate = useNavigate();
  const [reports, setReports] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState({ severity: '', status: '' });
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = {};
      if (filters.severity) params.severity = filters.severity;
      if (filters.status) params.status = filters.status;

      const [reportsRes, statsRes] = await Promise.all([
        api.get('/reports', { params }),
        isAdmin ? api.get('/admin/stats') : Promise.resolve(null)
      ]);

      setReports(reportsRes.data.reports || []);
      if (statsRes) setStats(statsRes.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [filters, isAdmin]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleDelete = async (id) => {
    try {
      await api.delete(`/reports/${id}`);
      setReports(r => r.filter(rep => rep.id !== id));
      setDeleteConfirm(null);
    } catch (err) {
      setError(err.message);
    }
  };

  const criticalCount = reports.filter(r => r.severity === 'critical').length;
  const pendingCount = reports.filter(r => r.status === 'pending').length;

  return (
    <div className="dashboard fade-in">
      {/* Header */}
      <div className="dashboard-header">
        <div>
          <h1 className="dashboard-title">
            {isAdmin ? 'รายงานทั้งหมด' : 'รายงานของฉัน'}
          </h1>
          <p className="text-secondary fs-13" style={{ marginTop: 4 }}>
            {isAdmin ? 'แสดงรายงานช่องโหว่ทั้งหมดจากทุกนักวิจัย' : 'แสดงรายงานช่องโหว่ที่คุณส่ง'}
          </p>
        </div>
        {isResearcher && (
          <Link to="/reports/new" className="btn btn-primary">
            ⊕ ส่งรายงาน
          </Link>
        )}
      </div>

      {/* Stats row */}
      {isAdmin && stats ? (
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-number">{stats.totalReports}</div>
            <div className="stat-label">รายงานทั้งหมด</div>
          </div>
          <div className="stat-card stat-card-critical">
            <div className="stat-number" style={{ color: 'var(--red)' }}>
              {stats.bySeverity.find(s => s.severity === 'critical')?.count || 0}
            </div>
            <div className="stat-label">วิกฤต</div>
          </div>
          <div className="stat-card">
            <div className="stat-number" style={{ color: 'var(--yellow)' }}>
              {stats.byStatus.find(s => s.status === 'pending')?.count || 0}
            </div>
            <div className="stat-label">รอพิจารณา</div>
          </div>
          <div className="stat-card">
            <div className="stat-number" style={{ color: 'var(--green)' }}>
              {stats.byStatus.find(s => s.status === 'resolved')?.count || 0}
            </div>
            <div className="stat-label">แก้ไขแล้ว</div>
          </div>
          <div className="stat-card">
            <div className="stat-number">{stats.totalUsers}</div>
            <div className="stat-label">ผู้ใช้ทั้งหมด</div>
          </div>
        </div>
      ) : !isAdmin && reports.length > 0 ? (
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-number">{reports.length}</div>
            <div className="stat-label">ส่งทั้งหมด</div>
          </div>
          <div className="stat-card stat-card-critical">
            <div className="stat-number" style={{ color: 'var(--red)' }}>{criticalCount}</div>
            <div className="stat-label">วิกฤต</div>
          </div>
          <div className="stat-card">
            <div className="stat-number" style={{ color: 'var(--yellow)' }}>{pendingCount}</div>
            <div className="stat-label">รอดำเนินการ</div>
          </div>
          <div className="stat-card">
            <div className="stat-number" style={{ color: 'var(--green)' }}>
              {reports.filter(r => r.status === 'resolved').length}
            </div>
            <div className="stat-label">แก้ไขแล้ว</div>
          </div>
        </div>
      ) : null}

      {/* Filters */}
      <div className="filters-bar">
        <div className="filters-left">
          <select className="form-control filter-select" value={filters.severity}
            onChange={e => setFilters(f => ({ ...f, severity: e.target.value }))}>
            <option value="">ทุกระดับ</option>
            <option value="critical">🔴 Critical (วิกฤต)</option>
            <option value="high">🟠 High (สูง)</option>
            <option value="medium">🟡 Medium (ปานกลาง)</option>
            <option value="low">🟢 Low (ต่ำ)</option>
          </select>
          <select className="form-control filter-select" value={filters.status}
            onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}>
            <option value="">ทุกสถานะ</option>
            <option value="pending">รอดำเนินการ</option>
            <option value="triaging">กำลังตรวจสอบ</option>
            <option value="accepted">รับเรื่องแล้ว</option>
            <option value="duplicate">ซ้ำกัน</option>
            <option value="resolved">แก้ไขแล้ว</option>
            <option value="rejected">ปฏิเสธ</option>
          </select>
          {(filters.severity || filters.status) && (
            <button className="btn btn-ghost btn-sm" onClick={() => setFilters({ severity: '', status: '' })}>
              ✕ ล้างตัวกรอง
            </button>
          )}
        </div>
        <span className="text-muted fs-12 text-mono">{reports.length} รายงาน</span>
      </div>

      {error && <div className="alert alert-error mb-4">⚠ {error}</div>}

      {/* Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <div className="flex-center" style={{ padding: 60 }}>
            <div className="spinner" style={{ width: 32, height: 32 }} />
          </div>
        ) : reports.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">⬡</div>
            <div className="empty-title">ไม่พบรายงาน</div>
            <div className="empty-desc">
              {filters.severity || filters.status ? 'ลองปรับตัวกรองใหม่' : 'ส่งรายงานช่องโหว่แรกของคุณเพื่อเริ่มต้น'}
            </div>
            {!filters.severity && !filters.status && isResearcher && (
              <Link to="/reports/new" className="btn btn-primary" style={{ marginTop: 16 }}>⊕ ส่งรายงาน</Link>
            )}
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>หัวข้อ</th>
                  <th>ประเภท</th>
                  <th>ความรุนแรง</th>
                  <th>สถานะ</th>
                  {isAdmin && <th>ผู้รายงาน</th>}
                  <th>วันที่ส่ง</th>
                  <th>จัดการ</th>
                </tr>
              </thead>
              <tbody>
                {reports.map(report => (
                  <tr key={report.id}>
                    <td className="text-mono text-muted" style={{ width: 50 }}>#{report.id}</td>
                    <td>
                      <Link to={`/reports/${report.id}`} className="report-title-link">
                        {report.title}
                      </Link>
                    </td>
                    <td>
                      <span className="vuln-type text-mono">{report.vuln_type?.split(' - ')[0]}</span>
                    </td>
                    <td>
                      <span className={`badge badge-${report.severity}`}>
                        {SEVERITY_LABELS[report.severity] || report.severity}
                      </span>
                    </td>
                    <td>
                      <span className={`badge badge-${report.status}`}>{STATUS_LABELS[report.status] || report.status}</span>
                    </td>
                    {isAdmin && (
                      <td className="text-secondary fs-13">{report.reporter_name}</td>
                    )}
                    <td className="text-muted fs-12 text-mono">
                      {formatDistanceToNow(new Date(report.created_at), { addSuffix: true, locale: th })}
                    </td>
                    <td>
                      <div className="action-btns">
                        <button className="btn btn-secondary btn-sm" onClick={() => navigate(`/reports/${report.id}`)}>
                          ดู
                        </button>
                        {isAdmin && (
                          <button className="btn btn-danger btn-sm" onClick={() => setDeleteConfirm(report)}>
                            ลบ
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Delete confirmation modal */}
      {deleteConfirm && (
        <div className="modal-overlay" onClick={() => setDeleteConfirm(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3 className="modal-title">ลบรายงาน</h3>
            <p className="text-secondary" style={{ marginTop: 8 }}>
              คุณแน่ใจหรือไม่ว่าต้องการลบ <strong style={{ color: 'var(--text-primary)' }}>"{deleteConfirm.title}"</strong>?
              การกระทำนี้ไม่สามารถย้อนกลับได้
            </p>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setDeleteConfirm(null)}>ยกเลิก</button>
              <button className="btn btn-danger" onClick={() => handleDelete(deleteConfirm.id)}>ลบ</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
