import React from 'react';

const CRITERIA = [
  { label: 'อย่างน้อย 8 ตัวอักษร', test: p => p.length >= 8 },
  { label: 'ตัวพิมพ์ใหญ่ (A-Z)',   test: p => /[A-Z]/.test(p) },
  { label: 'ตัวเลข (0-9)',           test: p => /[0-9]/.test(p) },
  { label: 'อักขระพิเศษ (!@#$...)', test: p => /[^A-Za-z0-9]/.test(p) },
];

export function calcStrength(password) {
  return CRITERIA.filter(c => c.test(password)).length;
}

export default function PwStrengthBar({ password }) {
  const passed = calcStrength(password);
  const barColors = ['var(--red)', 'var(--red)', 'var(--yellow)', 'var(--orange)', 'var(--green)'];
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
        {[1,2,3,4].map(i => (
          <div key={i} style={{
            height: 4, flex: 1, borderRadius: 2,
            background: i <= passed ? barColors[passed] : 'var(--border)',
            transition: 'background 0.2s'
          }} />
        ))}
      </div>
      {passed === 4 ? (
        <span style={{ fontSize: 12, color: 'var(--green)' }}>✓ รหัสผ่านแข็งแกร่ง</span>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {CRITERIA.map((c, i) => (
            <span key={i} style={{ fontSize: 11, color: c.test(password) ? 'var(--green)' : 'var(--text-muted)' }}>
              {c.test(password) ? '✓' : '○'} {c.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
