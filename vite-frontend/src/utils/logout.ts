import axios from 'axios';

/**
 * 安全退出登录函数
 * 清除登录相关数据，但保留用户偏好设置（如主题）
 */
export const safeLogout = () => {
  const token = localStorage.getItem('token');
  const baseURL = axios.defaults.baseURL || (import.meta.env.VITE_API_BASE ? `${import.meta.env.VITE_API_BASE}/api/v1/` : '/api/v1/');
  if (token) {
    fetch(`${baseURL}iam/auth/logout`, {
      method: 'POST',
      headers: {
        'Authorization': token,
        'Content-Type': 'application/json'
      },
      body: '{}',
      keepalive: true,
    }).catch(() => undefined);
  }
  localStorage.clear();
};
