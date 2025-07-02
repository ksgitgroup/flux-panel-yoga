import axios, { AxiosResponse } from 'axios';

// 配置axios基础URL
const baseURL = import.meta.env.VITE_API_BASE ? `${import.meta.env.VITE_API_BASE}/api/v1/` : '/api/v1/';
axios.defaults.baseURL = baseURL;

// 在开发环境下输出API配置信息
if (import.meta.env.DEV) {
  console.log('🌐 API Configuration:');
  console.log('  - VITE_API_BASE:', import.meta.env.VITE_API_BASE || '(undefined)');
  console.log('  - Base URL:', baseURL);
  console.log('  - Environment:', import.meta.env.MODE);
}

interface ApiResponse<T = any> {
  code: number;
  msg: string;
  data: T;
}

// 处理token失效的逻辑
function handleTokenExpired() {
  // 清除localStorage中的token
  window.localStorage.removeItem('token');
  window.localStorage.removeItem('role_id');
  window.localStorage.removeItem('name');
  
  // 跳转到登录页面
  if (window.location.pathname !== '/') {
    window.location.href = '/';
  }
}

// 检查响应是否为token失效
function isTokenExpired(response: ApiResponse) {
  return response && response.code === 401 && 
         (response.msg === '未登录或token已过期' || 
          response.msg === '无效的token或token已过期' ||
          response.msg === '无法获取用户权限信息');
}

const Network = {
  get: function<T = any>(path: string = '', data: any = {}): Promise<ApiResponse<T>> {
    return new Promise(function(resolve) {
      axios.get(path, {
        params: data,
        timeout: 30000,
        headers: {
          "Authorization": window.localStorage.getItem('token')
        }
      })
        .then(function(response: AxiosResponse<ApiResponse<T>>) {
          // 检查是否token失效
          if (isTokenExpired(response.data)) {
            handleTokenExpired();
            return;
          }
          resolve(response.data);
        })
                 .catch(function(error: any) {
           console.error('GET请求错误:', error);
           
           // 检查是否是401错误（token失效）
           if (error.response && error.response.status === 401) {
             handleTokenExpired();
             return;
           }
           
           resolve({"code": -1, "msg": error.message || "网络请求失败", "data": null as T});
         });
    });
  },

  post: function<T = any>(path: string = '', data: any = {}): Promise<ApiResponse<T>> {
    return new Promise(function(resolve) {
      axios.post(path, data, {
        timeout: 30000,
        headers: {
          "Authorization": window.localStorage.getItem('token'),
          "Content-Type": "application/json"
        }
      })
        .then(function(response: AxiosResponse<ApiResponse<T>>) {
          // 检查是否token失效
          if (isTokenExpired(response.data)) {
            handleTokenExpired();
            return;
          }
          resolve(response.data);
        })
                 .catch(function(error: any) {
           console.error('POST请求错误:', error);
           
           // 检查是否是401错误（token失效）
           if (error.response && error.response.status === 401) {
             handleTokenExpired();
             return;
           }
           
           resolve({"code": -1, "msg": error.message || "网络请求失败", "data": null as T});
         });
    });
  }
};

export default Network; 