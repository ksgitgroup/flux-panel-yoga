import { Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";

import IndexPage from "@/pages/index";
import DingtalkCallbackPage from "@/pages/dingtalk-callback";
import ChangePasswordPage from "@/pages/change-password";
import DashboardPage from "@/pages/dashboard";
import ForwardPage from "@/pages/forward";
import TunnelPage from "@/pages/tunnel";
import NodePage from "@/pages/node";
import UserPage from "@/pages/user";
import IamUsersPage from "@/pages/iam-users";
import IamRolesPage from "@/pages/iam-roles";
import ProfilePage from "@/pages/profile";
import LimitPage from "@/pages/limit";
import ConfigPage from "@/pages/config";
import { SettingsPage } from "@/pages/settings";
import MonitorPage from "@/pages/monitor";
import ProtocolPage from "@/pages/protocol";
import TagPage from "@/pages/tag";
import XuiPage from "@/pages/xui";
import AssetsPage from "@/pages/assets";
import PortalPage from "@/pages/portal";
import PortalConfigPage from "@/pages/portal-config";
import ProbePage from "@/pages/probe";
import AlertPage from "@/pages/alert";
import ServerDashboardPage from "@/pages/server-dashboard";
import CostAnalysisPage from "@/pages/cost-analysis";
import TrafficAnalysisPage from "@/pages/traffic-analysis";
import { SystemWorkspace } from "@/components/SystemWorkspace";

import AdminLayout from "@/layouts/admin";
import H5Layout from "@/layouts/h5";
import H5SimpleLayout from "@/layouts/h5-simple";
import { ErrorBoundary } from "@/components/ErrorBoundary";

import { getTwoFactorStatus } from "@/api";
import { hasAnyPermission, isLoggedIn } from "@/utils/auth";
import { siteConfig } from "@/config/site";

// 检测是否为H5模式
const useH5Mode = () => {
  // 立即检测H5模式，避免初始渲染时的闪屏
  const getInitialH5Mode = () => {
    // 检测移动设备或小屏幕
    const isMobile = window.innerWidth <= 768;
    // 检测是否为移动端浏览器
    const isMobileBrowser = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    // 检测URL参数是否包含h5模式
    const urlParams = new URLSearchParams(window.location.search);
    const isH5Param = urlParams.get('h5') === 'true';

    return isMobile || isMobileBrowser || isH5Param;
  };

  const [isH5, setIsH5] = useState(getInitialH5Mode);

  useEffect(() => {
    const checkH5Mode = () => {
      // 检测移动设备或小屏幕
      const isMobile = window.innerWidth <= 768;
      // 检测是否为移动端浏览器
      const isMobileBrowser = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      // 检测URL参数是否包含h5模式
      const urlParams = new URLSearchParams(window.location.search);
      const isH5Param = urlParams.get('h5') === 'true';

      setIsH5(isMobile || isMobileBrowser || isH5Param);
    };

    window.addEventListener('resize', checkH5Mode);

    return () => window.removeEventListener('resize', checkH5Mode);
  }, []);

  return isH5;
};

const useForcedAuthState = (authenticated: boolean) => {
  const [mustChangePassword, setMustChangePassword] = useState(localStorage.getItem('force_password_change') === 'true');
  const [mustSetupTwoFactor, setMustSetupTwoFactor] = useState(localStorage.getItem('force_two_factor_setup') === 'true');
  const [checking, setChecking] = useState(authenticated);

  useEffect(() => {
    const passwordChangeRequired = localStorage.getItem('force_password_change') === 'true';
    const initialTwoFactorRequired = localStorage.getItem('force_two_factor_setup') === 'true';

    setMustChangePassword(passwordChangeRequired);
    setMustSetupTwoFactor(initialTwoFactorRequired);

    if (!authenticated) {
      setChecking(false);
      return;
    }

    if (passwordChangeRequired) {
      localStorage.removeItem('force_two_factor_setup');
      setMustSetupTwoFactor(false);
      setChecking(false);
      return;
    }

    let cancelled = false;
    setChecking(true);

    const syncTwoFactorRequirement = async () => {
      let forceSetup = initialTwoFactorRequired;

      try {
        const response = await getTwoFactorStatus();
        if (response.code === 0) {
          forceSetup = Boolean(response.data.required && !response.data.enabled);
          if (forceSetup) {
            localStorage.setItem('force_two_factor_setup', 'true');
          } else {
            localStorage.removeItem('force_two_factor_setup');
          }
        }
      } catch (error) {
        console.error('刷新二步验证状态失败:', error);
      } finally {
        if (!cancelled) {
          setMustChangePassword(passwordChangeRequired);
          setMustSetupTwoFactor(forceSetup);
          setChecking(false);
        }
      }
    };

    void syncTwoFactorRequirement();

    return () => {
      cancelled = true;
    };
  }, [authenticated]);

  return { checking, mustChangePassword, mustSetupTwoFactor };
};

// 简化的路由保护组件 - 使用 React Router 导航避免循环
const ProtectedRoute = ({
  children,
  useSimpleLayout = false,
  skipLayout = false,
  requiredPermissions = []
}: {
  children: React.ReactNode,
  useSimpleLayout?: boolean,
  skipLayout?: boolean,
  requiredPermissions?: string[]
}) => {
  const authenticated = isLoggedIn();
  const isH5 = useH5Mode();
  const navigate = useNavigate();
  const location = useLocation();
  const { checking, mustChangePassword, mustSetupTwoFactor } = useForcedAuthState(authenticated);
  const forcedPath = mustChangePassword ? '/change-password' : mustSetupTwoFactor ? '/profile' : null;
  const authorized = hasAnyPermission(requiredPermissions);

  useEffect(() => {
    if (!authenticated) {
      // 使用 React Router 导航，避免无限跳转
      navigate('/', { replace: true });
      return;
    }
    if (checking) {
      return;
    }
    if (forcedPath && location.pathname !== forcedPath) {
      navigate(forcedPath, { replace: true });
    }
  }, [authenticated, checking, forcedPath, location.pathname, navigate]);

  if (!authenticated || checking || (forcedPath && location.pathname !== forcedPath)) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-white dark:bg-black">
        <div className="text-lg text-gray-700 dark:text-gray-200"></div>
      </div>
    );
  }

  if (!authorized) {
    return (
      <AdminLayout>
        <div className="flex min-h-[50vh] items-center justify-center">
          <div className="rounded-[28px] border border-danger/20 bg-danger-50/70 p-8 text-center shadow-sm">
            <h1 className="text-2xl font-bold text-danger">权限不足</h1>
            <p className="mt-3 text-sm text-danger-700">当前账号没有访问该模块的权限。</p>
          </div>
        </div>
      </AdminLayout>
    );
  }

  // 如果跳过布局，直接返回子组件
  if (skipLayout) {
    return <>{children}</>;
  }

  // 根据模式和页面类型选择布局
  let Layout;
  if (isH5 && useSimpleLayout) {
    Layout = H5SimpleLayout;
  } else if (isH5) {
    Layout = H5Layout;
  } else {
    Layout = AdminLayout;
  }

  return <Layout>{children}</Layout>;
};


// 登录页面路由组件 - 已登录则重定向到dashboard
const LoginRoute = () => {
  const authenticated = isLoggedIn();
  const navigate = useNavigate();
  const { checking, mustChangePassword, mustSetupTwoFactor } = useForcedAuthState(authenticated);
  const redirectPath = mustChangePassword ? '/change-password' : mustSetupTwoFactor ? '/profile' : '/dashboard';

  useEffect(() => {
    if (authenticated && !checking) {
      // 使用 React Router 导航，避免无限跳转
      navigate(redirectPath, { replace: true });
    }
  }, [authenticated, checking, navigate, redirectPath]);

  if (authenticated) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-100 dark:bg-black">
        <div className="text-lg text-gray-700 dark:text-gray-200"></div>
      </div>
    );
  }

  return <IndexPage />;
};

function App() {
  // 立即设置页面标题（使用已从缓存读取的配置）
  useEffect(() => {
    document.title = siteConfig.name;

    // 异步检查是否有配置更新
    const checkTitleUpdate = async () => {
      try {
        // 引入必要的函数
        const { getCachedConfig } = await import('@/config/site');
        const cachedAppName = await getCachedConfig('app_name');
        if (cachedAppName && cachedAppName !== document.title) {
          document.title = cachedAppName;
        }
      } catch (error) {
        console.warn('检查标题更新失败:', error);
      }
    };

    // 延迟检查，避免阻塞初始渲染
    const timer = setTimeout(checkTitleUpdate, 100);

    return () => clearTimeout(timer);
  }, []);

  return (
    <Routes>
      <Route path="/" element={<LoginRoute />} />
      <Route path="/login/dingtalk/callback" element={<DingtalkCallbackPage />} />
      <Route
        path="/change-password"
        element={
          <ProtectedRoute skipLayout={true}>
            <ChangePasswordPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <DashboardPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/forward"
        element={
          <ProtectedRoute>
            <ForwardPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/portal"
        element={
          <ProtectedRoute>
            <PortalPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/tunnel"
        element={
          <ProtectedRoute>
            <TunnelPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/node"
        element={
          <ProtectedRoute>
            <NodePage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/user"
        element={
          <ProtectedRoute requiredPermissions={['biz_user.read']}>
            <SystemWorkspace>
              <UserPage />
            </SystemWorkspace>
          </ProtectedRoute>
        }
      />
      <Route
        path="/iam/users"
        element={
          <ProtectedRoute requiredPermissions={['iam_user.read']}>
            <SystemWorkspace>
              <IamUsersPage />
            </SystemWorkspace>
          </ProtectedRoute>
        }
      />
      <Route
        path="/iam/roles"
        element={
          <ProtectedRoute requiredPermissions={['iam_role.read']}>
            <SystemWorkspace>
              <IamRolesPage />
            </SystemWorkspace>
          </ProtectedRoute>
        }
      />
      <Route
        path="/protocol"
        element={
          <ProtectedRoute requiredPermissions={['protocol.read']}>
            <SystemWorkspace>
              <ProtocolPage />
            </SystemWorkspace>
          </ProtectedRoute>
        }
      />
      <Route
        path="/tag"
        element={
          <ProtectedRoute requiredPermissions={['tag.read']}>
            <SystemWorkspace>
              <TagPage />
            </SystemWorkspace>
          </ProtectedRoute>
        }
      />
      <Route
        path="/assets"
        element={
          <ProtectedRoute requiredPermissions={['asset.read']}>
            <AssetsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/server-dashboard"
        element={
          <ProtectedRoute requiredPermissions={['server_dashboard.read']}>
            <ServerDashboardPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/xui"
        element={
          <ProtectedRoute requiredPermissions={['xui.read']}>
            <SystemWorkspace>
            <XuiPage />
            </SystemWorkspace>
          </ProtectedRoute>
        }
      />
      <Route
        path="/portal/config"
        element={
          <ProtectedRoute requiredPermissions={['portal.write']}>
            <SystemWorkspace>
              <PortalConfigPage />
            </SystemWorkspace>
          </ProtectedRoute>
        }
      />
      <Route
        path="/profile"
        element={
          <ProtectedRoute>
            <ProfilePage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/limit"
        element={
          <ProtectedRoute requiredPermissions={['speed_limit.read']}>
            <SystemWorkspace>
              <LimitPage />
            </SystemWorkspace>
          </ProtectedRoute>
        }
      />
      <Route
        path="/config"
        element={
          <ProtectedRoute requiredPermissions={['site_config.read']}>
            <SystemWorkspace>
              <ConfigPage />
            </SystemWorkspace>
          </ProtectedRoute>
        }
      />
      <Route
        path="/probe"
        element={
          <ProtectedRoute requiredPermissions={['probe.read']}>
            <SystemWorkspace>
              <ProbePage />
            </SystemWorkspace>
          </ProtectedRoute>
        }
      />
      <Route
        path="/monitor"
        element={
          <ProtectedRoute useSimpleLayout={true} requiredPermissions={['monitor.read']}>
            <MonitorPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/alert"
        element={
          <ProtectedRoute requiredPermissions={['alert.read']}>
            <SystemWorkspace>
              <AlertPage />
            </SystemWorkspace>
          </ProtectedRoute>
        }
      />
      <Route
        path="/cost"
        element={
          <ProtectedRoute requiredPermissions={['asset.read']}>
            <CostAnalysisPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/traffic"
        element={
          <ProtectedRoute requiredPermissions={['server_dashboard.read']}>
            <TrafficAnalysisPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/settings"
        element={<SettingsPage />}
      />
    </Routes>
  );
}

function AppWithErrorBoundary() {
  return (
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  );
}

export default AppWithErrorBoundary;
