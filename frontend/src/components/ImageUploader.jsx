import React, { useState, useRef, useCallback, useEffect } from 'react';
import api from '../utils/api';
import './ImageUploader.css';

const MAX_SIZE_MB = 5;
const MAX_FILES = 5;
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/bmp'];

export default function ImageUploader({ reportId, existingAttachments = [], onUploaded, onDeleted, readOnly = false }) {
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const fileInputRef = useRef(null);

  const validateFiles = (files) => {
    const errors = [];
    if (files.length > MAX_FILES) {
      errors.push(`อัปโหลดได้สูงสุด ${MAX_FILES} ไฟล์ต่อครั้ง`);
      return errors;
    }
    for (const file of files) {
      if (!ALLOWED_TYPES.includes(file.type)) {
        errors.push(`"${file.name}" ไม่ใช่ไฟล์รูปภาพที่รองรับ`);
      }
      if (file.size > MAX_SIZE_MB * 1024 * 1024) {
        errors.push(`"${file.name}" ขนาดเกิน ${MAX_SIZE_MB}MB ที่กำหนด`);
      }
    }
    return errors;
  };

  const uploadFiles = useCallback(async (files) => {
    setUploadError('');
    const fileArray = Array.from(files);
    const errors = validateFiles(fileArray);
    if (errors.length > 0) { setUploadError(errors.join(' ')); return; }

    const remaining = MAX_FILES - existingAttachments.length;
    if (fileArray.length > remaining) {
      setUploadError(`เพิ่มได้อีกแค่ ${remaining} ภาพเท่านั้น (สูงสุด 5 ภาพต่อรายงาน)`);
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      fileArray.forEach(f => formData.append('images', f));
      const res = await api.post(`/reports/${reportId}/attachments`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      onUploaded(res.data);
    } catch (err) {
      setUploadError(err.message);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, [reportId, existingAttachments.length, onUploaded]);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDragging(false);
    if (readOnly) return;
    uploadFiles(e.dataTransfer.files);
  }, [readOnly, uploadFiles]);

  const handleDragOver = (e) => { e.preventDefault(); setDragging(true); };
  const handleDragLeave = () => setDragging(false);

  // Clicking ✕ on a thumbnail notifies the parent via onDeleted(attachmentId).
  // The parent is responsible for showing a confirm modal and calling the API.
  // This keeps the delete confirmation logic centralized in the parent.
  const handleDeleteRequest = (attachmentId) => {
    if (onDeleted) onDeleted(attachmentId);
  };

  // Build authenticated image URL — routed through nginx /api/ proxy to backend
  const getImageUrl = (filename) =>
    `/api/attachments/file/${filename}`;

  return (
    <div className="image-uploader">
      {!readOnly && existingAttachments.length < 10 && (
        <div
          className={`drop-zone ${dragging ? 'dragging' : ''} ${uploading ? 'uploading' : ''}`}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={() => !uploading && fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp,image/bmp"
            multiple
            style={{ display: 'none' }}
            onChange={e => uploadFiles(e.target.files)}
          />
          {uploading ? (
            <div className="drop-zone-content">
              <span className="spinner" style={{ width: 24, height: 24 }} />
              <span>กำลังอัปโหลด...</span>
            </div>
          ) : (
            <div className="drop-zone-content">
              <span className="drop-icon">🖼</span>
              <span className="drop-title">ลากและวางภาพหลักฐานที่นี่</span>
              <span className="drop-hint">หรือคลิกเพื่อเลือกไฟล์ — JPEG, PNG, GIF, WebP • ไม่เกิน {MAX_SIZE_MB}MB • สูงสุด {MAX_FILES} ภาพ</span>
            </div>
          )}
        </div>
      )}

      {uploadError && <div className="alert alert-error mt-2 fs-12">⚠ {uploadError}</div>}

      {existingAttachments.length > 0 && (
        <div className="attachment-gallery">
          {existingAttachments.map(att => (
            <AttachmentItem
              key={att.id}
              attachment={att}
              imageUrl={getImageUrl(att.filename)}
              onDelete={!readOnly ? () => handleDeleteRequest(att.id) : null}
            />
          ))}
        </div>
      )}

      {existingAttachments.length === 0 && readOnly && (
        <div className="no-attachments">ยังไม่มีภาพหลักฐาน</div>
      )}
    </div>
  );
}

function AttachmentItem({ attachment, imageUrl, onDelete }) {
  const [lightbox, setLightbox] = useState(false);
  const [blobUrl, setBlobUrl] = useState(null);
  const [imgLoadError, setImgLoadError] = useState(false);
  const [loading, setLoading] = useState(true);
  // Use a ref to track the current blob URL so cleanup always revokes the right one
  const blobRef = useRef(null);
  const token = localStorage.getItem('token');

  useEffect(() => {
    let cancelled = false;

    setLoading(true);
    setImgLoadError(false);
    setBlobUrl(null);

    fetch(imageUrl, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.blob();
      })
      .then(blob => {
        if (cancelled) return;
        // Revoke previous blob URL before creating a new one
        if (blobRef.current) {
          URL.revokeObjectURL(blobRef.current);
        }
        const url = URL.createObjectURL(blob);
        blobRef.current = url;
        setBlobUrl(url);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setImgLoadError(true);
        setLoading(false);
      });

    return () => {
      cancelled = true;
      // Only revoke on final unmount, not on every re-render
      // (blobRef.current is the live URL, revoke it when truly unmounting)
    };
  }, [imageUrl, token]);

  // Revoke blob URL only when component truly unmounts
  useEffect(() => {
    return () => {
      if (blobRef.current) {
        URL.revokeObjectURL(blobRef.current);
        blobRef.current = null;
      }
    };
  }, []);

  const formatSize = (bytes) => {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
  };

  return (
    <>
      <div className="attachment-thumb">
        {loading && !imgLoadError && (
          <div className="thumb-loading">
            <span className="spinner" style={{ width: 16, height: 16 }} />
          </div>
        )}
        {imgLoadError && (
          <div className="thumb-error">⚠ โหลดไม่สำเร็จ</div>
        )}
        {!loading && !imgLoadError && blobUrl && (
          <img
            src={blobUrl}
            alt={attachment.original_name}
            className="thumb-img"
            onClick={() => setLightbox(true)}
          />
        )}
        <div className="thumb-overlay">
          <span className="thumb-name" title={attachment.original_name}>
            {attachment.original_name.length > 18
              ? attachment.original_name.substring(0, 15) + '...'
              : attachment.original_name}
          </span>
          <span className="thumb-size">{formatSize(attachment.size)}</span>
          <div className="thumb-actions">
            {blobUrl && (
              <button className="thumb-btn" onClick={() => setLightbox(true)} title="ดูขนาดเต็ม">⛶</button>
            )}
            {onDelete && (
              <button className="thumb-btn thumb-btn-del" onClick={onDelete} title="ลบ">✕</button>
            )}
          </div>
        </div>
      </div>

      {lightbox && blobUrl && (
        <div className="lightbox" onClick={() => setLightbox(false)}>
          <div className="lightbox-inner" onClick={e => e.stopPropagation()}>
            <button className="lightbox-close" onClick={() => setLightbox(false)}>✕</button>
            <img src={blobUrl} alt={attachment.original_name} className="lightbox-img" />
            <div className="lightbox-caption">
              {attachment.original_name} • {formatSize(attachment.size)}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
