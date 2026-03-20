import React, { useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './Layout.css';

const ROLE_LABEL = {
  super_admin: 'Super Admin',
  admin:       'ผู้ดูแล',
  researcher:  'นักวิจัย',
  user:        'ผู้ใช้ทั่วไป',
};

export default function Layout() {
  const { user, logout, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  const handleLogout = () => { logout(); navigate('/login'); };
  const close = () => setSidebarOpen(false);

  return (
    <div className="layout">
      {sidebarOpen && <div className="sidebar-overlay" onClick={close} />}

      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-logo">
          <span className="logo-icon">⬡</span>
          <span className="logo-text">VulnTrack</span>
        </div>

        <nav className="sidebar-nav">
          <div className="nav-section-label">เมนู</div>
          <NavLink to="/dashboard" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} onClick={close}>
            <span className="nav-icon">◈</span> แดชบอร์ด
          </NavLink>
          <NavLink to="/reports/new" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} onClick={close}>
            <span className="nav-icon">⊕</span> ส่งรายงาน
          </NavLink>
          {isAdmin && (
            <>
              <div className="nav-section-label" style={{ marginTop: 16 }}>ผู้ดูแลระบบ</div>
              <NavLink to="/admin/users" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} onClick={close}>
                <span className="nav-icon">◎</span> จัดการผู้ใช้
              </NavLink>
            </>
          )}
        </nav>

        {/* Sidebar bottom: stacked layout — profile row + logout row */}
        <div className="sidebar-bottom">
          <NavLink
            to="/profile"
            className={({ isActive }) => `sidebar-profile ${isActive ? 'active' : ''}`}
            onClick={close}
          >
            <div className="user-avatar">{user?.username?.[0]?.toUpperCase()}</div>
            <div className="user-info">
              <div className="user-name">{user?.username}</div>
              <span className={`badge badge-${user?.role}`}>
                {ROLE_LABEL[user?.role] || user?.role}
              </span>
            </div>
          </NavLink>
          <button
            className="sidebar-logout-btn"
            onClick={() => setShowLogoutConfirm(true)}
          >
            <span className="sidebar-logout-icon">→</span>
            ออกจากระบบ
          </button>
        </div>
      </aside>

      <div className="main-wrapper">
        <header className="topbar">
          <button className="btn btn-ghost sidebar-toggle" onClick={() => setSidebarOpen(!sidebarOpen)}>☰</button>
          <span className="topbar-title">VulnTrack</span>
          <button className="btn btn-ghost btn-sm topbar-logout" onClick={() => setShowLogoutConfirm(true)}>
            ออกจากระบบ
          </button>
        </header>
        <main className="main-content">
          <Outlet />
        </main>
      </div>

      {showLogoutConfirm && (
        <div className="modal-overlay" onClick={() => setShowLogoutConfirm(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3 className="modal-title">ออกจากระบบ</h3>
            <p className="text-secondary" style={{ marginTop: 8 }}>คุณต้องการออกจากระบบใช่หรือไม่?</p>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setShowLogoutConfirm(false)}>ยกเลิก</button>
              <button className="btn btn-danger" onClick={handleLogout}>ออกจากระบบ</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
