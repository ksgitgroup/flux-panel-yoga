import axios from 'axios';

// 处理token失效的逻辑
function handleTokenExpired() {
    // 清除localStorage中的token
    window.localStorage.removeItem('token');
    
    // 跳转到登录页面
    if (window.location.pathname !== '/login') {
        window.location.href = '/login';
    }
}

// 检查响应是否为token失效
function isTokenExpired(response) {
    return response && response.code === 401 && 
           (response.msg === '未登录或token已过期' || 
            response.msg === '无效的token或token已过期' ||
            response.msg === '无法获取用户权限信息');
}

export default {
    get: function(path = '', data = {}) {
        return new Promise(function(resolve, reject) {
            axios.get(path, {
                params: data,
                timeout: 12000,
                headers: {
                    "Authorization": window.localStorage.getItem('token')
                }
            })
                .then(function(response) {
                    // 检查是否token失效
                    if (isTokenExpired(response.data)) {
                        handleTokenExpired();
                        return;
                    }
                    resolve(response.data);
                })
                .catch(function(error) {
                    console.error('GET请求错误:', error);
                    
                    // 检查是否是401错误（token失效）
                    if (error.response && error.response.status === 401) {
                        handleTokenExpired();
                        return;
                    }
                    
                    resolve({"code": -1, "msg": error.message || "网络请求失败"});
                });
        });
    },
    post: function(path = '', data = {}) {
        return new Promise(function(resolve, reject) {
            axios.post(path, data, {
                timeout: 12000,
                headers:{
                    "Authorization": window.localStorage.getItem('token'),
                    "Content-Type": "application/json"
                }
            })
                .then(function(response) {
                    // 检查是否token失效
                    if (isTokenExpired(response.data)) {
                        handleTokenExpired();
                        return;
                    }
                    resolve(response.data);
                })
                .catch(function(error) {
                    console.error('POST请求错误:', error);
                    
                    // 检查是否是401错误（token失效）
                    if (error.response && error.response.status === 401) {
                        handleTokenExpired();
                        return;
                    }
                    
                    resolve({"code": -1, "msg": error.message || "网络请求失败"});
                });
        });
    }
};