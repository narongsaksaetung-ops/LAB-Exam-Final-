import React from 'react';
import { useNavigate } from 'react-router-dom';

export default function NotFoundPage() {
  const navigate = useNavigate();
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center', background: 'var(--bg-primary)' }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 80, fontWeight: 700, color: 'var(--border-bright)', lineHeight: 1 }}>404</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', margin: '16px 0 8px' }}>ไม่พบหน้านี้</div>
      <div style={{ color: 'var(--text-muted)', fontSize: 14, marginBottom: 28 }}>ไม่พบหน้าที่คุณต้องการ</div>
      <button className="btn btn-primary" onClick={() => navigate('/dashboard')}>← กลับหน้าแดชบอร์ด</button>
    </div>
  );
}
