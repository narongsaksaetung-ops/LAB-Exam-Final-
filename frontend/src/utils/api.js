import axios from 'axios';

const api = axios.create({
  baseURL: `${import.meta.env.VITE_API_URL || ''}/api`,
  timeout: 10000,
  headers: { 'Content-Type': 'application/json' }
});

// Attach token if available
api.interceptors.request.use(config => {
  const token = localStorage.getItem('token');
  if (token) config.headers['Authorization'] = `Bearer ${token}`;
  return config;
});

// Response interceptor — extract error messages cleanly
api.interceptors.response.use(
  res => res,
  err => {
    const data = err.response?.data;
    const message =
      data?.error ||
      data?.errors?.[0]?.msg ||
      data?.message ||
      'เกิดข้อผิดพลาด กรุณาลองใหม่';
    const error = new Error(message);
    // Pass through extra fields from server response
    if (data?.requiresVerification) error.requiresVerification = true;
    if (data?.email) error.email = data.email;
    return Promise.reject(error);
  }
);

export default api;
