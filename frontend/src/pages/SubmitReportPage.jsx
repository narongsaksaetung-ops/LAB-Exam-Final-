import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';
import './SubmitReportPage.css';

const OWASP_TYPES = [
  'A01:2025 - Broken Access Control',
  'A02:2025 - Security Misconfiguration',
  'A03:2025 - Software Supply Chain Failures',
  'A04:2025 - Cryptographic Failures',
  'A05:2025 - Injection',
  'A06:2025 - Insecure Design',
  'A07:2025 - Authentication Failures',
  'A08:2025 - Software or Data Integrity Failures',
  'A09:2025 - Security Logging and Alerting Failures',
  'A10:2025 - Mishandling of Exceptional Conditions',
  'Other'
];

const MAX_IMG_SIZE = 5 * 1024 * 1024;
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/bmp'];
const initialForm = { title: '', vuln_type: '', severity: '', description: '', poc: '', affected_url: '' };

export default function SubmitReportPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState(initialForm);
  const [pendingFiles, setPendingFiles] = useState([]);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [submittedReportId, setSubmittedReportId] = useState(null);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef(null);

  const handleChange = e => {
    setForm(f => ({ ...f, [e.target.name]: e.target.value }));
    setFieldErrors(fe => ({ ...fe, [e.target.name]: '' }));
  };

  const validate = () => {
    const errors = {};
    if (!form.title.trim()) errors.title = 'กรุณากรอกหัวข้อรายงาน';
    else if (form.title.length < 10) errors.title = 'หัวข้อต้องมีอย่างน้อย 10 ตัวอักษร';
    if (!form.vuln_type) errors.vuln_type = 'กรุณาเลือกประเภทช่องโหว่';
    if (!form.severity) errors.severity = 'กรุณาเลือกระดับความรุนแรง';
    if (!form.description.trim()) errors.description = 'กรุณากรอกรายละเอียด';
    else if (form.description.length < 50) errors.description = 'รายละเอียดต้องมีอย่างน้อย 50 ตัวอักษร';
    return errors;
  };

  const handleFiles = (files) => {
    const arr = Array.from(files);
    const errs = [];
    const valid = [];
    for (const f of arr) {
      if (!ALLOWED_TYPES.includes(f.type)) { errs.push('"' + f.name + '" ไม่ใช่ไฟล์รูปภาพที่รองรับ'); continue; }
      if (f.size > MAX_IMG_SIZE) { errs.push('"' + f.name + '" ขนาดเกิน 5MB'); continue; }
      valid.push(f);
    }
    if (errs.length) { setError(errs.join(' | ')); return; }
    setError('');
    setPendingFiles(prev => [...prev, ...valid].slice(0, 5));
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removePending = (idx) => setPendingFiles(prev => prev.filter((_, i) => i !== idx));

  const handleSubmit = async e => {
    e.preventDefault();
    setError(''); setSuccess('');
    const errors = validate();
    if (Object.keys(errors).length > 0) { setFieldErrors(errors); return; }
    setLoading(true);
    try {
      const res = await api.post('/reports', form);
      const reportId = res.data.id;
      if (pendingFiles.length > 0) {
        const formData = new FormData();
        pendingFiles.forEach(f => formData.append('images', f));
        await api.post('/reports/' + reportId + '/attachments', formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
      }
      setSubmittedReportId(reportId);
      setSuccess('ส่งรายงานสำเร็จแล้ว! (หมายเลข #' + reportId + ')');
      setTimeout(() => navigate('/reports/' + reportId), 1500);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="submit-page fade-in">
      <div className="submit-header">
        <button className="btn btn-ghost btn-sm" onClick={() => navigate(-1)}>← ย้อนกลับ</button>
        <div>
          <h1 className="page-title">ส่งรายงานช่องโหว่</h1>
          <p className="text-secondary fs-13" style={{ marginTop: 4 }}>
            Responsible Disclosure — ข้อมูลทั้งหมดถูกเข้ารหัสและเก็บไว้อย่างปลอดภัย
          </p>
        </div>
      </div>

      <div className="submit-layout">
        <form onSubmit={handleSubmit} className="submit-form card">
          {error && <div className="alert alert-error mb-4">⚠ {error}</div>}
          {success && <div className="alert alert-success mb-4">✓ {success}</div>}

          <div className="form-group">
            <label className="form-label">หัวข้อรายงาน <span style={{ color: 'var(--red)' }}>*</span></label>
            <input type="text" name="title"
              className={'form-control' + (fieldErrors.title ? ' input-error' : '')}
              placeholder="เช่น SQL Injection ในหน้า login ของระบบ"
              value={form.title} onChange={handleChange} maxLength={500} />
            {fieldErrors.title
              ? <span className="form-error">{fieldErrors.title}</span>
              : <span className="form-hint">{form.title.length}/500 ตัวอักษร</span>}
          </div>

          <div className="form-row">
            <div className="form-group" style={{ flex: 1 }}>
              <label className="form-label">ประเภทช่องโหว่ (OWASP) <span style={{ color: 'var(--red)' }}>*</span></label>
              <select name="vuln_type"
                className={'form-control' + (fieldErrors.vuln_type ? ' input-error' : '')}
                value={form.vuln_type} onChange={handleChange}>
                <option value="">-- เลือกประเภทช่องโหว่ --</option>
                {OWASP_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              {fieldErrors.vuln_type && <span className="form-error">{fieldErrors.vuln_type}</span>}
            </div>
            <div className="form-group" style={{ flex: '0 0 190px' }}>
              <label className="form-label">ระดับความรุนแรง <span style={{ color: 'var(--red)' }}>*</span></label>
              <select name="severity"
                className={'form-control' + (fieldErrors.severity ? ' input-error' : '')}
                value={form.severity} onChange={handleChange}>
                <option value="">-- เลือก --</option>
                <option value="critical">🔴 Critical (วิกฤต)</option>
                <option value="high">🟠 High (สูง)</option>
                <option value="medium">🟡 Medium (ปานกลาง)</option>
                <option value="low">🟢 Low (ต่ำ)</option>
              </select>
              {fieldErrors.severity && <span className="form-error">{fieldErrors.severity}</span>}
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">URL / Endpoint ที่ได้รับผลกระทบ</label>
            <input type="url" name="affected_url" className="form-control"
              placeholder="https://example.com/api/vulnerable-endpoint"
              value={form.affected_url} onChange={handleChange} />
            <span className="form-hint">ระบุ URL ที่พบช่องโหว่ (ถ้ามี)</span>
          </div>

          <div className="form-group">
            <label className="form-label">รายละเอียดช่องโหว่ <span style={{ color: 'var(--red)' }}>*</span></label>
            <textarea name="description"
              className={'form-control' + (fieldErrors.description ? ' input-error' : '')}
              placeholder="อธิบายช่องโหว่ที่พบ — ช่องโหว่คืออะไร, อยู่ที่ไหน, ส่งผลกระทบอย่างไร..."
              value={form.description} onChange={handleChange} rows={6} maxLength={10000} />
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
              {fieldErrors.description
                ? <span className="form-error">{fieldErrors.description}</span>
                : <span className="form-hint">ระบุผลกระทบและขั้นตอนการทำซ้ำให้ชัดเจน (อย่างน้อย 50 ตัวอักษร)</span>}
              <span className="form-hint text-mono">{form.description.length}/10000</span>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Proof of Concept (PoC)</label>
            <textarea name="poc" className="form-control"
              placeholder={'# ขั้นตอนการทำซ้ำ:\n1. ไปที่หน้า...\n2. ส่ง request...\n3. สังเกตผลลัพธ์...'}
              value={form.poc} onChange={handleChange} rows={8} maxLength={10000} />
            <span className="form-hint">ใส่ curl commands, ตัวอย่าง request/response หรือขั้นตอนการ reproduce</span>
          </div>

          {/* แนบภาพ — ใช้งานได้ตั้งแต่แรกก่อน submit */}
          <div className="form-group">
            <label className="form-label">📎 แนบภาพหลักฐาน / Screenshots</label>
            <div
              className={'drop-zone' + (dragging ? ' dragging' : '')}
              onDrop={e => { e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer.files); }}
              onDragOver={e => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onClick={() => fileInputRef.current?.click()}
            >
              <input ref={fileInputRef} type="file"
                accept="image/jpeg,image/png,image/gif,image/webp,image/bmp"
                multiple style={{ display: 'none' }}
                onChange={e => handleFiles(e.target.files)} />
              <div className="drop-zone-content">
                <span className="drop-icon">🖼</span>
                <span className="drop-title">ลากและวางรูปภาพที่นี่ หรือคลิกเพื่อเลือกไฟล์</span>
                <span className="drop-hint">JPEG, PNG, GIF, WebP • ไม่เกิน 5MB ต่อไฟล์ • สูงสุด 5 ภาพ</span>
              </div>
            </div>

            {pendingFiles.length > 0 && (
              <div className="pending-files">
                {pendingFiles.map((f, i) => (
                  <div key={i} className="pending-item">
                    <img src={URL.createObjectURL(f)} alt={f.name} className="pending-thumb" />
                    <div className="pending-info">
                      <span className="pending-name">{f.name}</span>
                      <span className="pending-size">{(f.size / 1024).toFixed(0)} KB</span>
                    </div>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => removePending(i)}>✕ ลบ</button>
                  </div>
                ))}
                <p className="form-hint mt-1">รูปภาพ {pendingFiles.length} ไฟล์ จะถูกส่งพร้อมกับรายงาน</p>
              </div>
            )}
          </div>

          <div className="submit-actions">
            <button type="button" className="btn btn-secondary" onClick={() => navigate(-1)} disabled={loading}>ยกเลิก</button>
            <button type="submit" className="btn btn-primary" disabled={loading || !!submittedReportId}>
              {loading ? <><span className="spinner" style={{ width: 16, height: 16 }} /> กำลังส่ง...</> : '⊕ ส่งรายงาน'}
            </button>
          </div>
        </form>

        <div className="submit-sidebar">
          <div className="card tips-card">
            <h3 className="tips-title">📋 แนวทางการรายงาน</h3>
            <ul className="tips-list">
              <li>ระบุตำแหน่งของช่องโหว่ให้ชัดเจน</li>
              <li>อธิบายขั้นตอนการ reproduce ให้ครบถ้วน</li>
              <li>ระบุผลกระทบที่อาจเกิดขึ้น</li>
              <li>แนบ PoC โดยไม่ต้องโจมตีจริง</li>
              <li>อย่าเข้าถึงข้อมูลเกินกว่าที่จำเป็น</li>
            </ul>
          </div>
          <div className="card severity-guide">
            <h3 className="tips-title">🎯 ระดับความรุนแรง</h3>
            <div className="sev-item"><span className="badge badge-critical">Critical</span><span>RCE, เข้าครอบครองบัญชีได้ทั้งหมด</span></div>
            <div className="sev-item"><span className="badge badge-high">High</span><span>Privilege escalation, SQLi</span></div>
            <div className="sev-item"><span className="badge badge-medium">Medium</span><span>XSS, CSRF, ข้อมูลรั่วไหล</span></div>
            <div className="sev-item"><span className="badge badge-low">Low</span><span>Misconfiguration เล็กน้อย</span></div>
          </div>
        </div>
      </div>
    </div>
  );
}
