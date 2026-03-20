# VulnTrack — Secure Vulnerability Reporting Platform

แพลตฟอร์มรายงานช่องโหว่ความปลอดภัย (Bug Bounty Platform)  
พัฒนาด้วย React + Node.js + PostgreSQL + Socket.IO

---

## 🚀 วิธีรันระบบด้วย Docker

```bash
docker-compose up --build
```

เข้าใช้งานที่ **http://localhost:3000**

> **หมายเหตุ:** หากเคยรันระบบเวอร์ชันก่อนหน้า ให้รัน `docker-compose down -v` ก่อนเพื่อล้าง volume เก่า แล้วค่อย `docker-compose up --build` ใหม่

---

## 👤 บัญชีเริ่มต้น

| Role | Email | Password |
|------|-------|----------|
| Super Admin | admin@vulnplatform.com | Admin@123456 |

> สร้างบัญชี Researcher เพิ่มได้ที่ http://localhost:3000/register  
> ผู้ใช้ที่สมัครใหม่จะได้รับ Role = **Researcher** โดยอัตโนมัติ

---

## 🎭 ระบบ Role

| Role | สิทธิ์ |
|------|--------|
| `researcher` | สมัครได้ทันที · ส่งรายงานช่องโหว่ · แก้ไขรายงานตัวเองได้เฉพาะสถานะ Pending |
| `admin` | จัดการ user/researcher · เห็นรายงานทั้งหมด · เปลี่ยนสถานะรายงาน · โปรโมทได้โดย Super Admin |
| `super_admin` | สิทธิ์สูงสุด · ลบ/ลดขั้นไม่ได้ · ไม่ปรากฏใน user list ของ admin ทั่วไป · สร้างโดย seed อัตโนมัติ |

---

## 📄 หน้าหลักของระบบ

| หน้า | URL | คำอธิบาย |
|------|-----|----------|
| Login | `/login` | เข้าสู่ระบบ |
| Register | `/register` | สมัครสมาชิก (ได้ role researcher ทันที) |
| Dashboard | `/dashboard` | Researcher เห็นรายงานตัวเอง · Admin เห็นทุกรายงาน + filter |
| ส่งรายงาน | `/reports/new` | กรอก OWASP type, severity, PoC, แนบภาพ |
| รายละเอียดรายงาน | `/reports/:id` | ดูรายละเอียด + Live Chat + แนบภาพเพิ่มเติม |
| จัดการผู้ใช้ | `/admin/users` | Admin/Super Admin เท่านั้น |
| โปรไฟล์ | `/profile` | เปลี่ยนรหัสผ่าน |

---

## 🔒 Security Features (OWASP Top 10: 2025)

| # | ช่องโหว่ | การป้องกัน |
|---|---------|-----------|
| A01 | Broken Access Control | JWT middleware ทุก route · reporter_id check · requireAdmin / requireSuperAdmin |
| A02 | Security Misconfiguration | Helmet · CSP headers · CORS whitelist · server_tokens off (nginx) |
| A03 | Software Supply Chain Failures | npm audit · dependency pinning |
| A04 | Cryptographic Failures | bcrypt saltRounds=12 · JWT HS256 · 64-char random JWT secret |
| A05 | Injection | Parameterized queries ($1,$2) ทุก SQL · XSS library sanitize input/output |
| A06 | Insecure Design | Rate limiting (auth 10/15min · global 200/15min) · login_attempts tracking |
| A07 | Authentication Failures | Timing-safe bcrypt · JWT expiry 24h · role fetch จาก DB ทุก request |
| A08 | Software or Data Integrity Failures | File type whitelist · MIME check · max 5MB/file |
| A09 | Security Logging and Alerting Failures | Winston logger · audit_logs table ทุก action · Morgan HTTP log |
| A10 | Mishandling of Exceptional Conditions | Global error handler · graceful shutdown · uncaughtException handler |

### WebSocket Security (Live Chat)
- JWT ยืนยัน + ดึง role จาก DB ก่อน connect ทุกครั้ง (ไม่ใช้ JWT payload เก่า)
- Room-level access control: ตรวจสิทธิ์ก่อน join ทุก room
- XSS sanitize ทุก message ก่อนบันทึก DB และ broadcast

---

## 📁 โครงสร้างโปรเจกต์

```
vuln-platform/
├── backend/
│   ├── Dockerfile
│   ├── docker-entrypoint.sh      # fix uploads dir permissions at startup
│   ├── init.sql                  # PostgreSQL schema
│   ├── package.json
│   └── src/
│       ├── index.js              # Express + Socket.IO entry point
│       ├── seed.js               # migration + super admin seed
│       ├── middleware/
│       │   ├── auth.js           # authenticate (DB role fetch) · requireAdmin · requireSuperAdmin
│       │   ├── upload.js         # Multer image upload
│       │   └── errorHandler.js
│       ├── models/db.js          # PostgreSQL connection pool
│       ├── routes/
│       │   ├── auth.js           # register · login · forgot/reset password · change password
│       │   ├── reports.js        # CRUD vulnerability reports
│       │   ├── attachments.js    # image upload/download (authenticated)
│       │   └── admin.js          # users · stats · audit logs
│       └── utils/
│           ├── logger.js         # Winston
│           └── email.js          # Nodemailer (optional)
├── frontend/
│   ├── Dockerfile
│   ├── nginx.conf                # SPA routing + API proxy + Authorization header passthrough
│   ├── package.json
│   └── src/
│       ├── App.jsx               # Router + PrivateRoute + AdminRoute
│       ├── context/AuthContext.jsx
│       ├── components/
│       │   ├── Layout.jsx        # Sidebar + topbar + logout confirm
│       │   ├── ImageUploader.jsx # Drag-drop upload + lightbox + delete confirm
│       │   └── PwStrengthBar.jsx # Password strength indicator (shared)
│       ├── pages/
│       │   ├── LoginPage.jsx
│       │   ├── RegisterPage.jsx  # confirm password field
│       │   ├── DashboardPage.jsx # role-aware table + filters
│       │   ├── SubmitReportPage.jsx
│       │   ├── ReportDetailPage.jsx  # report detail + Live Chat + image uploader
│       │   ├── AdminUsersPage.jsx    # 4-role management
│       │   ├── ProfilePage.jsx
│       │   ├── ForgotPasswordPage.jsx
│       │   └── ResetPasswordPage.jsx
│       └── utils/api.js          # Axios instance + interceptors
└── docker-compose.yml
```

---

## ⚙️ Environment Variables (docker-compose.yml)

| Variable | ค่าเริ่มต้น | คำอธิบาย |
|----------|------------|---------|
| `JWT_SECRET` | 64-char hex | เปลี่ยนก่อน deploy production |
| `JWT_EXPIRES_IN` | `24h` | อายุ token |
| `DATABASE_URL` | postgres://... | connection string |
| `FRONTEND_URL` | http://localhost:3000 | CORS origin |
| `SITE_URL` | http://localhost:3000 | สำหรับ reset password link |
