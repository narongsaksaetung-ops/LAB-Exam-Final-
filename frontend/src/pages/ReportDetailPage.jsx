import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import { useAuth } from '../context/AuthContext';
import ImageUploader from '../components/ImageUploader';
import api from '../utils/api';
import { formatDistanceToNow, format } from 'date-fns';
import { th } from 'date-fns/locale';
import './ReportDetailPage.css';

const STATUSES = [
  { value: 'pending',   label: 'รอดำเนินการ' },
  { value: 'triaging',  label: 'กำลังตรวจสอบ' },
  { value: 'accepted',  label: 'รับเรื่องแล้ว' },
  { value: 'duplicate', label: 'ซ้ำกัน' },
  { value: 'resolved',  label: 'แก้ไขแล้ว' },
  { value: 'rejected',  label: 'ปฏิเสธ' },
];

const STATUS_LABELS = Object.fromEntries(STATUSES.map(s => [s.value, s.label]));

export default function ReportDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, token, isAdmin } = useAuth();

  const [report, setReport] = useState(null);
  const [messages, setMessages] = useState([]);
  const [msgInput, setMsgInput] = useState('');
  const [msgSending, setMsgSending] = useState(false);
  const [socketStatus, setSocketStatus] = useState('connecting'); // connecting | connected | disconnected
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [editError, setEditError] = useState('');
  const [statusLoading, setStatusLoading] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [attachments, setAttachments] = useState([]);
  const [deleteAttachConfirm, setDeleteAttachConfirm] = useState(null); // attachment object

  const socketRef = useRef(null);
  const chatBottomRef = useRef(null);
  const msgInputRef = useRef(null);

  // Fetch report + messages + attachments
  useEffect(() => {
    const fetchAll = async () => {
      setLoading(true);
      try {
        const [reportRes, messagesRes, attachmentsRes] = await Promise.all([
          api.get(`/reports/${id}`),
          api.get(`/reports/${id}/messages`),
          api.get(`/reports/${id}/attachments`)
        ]);
        setReport(reportRes.data);
        setEditForm({
          title: reportRes.data.title,
          severity: reportRes.data.severity,
          description: reportRes.data.description,
          poc: reportRes.data.poc || '',
          affected_url: reportRes.data.affected_url || ''
        });
        setMessages(messagesRes.data);
        setAttachments(attachmentsRes.data);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchAll();
  }, [id]);

  // Connect Socket.IO — ผ่าน nginx proxy บน same origin
  useEffect(() => {
    if (!token) return;

    // Empty string = same origin (proxied via nginx /socket.io/)
    const socket = io('', {
      auth: { token },
      transports: ['websocket', 'polling'],
      path: '/socket.io'
    });

    socket.on('connect', () => {
      setSocketStatus('connected');
      socket.emit('join_report', { reportId: parseInt(id) });
    });

    socket.on('disconnect', () => {
      setSocketStatus('disconnected');
    });

    socket.on('connect_error', () => {
      setSocketStatus('disconnected');
    });

    socket.on('new_message', (msg) => {
      setMessages(prev => [...prev, msg]);
      setMsgSending(false);
    });

    socket.on('error', (err) => {
      console.error('Socket error:', err);
      setMsgSending(false);
    });

    socketRef.current = socket;

    return () => {
      socket.emit('leave_report', { reportId: parseInt(id) });
      socket.disconnect();
    };
  }, [id, token]);

  // Auto-scroll chat
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = (e) => {
    e.preventDefault();
    const content = msgInput.trim();
    if (!content || socketStatus !== 'connected') return;
    setMsgSending(true);
    socketRef.current.emit('send_message', { reportId: parseInt(id), content });
    setMsgInput('');
    msgInputRef.current?.focus();
    // Safety timeout — if server doesn't echo back within 5s, unblock the input
    setTimeout(() => setMsgSending(false), 5000);
  };

  const handleStatusChange = async (newStatus) => {
    setStatusLoading(true);
    try {
      const res = await api.patch(`/reports/${id}`, { status: newStatus });
      setReport(r => ({ ...r, status: res.data.status }));
    } catch (err) {
      setError(err.message);
    } finally {
      setStatusLoading(false);
    }
  };

  const handleEditSave = async () => {
    setEditError('');
    if (!editForm.title?.trim() || editForm.title.length < 10) {
      setEditError('หัวข้อต้องมีอย่างน้อย 10 ตัวอักษร'); return;
    }
    if (!editForm.description?.trim() || editForm.description.length < 50) {
      setEditError('รายละเอียดต้องมีอย่างน้อย 50 ตัวอักษร'); return;
    }
    try {
      const res = await api.patch(`/reports/${id}`, editForm);
      setReport(r => ({ ...r, ...res.data }));
      setEditing(false);
    } catch (err) {
      setEditError(err.message);
    }
  };

  const handleDelete = async () => {
    try {
      await api.delete(`/reports/${id}`);
      navigate('/dashboard');
    } catch (err) {
      setError(err.message);
    }
  };

  const fmtDate = (d) => format(new Date(d), 'PPpp', { locale: th });
  const fmtAgo = (d) => formatDistanceToNow(new Date(d), { addSuffix: true, locale: th });

  const socketIndicator = {
    connected:    { color: 'var(--green)',  text: 'เชื่อมต่อแล้ว' },
    connecting:   { color: 'var(--yellow)', text: 'กำลังเชื่อมต่อ...' },
    disconnected: { color: 'var(--red)',    text: 'ขาดการเชื่อมต่อ' },
  }[socketStatus];

  if (loading) return (
    <div className="flex-center" style={{ height: 400 }}>
      <div className="spinner" style={{ width: 36, height: 36 }} />
    </div>
  );

  if (error && !report) return (
    <div style={{ padding: 40 }}>
      <div className="alert alert-error">⚠ {error}</div>
      <button className="btn btn-secondary mt-4" onClick={() => navigate(-1)}>← ย้อนกลับ</button>
    </div>
  );

  const canUpload = isAdmin || report?.status === 'pending' || report?.status === 'triaging' || report?.status === 'accepted';

  return (
    <div className="detail-page fade-in">
      {/* Header */}
      <div className="detail-header">
        <button className="btn btn-ghost btn-sm" onClick={() => navigate(-1)}>← ย้อนกลับ</button>
        <div className="detail-header-right">
          {isAdmin && (
            <>
              <button className="btn btn-secondary btn-sm" onClick={() => { setEditing(!editing); setEditError(''); }}>
                {editing ? '✕ ยกเลิก' : '✎ แก้ไข'}
              </button>
              <button className="btn btn-danger btn-sm" onClick={() => setDeleteConfirm(true)}>
                🗑 ลบ
              </button>
            </>
          )}
          {!isAdmin && report?.status === 'pending' && (
            <button className="btn btn-secondary btn-sm" onClick={() => { setEditing(!editing); setEditError(''); }}>
              {editing ? '✕ ยกเลิก' : '✎ แก้ไข'}
            </button>
          )}
        </div>
      </div>

      {error && <div className="alert alert-error mb-4">⚠ {error}</div>}

      <div className="detail-layout">
        {/* Left: Report info */}
        <div className="detail-main">
          <div className="card report-card">
            {editing ? (
              <div className="edit-form">
                <h3 style={{ marginBottom: 16, color: 'var(--accent)' }}>✎ กำลังแก้ไขรายงาน</h3>
                {editError && <div className="alert alert-error mb-4">⚠ {editError}</div>}
                <div className="form-group">
                  <label className="form-label">หัวข้อ</label>
                  <input className="form-control" value={editForm.title}
                    onChange={e => setEditForm(f => ({ ...f, title: e.target.value }))} maxLength={500} />
                </div>
                <div className="form-row-edit">
                  <div className="form-group">
                    <label className="form-label">ระดับความรุนแรง</label>
                    <select className="form-control" value={editForm.severity}
                      onChange={e => setEditForm(f => ({ ...f, severity: e.target.value }))}>
                      <option value="critical">🔴 Critical (วิกฤต)</option>
                      <option value="high">🟠 High (สูง)</option>
                      <option value="medium">🟡 Medium (ปานกลาง)</option>
                      <option value="low">🟢 Low (ต่ำ)</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">URL ที่ได้รับผลกระทบ</label>
                    <input className="form-control" value={editForm.affected_url}
                      onChange={e => setEditForm(f => ({ ...f, affected_url: e.target.value }))} />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">รายละเอียด</label>
                  <textarea className="form-control" rows={5} value={editForm.description}
                    onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))} maxLength={10000} />
                  <span className="form-hint">{editForm.description?.length || 0}/10000</span>
                </div>
                <div className="form-group">
                  <label className="form-label">Proof of Concept (PoC)</label>
                  <textarea className="form-control" rows={4} value={editForm.poc}
                    onChange={e => setEditForm(f => ({ ...f, poc: e.target.value }))} maxLength={10000} />
                </div>
                <div className="edit-actions">
                  <button className="btn btn-secondary" onClick={() => { setEditing(false); setEditError(''); }}>ยกเลิก</button>
                  <button className="btn btn-primary" onClick={handleEditSave}>บันทึกการแก้ไข</button>
                </div>

                {/* Image attachments are part of the report — show uploader in edit mode too */}
                {canUpload && (
                  <div className="form-group" style={{ marginTop: 20, paddingTop: 20, borderTop: '1px solid var(--border)' }}>
                    <label className="form-label">📎 ภาพหลักฐาน / Screenshots</label>
                    <ImageUploader
                      reportId={parseInt(id)}
                      existingAttachments={attachments}
                      onUploaded={newFiles => setAttachments(prev => [...prev, ...newFiles])}
                      onDeleted={attId => setDeleteAttachConfirm(attachments.find(a => a.id === attId))}
                      readOnly={false}
                    />
                  </div>
                )}
              </div>
            ) : (
              <>
                <div className="report-meta-row">
                  <span className="report-id text-mono text-muted">#{report.id}</span>
                  <span className={`badge badge-${report.severity}`}>{report.severity}</span>
                  <span className={`badge badge-${report.status}`}>{STATUS_LABELS[report.status] || report.status}</span>
                  <span className="text-muted fs-12 text-mono ml-auto">{fmtAgo(report.created_at)}</span>
                </div>

                <h2 className="report-title">{report.title}</h2>

                <div className="report-info-grid">
                  <div className="info-item">
                    <span className="info-label">ประเภทช่องโหว่</span>
                    <span className="info-value text-mono">{report.vuln_type}</span>
                  </div>
                  <div className="info-item">
                    <span className="info-label">ผู้รายงาน</span>
                    <span className="info-value">{report.reporter_name}</span>
                  </div>
                  {report.affected_url && (
                    <div className="info-item" style={{ gridColumn: '1 / -1' }}>
                      <span className="info-label">URL ที่ได้รับผลกระทบ</span>
                      <span className="info-value text-mono" style={{ wordBreak: 'break-all', color: 'var(--accent)' }}>
                        {report.affected_url}
                      </span>
                    </div>
                  )}
                  <div className="info-item">
                    <span className="info-label">วันที่ส่ง</span>
                    <span className="info-value text-mono">{fmtDate(report.created_at)}</span>
                  </div>
                  <div className="info-item">
                    <span className="info-label">อัปเดตล่าสุด</span>
                    <span className="info-value text-mono">{fmtDate(report.updated_at)}</span>
                  </div>
                </div>

                <hr className="divider" />

                <div className="report-section">
                  <h4 className="section-heading">รายละเอียด</h4>
                  <p className="section-content">{report.description}</p>
                </div>

                {report.poc && (
                  <div className="report-section">
                    <h4 className="section-heading">Proof of Concept (PoC)</h4>
                    <pre className="poc-block">{report.poc}</pre>
                  </div>
                )}

                <hr className="divider" />

                <div className="report-section">
                  <h4 className="section-heading">📎 ภาพหลักฐาน / Screenshots</h4>
                  <ImageUploader
                    reportId={parseInt(id)}
                    existingAttachments={attachments}
                    onUploaded={newFiles => setAttachments(prev => [...prev, ...newFiles])}
                    onDeleted={attId => setDeleteAttachConfirm(attachments.find(a => a.id === attId))}
                    readOnly={!canUpload}
                  />
                </div>
              </>
            )}
          </div>

          {/* Admin: Status panel */}
          {isAdmin && !editing && (
            <div className="card status-panel">
              <h4 className="section-heading">เปลี่ยนสถานะรายงาน</h4>
              <div className="status-btns">
                {STATUSES.map(s => (
                  <button key={s.value}
                    className={`status-btn ${report.status === s.value ? 'active' : ''}`}
                    onClick={() => handleStatusChange(s.value)}
                    disabled={statusLoading || report.status === s.value}>
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right: Live Chat */}
        <div className="chat-panel card">
          <div className="chat-header">
            <h3 className="chat-title">💬 Live Chat</h3>
            <div className="chat-participants">
              <span className="online-dot" style={{ background: socketIndicator.color, boxShadow: `0 0 6px ${socketIndicator.color}` }} />
              <span className="text-muted fs-12">{socketIndicator.text}</span>
            </div>
          </div>

          <div className="chat-messages">
            {messages.length === 0 ? (
              <div className="chat-empty">
                <span style={{ fontSize: 28 }}>💬</span>
                <span>ยังไม่มีข้อความ</span>
                <span className="text-muted fs-12">เริ่มการสนทนาได้เลย!</span>
              </div>
            ) : (
              messages.map(msg => (
                <div key={msg.id} className={`chat-bubble ${msg.user_id === user.id ? 'own' : 'other'}`}>
                  <div className="bubble-meta">
                    <span className={`bubble-name ${(msg.role === 'admin' || msg.role === 'super_admin') ? 'admin-name' : ''}`}>
                      {(msg.role === 'admin' || msg.role === 'super_admin') ? '⬡ ' : ''}{msg.username}
                      {msg.role === 'super_admin' && <span className="badge badge-super-admin" style={{ fontSize: 9, padding: '1px 5px', marginLeft: 4 }}>Super Admin</span>}
                      {msg.role === 'admin' && <span className="badge badge-admin" style={{ fontSize: 9, padding: '1px 5px', marginLeft: 4 }}>Admin</span>}
                    </span>
                    <span className="bubble-time text-mono">{fmtAgo(msg.created_at)}</span>
                  </div>
                  <div className="bubble-content">{msg.content}</div>
                </div>
              ))
            )}
            <div ref={chatBottomRef} />
          </div>

          <form className="chat-input-row" onSubmit={handleSendMessage}>
            <input ref={msgInputRef} type="text" className="form-control chat-input"
              placeholder={socketStatus === 'connected' ? 'พิมพ์ข้อความ...' : 'กำลังเชื่อมต่อ...'}
              value={msgInput}
              onChange={e => setMsgInput(e.target.value)}
              maxLength={2000}
              disabled={socketStatus !== 'connected'}
            />
            <button type="submit" className="btn btn-primary btn-sm chat-send"
              disabled={!msgInput.trim() || socketStatus !== 'connected' || msgSending}>
              {msgSending ? <span className="spinner" style={{ width: 14, height: 14 }} /> : '➤'}
            </button>
          </form>
          {socketStatus === 'disconnected' && (
            <div className="chat-disconnected-bar">
              ⚠ ขาดการเชื่อมต่อ — กำลังพยายามเชื่อมต่อใหม่...
            </div>
          )}
        </div>
      </div>

      {/* Delete confirm modal */}
      {deleteConfirm && (
        <div className="modal-overlay" onClick={() => setDeleteConfirm(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3 className="modal-title">ลบรายงาน</h3>
            <p className="text-secondary" style={{ marginTop: 8 }}>
              การลบรายงานนี้จะลบข้อความแชทและภาพหลักฐานที่เกี่ยวข้องทั้งหมดด้วย และ<strong style={{ color: 'var(--red)' }}>ไม่สามารถย้อนกลับได้</strong>
            </p>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setDeleteConfirm(false)}>ยกเลิก</button>
              <button className="btn btn-danger" onClick={handleDelete}>ลบรายงาน</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete attachment confirmation modal */}
      {deleteAttachConfirm && (
        <div className="modal-overlay" onClick={() => setDeleteAttachConfirm(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3 className="modal-title">ลบภาพหลักฐาน</h3>
            <p className="text-secondary" style={{ marginTop: 8 }}>
              ต้องการลบภาพ <strong style={{ color: 'var(--text-primary)' }}>
                "{deleteAttachConfirm.original_name}"
              </strong> หรือไม่? การกระทำนี้ไม่สามารถย้อนกลับได้
            </p>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setDeleteAttachConfirm(null)}>
                ยกเลิก
              </button>
              <button className="btn btn-danger" onClick={async () => {
                try {
                  await api.delete(`/reports/${id}/attachments/${deleteAttachConfirm.id}`);
                  setAttachments(prev => prev.filter(a => a.id !== deleteAttachConfirm.id));
                  setDeleteAttachConfirm(null);
                } catch (err) {
                  setError(err.message);
                  setDeleteAttachConfirm(null);
                }
              }}>
                ลบภาพ
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
