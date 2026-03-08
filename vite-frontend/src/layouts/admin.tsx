import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Button } from "@heroui/button";
import { Dropdown, DropdownTrigger, DropdownMenu, DropdownItem } from "@heroui/dropdown";
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, useDisclosure } from "@heroui/modal";
import { Input } from "@heroui/input";
import { toast } from 'react-hot-toast';

import { Logo } from '@/components/icons';
import { updatePassword } from '@/api';
import { hasAnyPermission, isAdmin as checkIsAdmin } from '@/utils/auth';
import { safeLogout } from '@/utils/logout';
import { siteConfig } from '@/config/site';

interface MenuItem {
  path: string;
  label: string;
  icon: React.ReactNode;
  adminOnly?: boolean;
  requiredPermissions?: string[];
}

interface PasswordForm {
  newUsername: string;
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const { isOpen, onOpen, onOpenChange } = useDisclosure();

  const [isMobile, setIsMobile] = useState(false);
  const [mobileMenuVisible, setMobileMenuVisible] = useState(false);
  const [username, setUsername] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordForm, setPasswordForm] = useState<PasswordForm>({
    newUsername: '',
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });

  // 菜单项配置
  const menuItems: MenuItem[] = [
    {
      path: '/dashboard',
      label: '首页',
      icon: (
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
          <path d="M3 4a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1V4zM3 10a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H4a1 1 0 01-1-1v-6zM14 9a1 1 0 00-1 1v6a1 1 0 001 1h2a1 1 0 001-1v-6a1 1 0 00-1-1h-2z" />
        </svg>
      )
    },
    {
      path: '/assets',
      label: '服务器资产',
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 5h16v5H4z"></path>
          <path d="M4 14h16v5H4z"></path>
          <path d="M8 8h.01"></path>
          <path d="M8 17h.01"></path>
        </svg>
      ),
      adminOnly: true,
      requiredPermissions: ['asset.read']
    },
    {
      path: '/xui',
      label: 'X-UI管理',
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 7h16"></path>
          <path d="M4 12h10"></path>
          <path d="M4 17h7"></path>
          <path d="M17 10l3 3-3 3"></path>
        </svg>
      ),
      adminOnly: true,
      requiredPermissions: ['xui.read']
    },
    {
      path: '/forward',
      label: '转发管理',
      icon: (
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
        </svg>
      )
    },
    {
      path: '/portal',
      label: '自定义导航',
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12h14"></path>
          <path d="M12 5l7 7-7 7"></path>
        </svg>
      ),
      adminOnly: true,
      requiredPermissions: ['portal.read']
    },
    {
      path: '/tunnel',
      label: '隧道管理',
      icon: (
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M12.586 4.586a2 2 0 112.828 2.828l-3 3a2 2 0 01-2.828 0 1 1 0 00-1.414 1.414 4 4 0 005.656 0l3-3a4 4 0 00-5.656-5.656l-1.5 1.5a1 1 0 101.414 1.414l1.5-1.5zm-5 5a2 2 0 012.828 0 1 1 0 101.414-1.414 4 4 0 00-5.656 0l-3 3a4 4 0 105.656 5.656l1.5-1.5a1 1 0 10-1.414-1.414l-1.5 1.5a2 2 0 11-2.828-2.828l3-3z" clipRule="evenodd" />
        </svg>
      ),
      adminOnly: true,
      requiredPermissions: ['tunnel.read']
    },
    {
      path: '/node',
      label: '节点监控',
      icon: (
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M3 3a1 1 0 000 2v8a2 2 0 002 2h2.586l-1.293 1.293a1 1 0 101.414 1.414L10 15.414l2.293 2.293a1 1 0 001.414-1.414L12.414 15H15a2 2 0 002-2V5a1 1 0 100-2H3zm11.707 4.707a1 1 0 00-1.414-1.414L10 9.586 8.707 8.293a1 1 0 00-1.414 0l-2 2a1 1 0 101.414 1.414L8 10.414l1.293 1.293a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
        </svg>
      ),
      adminOnly: true,
      requiredPermissions: ['node.read']
    },
    {
      path: '/limit',
      label: '限速管理',
      icon: (
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
        </svg>
      ),
      adminOnly: true,
      requiredPermissions: ['speed_limit.read']
    },
    {
      path: '/user',
      label: '用户管理',
      icon: (
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
          <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z" />
        </svg>
      ),
      adminOnly: true,
      requiredPermissions: ['biz_user.read']
    },
    {
      path: '/iam/users',
      label: '组织用户',
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round">
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path>
          <circle cx="9" cy="7" r="4"></circle>
          <path d="M22 21v-2a4 4 0 0 0-3-3.87"></path>
          <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
        </svg>
      ),
      adminOnly: true,
      requiredPermissions: ['iam_user.read']
    },
    {
      path: '/iam/roles',
      label: '角色权限',
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2l7 4v6c0 5-3.5 9.74-7 10-3.5-.26-7-5-7-10V6l7-4z"></path>
          <path d="M9 12l2 2 4-4"></path>
        </svg>
      ),
      adminOnly: true,
      requiredPermissions: ['iam_role.read']
    },
    {
      path: '/portal/config',
      label: '导航配置',
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 6h16"></path>
          <path d="M4 12h10"></path>
          <path d="M4 18h7"></path>
        </svg>
      ),
      adminOnly: true,
      requiredPermissions: ['portal.write']
    },
    {
      path: '/config',
      label: '网站配置',
      icon: (
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
        </svg>
      ),
      adminOnly: true,
      requiredPermissions: ['site_config.read']
    },
    {
      path: '/protocol',
      label: '协议管理',
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 6h16M4 12h16M4 18h16"></path>
        </svg>
      ),
      adminOnly: true,
      requiredPermissions: ['protocol.read']
    },
    {
      path: '/tag',
      label: '标签管理',
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round">
          <path d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"></path>
        </svg>
      ),
      adminOnly: true,
      requiredPermissions: ['tag.read']
    },
    {
      path: '/server-dashboard',
      label: '服务器看板',
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
          <line x1="8" y1="21" x2="16" y2="21" />
          <line x1="12" y1="17" x2="12" y2="21" />
        </svg>
      ),
      adminOnly: true,
      requiredPermissions: ['server_dashboard.read']
    },
    {
      path: '/monitor',
      label: '诊断看板',
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round">
          <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
        </svg>
      ),
      adminOnly: true,
      requiredPermissions: ['monitor.read']
    },
    {
      path: '/probe',
      label: '探针配置',
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 6v6l4 2" />
        </svg>
      ),
      adminOnly: true,
      requiredPermissions: ['probe.read']
    },
    {
      path: '/alert',
      label: '告警管理',
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
      ),
      adminOnly: true,
      requiredPermissions: ['alert.read']
    },
    {
      path: '/cost',
      label: '成本分析',
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round">
          <line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
        </svg>
      ),
      adminOnly: true,
      requiredPermissions: ['asset.read']
    },
    {
      path: '/traffic',
      label: '流量分析',
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round">
          <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
        </svg>
      ),
      adminOnly: true,
      requiredPermissions: ['server_dashboard.read']
    }
  ];


  // 检查移动端
  const checkMobile = () => {
    setIsMobile(window.innerWidth <= 768);
    if (window.innerWidth > 768) {
      setMobileMenuVisible(false);
    }
  };

  useEffect(() => {
    // 获取用户信息
    const name = localStorage.getItem('name') || 'Admin';

    setUsername(name);
    setIsAdmin(checkIsAdmin());

    // 响应式检查
    checkMobile();
    window.addEventListener('resize', checkMobile);

    return () => {
      window.removeEventListener('resize', checkMobile);
    };
  }, []);

  // 退出登录
  const handleLogout = () => {
    safeLogout();
    navigate('/');
  };

  // 切换移动端菜单
  const toggleMobileMenu = () => {
    setMobileMenuVisible(!mobileMenuVisible);
  };

  // 隐藏移动端菜单
  const hideMobileMenu = () => {
    setMobileMenuVisible(false);
  };

  // 菜单点击处理
  const handleMenuClick = (path: string) => {
    navigate(path);
    if (isMobile) {
      hideMobileMenu();
    }
  };

  // 密码表单验证
  const validatePasswordForm = (): boolean => {
    if (!passwordForm.newUsername.trim()) {
      toast.error('请输入新用户名');
      return false;
    }
    if (passwordForm.newUsername.length < 3) {
      toast.error('用户名长度至少3位');
      return false;
    }
    if (!passwordForm.currentPassword) {
      toast.error('请输入当前密码');
      return false;
    }
    if (!passwordForm.newPassword) {
      toast.error('请输入新密码');
      return false;
    }
    if (passwordForm.newPassword.length < 6) {
      toast.error('新密码长度不能少于6位');
      return false;
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      toast.error('两次输入密码不一致');
      return false;
    }
    return true;
  };

  // 提交密码修改
  const handlePasswordSubmit = async () => {
    if (!validatePasswordForm()) return;

    setPasswordLoading(true);
    try {
      const response = await updatePassword(passwordForm);
      if (response.code === 0) {
        toast.success('密码修改成功，请重新登录');
        onOpenChange();
        handleLogout();
      } else {
        toast.error(response.msg || '密码修改失败');
      }
    } catch (error) {
      toast.error('修改密码时发生错误');
      console.error('修改密码错误:', error);
    } finally {
      setPasswordLoading(false);
    }
  };

  // 重置密码表单
  const resetPasswordForm = () => {
    setPasswordForm({
      newUsername: '',
      currentPassword: '',
      newPassword: '',
      confirmPassword: ''
    });
  };

  // 过滤菜单项（根据权限）
  const filteredMenuItems = menuItems.filter(item =>
    (!item.adminOnly || isAdmin) && hasAnyPermission(item.requiredPermissions || [])
  );

  // Primary nav items (always visible in pill bar)
  const primaryPaths = ['/dashboard', '/forward', '/tunnel', '/node'];
  const primaryMenuItems = primaryPaths
    .map((path) => filteredMenuItems.find((item) => item.path === path))
    .filter((item): item is MenuItem => Boolean(item));

  // Grouped dropdown menus
  const serverGroupPaths = ['/server-dashboard', '/assets', '/cost', '/traffic'];
  const monitorGroupPaths = ['/monitor', '/probe', '/alert'];
  const systemGroupPaths = ['/xui', '/portal', '/portal/config', '/limit', '/user', '/iam/users', '/iam/roles', '/config', '/protocol', '/tag'];

  const serverGroup = serverGroupPaths.map(p => filteredMenuItems.find(i => i.path === p)).filter((i): i is MenuItem => Boolean(i));
  const monitorGroup = monitorGroupPaths.map(p => filteredMenuItems.find(i => i.path === p)).filter((i): i is MenuItem => Boolean(i));
  const systemGroup = systemGroupPaths.map(p => filteredMenuItems.find(i => i.path === p)).filter((i): i is MenuItem => Boolean(i));

  const allGroupPaths = new Set([...primaryPaths, ...serverGroupPaths, ...monitorGroupPaths, ...systemGroupPaths]);
  const ungroupedItems = filteredMenuItems.filter(i => !allGroupPaths.has(i.path));

  const isInGroup = (paths: string[]) => paths.includes(location.pathname);
  const isManagementRoute = isInGroup(systemGroupPaths) || ungroupedItems.some(i => i.path === location.pathname);
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(0,111,238,0.08),_transparent_22%),linear-gradient(180deg,_rgba(248,250,252,0.96),_rgba(241,245,249,0.9))] text-foreground dark:bg-black">
      {/* 移动端遮罩层 */}
      {isMobile && mobileMenuVisible && (
        <div
          className="fixed inset-0 z-40 backdrop-blur-sm bg-white/50 dark:bg-black/30"
          onClick={hideMobileMenu}
        />
      )}

      {/* 移动端抽屉菜单 */}
      {isMobile && (
        <aside
          className={`
            fixed left-0 top-0 z-50 h-screen w-72 border-r border-divider bg-white/95 shadow-2xl backdrop-blur-xl transition-transform duration-300 ease-in-out dark:bg-black/95
            ${mobileMenuVisible ? 'translate-x-0' : '-translate-x-full'}
          `}
        >
          <div className="flex items-center justify-between border-b border-divider px-5 py-4">
            <div className="flex items-center gap-3 min-w-0">
              <Logo size={22} />
              <div className="min-w-0">
                <div className="truncate text-sm font-bold text-foreground">{siteConfig.name}</div>
                <div className="text-[11px] text-default-500">{siteConfig.environment_name} · {siteConfig.release_version}</div>
              </div>
            </div>
            <Button isIconOnly size="sm" variant="light" onPress={hideMobileMenu}>
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </Button>
          </div>

          <nav className="flex-1 overflow-y-auto px-4 py-5">
            <div className="space-y-1">
              {filteredMenuItems.map((item) => {
                const isActive = location.pathname === item.path;
                return (
                  <button
                    key={item.path}
                    onClick={() => handleMenuClick(item.path)}
                    className={`
                      flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left transition-colors
                      ${isActive
                        ? 'bg-primary text-white shadow-lg shadow-primary/25'
                        : 'text-default-700 hover:bg-default-100 dark:text-default-200 dark:hover:bg-default-100/10'}
                    `}
                  >
                    <span className="flex-shrink-0">{item.icon}</span>
                    <span className="text-sm font-medium">{item.label}</span>
                  </button>
                );
              })}
            </div>
          </nav>

          <div className="border-t border-divider px-5 py-4 text-xs text-default-500">
            <div className="flex items-center justify-between">
              <span>{siteConfig.release_version}</span>
              <span>{siteConfig.build_revision}</span>
            </div>
            <p className="mt-2">{siteConfig.environment_name} 环境 · 本机布局已收敛为统一头部导航。</p>
          </div>
        </aside>
      )}

      <div className="flex min-h-screen flex-col">
        <header className="sticky top-0 z-30 border-b border-white/70 bg-white/88 shadow-sm backdrop-blur-xl dark:border-default-100/10 dark:bg-black/84">
          <div className="mx-auto flex max-w-[1800px] items-center gap-2.5 px-3 py-2.5 lg:px-6">
            {isMobile && (
              <Button
                isIconOnly
                size="sm"
                variant="light"
                onPress={toggleMobileMenu}
                className="flex-shrink-0"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </Button>
            )}

            <div className="min-w-0 flex-shrink-0 xl:w-[240px]">
              <button
                type="button"
                onClick={() => handleMenuClick('/dashboard')}
                className="flex w-full items-center gap-2 rounded-2xl text-left transition-colors hover:bg-default-100/60 p-1.5 -m-1.5"
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-primary/10 text-primary shadow-inner">
                  <Logo size={20} />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <h1 className="truncate text-[15px] font-black tracking-[0.04em] text-foreground lg:text-base">{siteConfig.name}</h1>
                    <span className="rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.22em] text-primary">
                      {siteConfig.environment_name}
                    </span>
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-default-500">
                    <span>{siteConfig.release_version}</span>
                    <span>{siteConfig.build_revision}</span>
                  </div>
                </div>
              </button>
            </div>

            {!isMobile && (
              <nav className="min-w-0 flex-1 px-1">
                <div className="flex items-center overflow-x-auto [scrollbar-width:none]">
                  <div className="inline-flex min-w-max items-center gap-0.5 rounded-[24px] border border-divider bg-white/82 p-1 shadow-[0_12px_32px_-24px_rgba(15,23,42,0.45)] dark:bg-default-100/10">
                    {primaryMenuItems.map((item) => {
                      const isActive = location.pathname === item.path;
                      return (
                        <button
                          key={item.path}
                          onClick={() => handleMenuClick(item.path)}
                          className={`
                            inline-flex h-8.5 items-center gap-2 rounded-full px-3 text-sm font-semibold transition-all
                            ${isActive
                              ? 'bg-primary text-white shadow-lg shadow-primary/25'
                              : 'text-default-500 hover:bg-white hover:text-foreground dark:hover:bg-default-100/10 dark:hover:text-default-100'}
                          `}
                        >
                          <span className="flex-shrink-0">{item.icon}</span>
                          <span>{item.label}</span>
                        </button>
                      );
                    })}

                    {/* Server group dropdown */}
                    {serverGroup.length > 0 && (
                      <Dropdown placement="bottom-start">
                        <DropdownTrigger>
                          <button className={`inline-flex h-8.5 items-center gap-1.5 rounded-full px-3 text-sm font-semibold transition-all ${
                            isInGroup(serverGroupPaths) ? 'bg-primary text-white shadow-lg shadow-primary/25' : 'text-default-500 hover:bg-white hover:text-foreground dark:hover:bg-default-100/10'
                          }`}>
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" /></svg>
                            <span>服务器</span>
                            <svg className="w-3 h-3 opacity-60" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                          </button>
                        </DropdownTrigger>
                        <DropdownMenu aria-label="服务器菜单">
                          {serverGroup.map(item => (
                            <DropdownItem key={item.path} startContent={item.icon} onPress={() => handleMenuClick(item.path)}
                              className={location.pathname === item.path ? 'text-primary font-semibold' : ''}>
                              {item.label}
                            </DropdownItem>
                          ))}
                        </DropdownMenu>
                      </Dropdown>
                    )}

                    {/* Monitor group dropdown */}
                    {monitorGroup.length > 0 && (
                      <Dropdown placement="bottom-start">
                        <DropdownTrigger>
                          <button className={`inline-flex h-8.5 items-center gap-1.5 rounded-full px-3 text-sm font-semibold transition-all ${
                            isInGroup(monitorGroupPaths) ? 'bg-primary text-white shadow-lg shadow-primary/25' : 'text-default-500 hover:bg-white hover:text-foreground dark:hover:bg-default-100/10'
                          }`}>
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></svg>
                            <span>监控</span>
                            <svg className="w-3 h-3 opacity-60" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                          </button>
                        </DropdownTrigger>
                        <DropdownMenu aria-label="监控菜单">
                          {monitorGroup.map(item => (
                            <DropdownItem key={item.path} startContent={item.icon} onPress={() => handleMenuClick(item.path)}
                              className={location.pathname === item.path ? 'text-primary font-semibold' : ''}>
                              {item.label}
                            </DropdownItem>
                          ))}
                        </DropdownMenu>
                      </Dropdown>
                    )}
                  </div>
                </div>
              </nav>
            )}

            <div className="ml-auto flex items-center gap-2 lg:gap-3">
              {/* System group dropdown */}
              {systemGroup.length > 0 && (
                <Dropdown placement="bottom-end">
                  <DropdownTrigger>
                    <Button
                      size="sm"
                      variant={isManagementRoute ? "solid" : "flat"}
                      color={isManagementRoute ? "primary" : "default"}
                      className="h-10 rounded-[18px] border border-divider bg-white/80 px-3.5 font-semibold shadow-sm dark:bg-default-100/10"
                      startContent={
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
                        </svg>
                      }
                    >
                      {!isMobile && '系统'}
                    </Button>
                  </DropdownTrigger>
                  <DropdownMenu aria-label="系统菜单" className="max-h-80 overflow-y-auto">
                    {systemGroup.map(item => (
                      <DropdownItem key={item.path} startContent={item.icon} onPress={() => handleMenuClick(item.path)}
                        className={location.pathname === item.path ? 'text-primary font-semibold' : ''}>
                        {item.label}
                      </DropdownItem>
                    ))}
                  </DropdownMenu>
                </Dropdown>
              )}

              <Dropdown placement="bottom-end">
                <DropdownTrigger>
                  <Button
                    size="sm"
                    variant="flat"
                    className="h-10 min-w-[136px] justify-between gap-2 rounded-[20px] border border-divider bg-white/85 px-2 pr-2.5 font-semibold shadow-sm dark:bg-default-100/10"
                  >
                    <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                      {username?.slice(0, 1).toUpperCase() || 'U'}
                    </span>
                    {!isMobile && (
                      <div className="min-w-0 flex-1 text-left leading-tight">
                        <div className="truncate text-sm font-semibold text-foreground">{username}</div>
                        <div className="pt-0.5 text-[10px] uppercase tracking-[0.18em] text-default-400">{isAdmin ? 'Admin' : 'Member'}</div>
                      </div>
                    )}
                    <svg className="h-4 w-4 text-default-400" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                  </Button>
                </DropdownTrigger>
                <DropdownMenu aria-label="用户菜单">
                  <DropdownItem key="profile" onPress={() => handleMenuClick('/profile')}>
                    个人中心
                  </DropdownItem>
                  <DropdownItem key="change-password" onPress={onOpen}>
                    修改密码
                  </DropdownItem>
                  <DropdownItem
                    key="logout"
                    className="text-danger"
                    color="danger"
                    onPress={handleLogout}
                  >
                    退出登录
                  </DropdownItem>
                </DropdownMenu>
              </Dropdown>
            </div>
          </div>

          {isMobile && (
            <div className="overflow-x-auto border-t border-divider/60 px-3 py-2 [scrollbar-width:none]">
              <div className="flex min-w-max items-center gap-2">
                {primaryMenuItems.map((item) => {
                  const isActive = location.pathname === item.path;
                  return (
                    <Button
                      key={item.path}
                      size="sm"
                      variant={isActive ? "solid" : "flat"}
                      color={isActive ? "primary" : "default"}
                      onPress={() => handleMenuClick(item.path)}
                      className="font-medium"
                    >
                      {item.label}
                    </Button>
                  );
                })}
              </div>
            </div>
          )}
        </header>

        <main className="mx-auto flex w-full max-w-[1800px] flex-1 flex-col px-3 py-4 lg:px-6 lg:py-6">
          {children}
        </main>
      </div>

      {/* 修改密码弹窗 */}
      <Modal
        isOpen={isOpen}
        onOpenChange={() => {
          onOpenChange();
          resetPasswordForm();
        }}
        size="2xl"
        scrollBehavior="outside"
        backdrop="blur"
        placement="center"
      >
        <ModalContent>
          {(onClose: () => void) => (
            <>
              <ModalHeader className="flex flex-col gap-1">修改密码</ModalHeader>
              <ModalBody>
                <div className="space-y-4">
                  <Input
                    label="新用户名"
                    placeholder="请输入新用户名（至少3位）"
                    value={passwordForm.newUsername}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPasswordForm(prev => ({ ...prev, newUsername: e.target.value }))}
                    variant="bordered"
                  />
                  <Input
                    label="当前密码"
                    type="password"
                    placeholder="请输入当前密码"
                    value={passwordForm.currentPassword}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPasswordForm(prev => ({ ...prev, currentPassword: e.target.value }))}
                    variant="bordered"
                  />
                  <Input
                    label="新密码"
                    type="password"
                    placeholder="请输入新密码（至少6位）"
                    value={passwordForm.newPassword}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPasswordForm(prev => ({ ...prev, newPassword: e.target.value }))}
                    variant="bordered"
                  />
                  <Input
                    label="确认密码"
                    type="password"
                    placeholder="请再次输入新密码"
                    value={passwordForm.confirmPassword}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPasswordForm(prev => ({ ...prev, confirmPassword: e.target.value }))}
                    variant="bordered"
                  />
                </div>
              </ModalBody>
              <ModalFooter>
                <Button color="default" variant="light" onPress={onClose}>
                  取消
                </Button>
                <Button
                  color="primary"
                  onPress={handlePasswordSubmit}
                  isLoading={passwordLoading}
                >
                  确定
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </div>
  );
} 
