import Vue from 'vue';
import VueRouter from 'vue-router';
import { isLoggedIn } from '@/utils/auth';

// 路由懒加载

import Home from "@/views/Home.vue";
import Login from "@/views/Login.vue";
import ChangeAccountPassword from "@/views/ChangePassword.vue";
import Index from "@/views/Index";
import User from "@/views/User";
import Node from "@/views/node";
import Tunnel from "@/views/Tunnel";
import Forward from "@/views/Forward";
import Limit from "@/views/Limit";

Vue.use(VueRouter);

// 路由配置

const routes = [
    {
        path: '/', 
        redirect: () => {
            // 如果用户已登录，重定向到首页，否则重定向到登录页
            return isLoggedIn() ? '/index' : '/login';
        }
    },
    {path: '/login', component: Login},
    {path: '/change-password', component: ChangeAccountPassword},
    {
        path: '/home', component: Home, redirect: '/index', children: [
            {path: '/index', component: Index},
            {path: '/user', component: User},
            {path: '/node', component: Node},
            {path: '/tunnel', component: Tunnel},
            {path: '/forward', component: Forward},
            {path: '/limit', component: Limit}
        ]
    },
]

const router = new VueRouter({
    mode: 'history',
    base: process.env.BASE_URL,
    routes
})

router.beforeEach((to, from, next) => {
    // 检查用户是否已登录
    const userIsLoggedIn = isLoggedIn();
    
    // 如果用户已登录且访问登录页面，直接跳转到首页
    if (userIsLoggedIn && to.path === '/login') {
        return next('/index');
    }
    
    // 如果访问登录或修改密码页面，直接放行
    if (to.path === '/login' || to.path === '/change-password') {
        return next();
    }
    
    // 如果用户未登录且访问需要登录的页面，跳转到登录页面
    if (!userIsLoggedIn) {
        return next('/login');
    }
    
    // 其他情况正常放行
    next();
})


export default router
