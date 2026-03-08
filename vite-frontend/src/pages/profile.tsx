import React, { useEffect, useState } from 'react';
import { Card, CardBody } from "@heroui/card";
import { Button } from "@heroui/button";
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from "@heroui/modal";
import { Input } from "@heroui/input";
import { Chip } from "@heroui/chip";
import { toast } from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import QRCode from 'qrcode';

import { siteConfig } from '@/config/site';
import {
  disableTwoFactor,
  enableTwoFactor,
  getTwoFactorStatus,
  setupTwoFactor,
  updatePassword,
  type TwoFactorSetupResponse,
  type TwoFactorStatusResponse,
} from '@/api';
import { safeLogout } from '@/utils/logout';

interface PasswordForm {
  newUsername: string;
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

interface TwoFactorCodeForm {
  currentPassword: string;
  oneTimeCode: string;
}

interface MenuItem {
  path: string;
  label: string;
  icon: React.ReactNode;
  color: string;
  description: string;
}

const getEnforcementLabel = (scope?: string) => {
  if (scope === 'all') return '全站强制';
  if (scope === 'admin') return '管理员强制';
  return '可选启用';
};

export default function ProfilePage() {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [twoFactorLoading, setTwoFactorLoading] = useState(false);
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [twoFactorSetupOpen, setTwoFactorSetupOpen] = useState(false);
  const [twoFactorDisableOpen, setTwoFactorDisableOpen] = useState(false);
  const [twoFactorStatus, setTwoFactorStatus] = useState<TwoFactorStatusResponse | null>(null);
  const [twoFactorSetupData, setTwoFactorSetupData] = useState<TwoFactorSetupResponse | null>(null);
  const [twoFactorQrDataUrl, setTwoFactorQrDataUrl] = useState('');
  const [mustSetupTwoFactor, setMustSetupTwoFactor] = useState(localStorage.getItem('force_two_factor_setup') === 'true');
  const [passwordForm, setPasswordForm] = useState<PasswordForm>({
    newUsername: '',
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [enableForm, setEnableForm] = useState<TwoFactorCodeForm>({
    currentPassword: '',
    oneTimeCode: ''
  });
  const [disableForm, setDisableForm] = useState<TwoFactorCodeForm>({
    currentPassword: '',
    oneTimeCode: ''
  });

  const adminMenuItems: MenuItem[] = [
    {
      path: '/limit',
      label: '限速管理',
      icon: (
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
        </svg>
      ),
      color: 'bg-orange-100 dark:bg-orange-500/20 text-orange-600 dark:text-orange-400',
      description: '管理用户限速策略'
    },
    {
      path: '/user',
      label: '用户管理',
      icon: (
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
          <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z" />
        </svg>
      ),
      color: 'bg-blue-100 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400',
      description: '管理系统用户'
    },
    {
      path: '/config',
      label: '网站配置',
      icon: (
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
        </svg>
      ),
      color: 'bg-purple-100 dark:bg-purple-500/20 text-purple-600 dark:text-purple-400',
      description: '配置网站设置'
    }
  ];

  useEffect(() => {
    const name = localStorage.getItem('name') || 'Admin';

    let adminFlag = localStorage.getItem('admin') === 'true';
    if (localStorage.getItem('admin') === null) {
      const roleId = parseInt(localStorage.getItem('role_id') || '1', 10);
      adminFlag = roleId === 0;
      localStorage.setItem('admin', adminFlag.toString());
    }

    setUsername(name);
    setIsAdmin(adminFlag);
    setPasswordForm(prev => ({ ...prev, newUsername: name }));
    void loadTwoFactorStatus();
  }, []);

  useEffect(() => {
    let cancelled = false;

    const buildQr = async () => {
      if (!twoFactorSetupData?.otpauthUri) {
        setTwoFactorQrDataUrl('');
        return;
      }

      try {
        const dataUrl = await QRCode.toDataURL(twoFactorSetupData.otpauthUri, {
          width: 256,
          margin: 2,
          errorCorrectionLevel: 'H',
          color: {
            dark: '#111827',
            light: '#FFFFFFFF',
          },
        });
        if (!cancelled) {
          setTwoFactorQrDataUrl(dataUrl);
        }
      } catch (error) {
        console.error('生成 2FA 二维码失败:', error);
        if (!cancelled) {
          setTwoFactorQrDataUrl('');
          toast.error('二维码生成失败，请改用密钥手动绑定');
        }
      }
    };

    void buildQr();

    return () => {
      cancelled = true;
    };
  }, [twoFactorSetupData]);

  const loadTwoFactorStatus = async () => {
    try {
      const response = await getTwoFactorStatus();
      if (response.code === 0) {
        setTwoFactorStatus(response.data);
        if (response.data.enabled || !response.data.required) {
          localStorage.removeItem('force_two_factor_setup');
          setMustSetupTwoFactor(false);
        }
      } else {
        toast.error(response.msg || '读取二步验证状态失败');
      }
    } catch (error) {
      console.error('读取二步验证状态失败:', error);
      toast.error('读取二步验证状态失败');
    }
  };

  const handleLogout = () => {
    safeLogout();
    navigate('/', { replace: true });
  };

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

  const handlePasswordSubmit = async () => {
    if (!validatePasswordForm()) return;

    setPasswordLoading(true);
    try {
      const response = await updatePassword(passwordForm);
      if (response.code === 0) {
        toast.success('密码修改成功，请重新登录');
        setPasswordModalOpen(false);
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

  const resetPasswordForm = () => {
    setPasswordForm({
      newUsername: username,
      currentPassword: '',
      newPassword: '',
      confirmPassword: ''
    });
  };

  const resetEnableForm = () => {
    setEnableForm({
      currentPassword: '',
      oneTimeCode: ''
    });
  };

  const resetDisableForm = () => {
    setDisableForm({
      currentPassword: '',
      oneTimeCode: ''
    });
  };

  const copyToClipboard = async (content: string, label: string) => {
    try {
      await navigator.clipboard.writeText(content);
      toast.success(`${label}已复制`);
    } catch (error) {
      console.error(`复制${label}失败:`, error);
      toast.error(`复制${label}失败`);
    }
  };

  const handleStartTwoFactorSetup = async () => {
    setTwoFactorLoading(true);
    try {
      const response = await setupTwoFactor();
      if (response.code === 0) {
        setTwoFactorSetupData(response.data);
        setTwoFactorQrDataUrl('');
        resetEnableForm();
        setTwoFactorSetupOpen(true);
      } else {
        toast.error(response.msg || '初始化二步验证失败');
      }
    } catch (error) {
      console.error('初始化二步验证失败:', error);
      toast.error('初始化二步验证失败');
    } finally {
      setTwoFactorLoading(false);
    }
  };

  const handleEnableTwoFactor = async () => {
    if (!enableForm.currentPassword.trim()) {
      toast.error('请输入当前密码');
      return;
    }
    if (!/^\d{6}$/.test(enableForm.oneTimeCode.trim())) {
      toast.error('请输入 6 位二步验证码');
      return;
    }

    setTwoFactorLoading(true);
    try {
      const response = await enableTwoFactor({
        currentPassword: enableForm.currentPassword,
        oneTimeCode: enableForm.oneTimeCode.trim()
      });
      if (response.code === 0) {
        toast.success(response.msg || '二步验证已启用');
        localStorage.removeItem('force_two_factor_setup');
        setMustSetupTwoFactor(false);
        setTwoFactorSetupOpen(false);
        setTwoFactorSetupData(null);
        setTwoFactorQrDataUrl('');
        resetEnableForm();
        await loadTwoFactorStatus();
      } else {
        toast.error(response.msg || '启用二步验证失败');
      }
    } catch (error) {
      console.error('启用二步验证失败:', error);
      toast.error('启用二步验证失败');
    } finally {
      setTwoFactorLoading(false);
    }
  };

  const handleDisableTwoFactor = async () => {
    if (!disableForm.currentPassword.trim()) {
      toast.error('请输入当前密码');
      return;
    }
    if (!/^\d{6}$/.test(disableForm.oneTimeCode.trim())) {
      toast.error('请输入 6 位二步验证码');
      return;
    }

    setTwoFactorLoading(true);
    try {
      const response = await disableTwoFactor({
        currentPassword: disableForm.currentPassword,
        oneTimeCode: disableForm.oneTimeCode.trim()
      });
      if (response.code === 0) {
        toast.success(response.msg || '二步验证已关闭');
        setTwoFactorDisableOpen(false);
        resetDisableForm();
        await loadTwoFactorStatus();
      } else {
        toast.error(response.msg || '关闭二步验证失败');
      }
    } catch (error) {
      console.error('关闭二步验证失败:', error);
      toast.error('关闭二步验证失败');
    } finally {
      setTwoFactorLoading(false);
    }
  };

  const disableActionBlocked = Boolean(twoFactorStatus?.enabled && twoFactorStatus?.required);

  return (
    <div className="px-3 lg:px-6 py-8 flex flex-col h-full">
      <div className="space-y-6 flex-1">
        <Card className="border border-gray-200 dark:border-default-200 shadow-md hover:shadow-lg transition-shadow">
          <CardBody className="p-5">
            <div className="flex items-center space-x-4">
              <div className="w-12 h-12 bg-primary-100 dark:bg-primary-900/30 rounded-full flex items-center justify-center">
                <svg className="w-6 h-6 text-primary" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-base font-medium text-foreground truncate">{username}</h3>
                <div className="flex items-center flex-wrap gap-2 mt-1">
                  <span className={`px-2 py-1 rounded-md text-xs font-medium ${
                    isAdmin
                      ? 'bg-primary-100 dark:bg-primary-500/20 text-primary-700 dark:text-primary-300'
                      : 'bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300'
                  }`}>
                    {isAdmin ? '管理员' : '普通用户'}
                  </span>
                  <Chip size="sm" variant="flat" color={twoFactorStatus?.enabled ? 'success' : 'default'}>
                    {twoFactorStatus?.enabled ? '2FA 已启用' : '2FA 未启用'}
                  </Chip>
                  <Chip size="sm" variant="flat" color={twoFactorStatus?.required ? 'warning' : 'default'}>
                    {getEnforcementLabel(twoFactorStatus?.enforcementScope)}
                  </Chip>
                  <span className="text-xs text-default-500">
                    {new Date().toLocaleDateString('zh-CN')}
                  </span>
                </div>
              </div>
            </div>
          </CardBody>
        </Card>

        {mustSetupTwoFactor && twoFactorStatus?.required && !twoFactorStatus.enabled && (
          <Card className="border border-warning-300 bg-warning-50/70 shadow-sm">
            <CardBody className="p-5 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="text-sm font-semibold text-warning-800">当前登录已被锁定到二步验证设置</div>
                <div className="mt-1 text-sm text-warning-700">
                  {twoFactorStatus.enforcementScope === 'all'
                    ? '当前站点启用了全站强制二步验证。完成绑定前，无法进入仪表盘和业务页面。'
                    : '当前站点对管理员启用了强制二步验证。完成绑定前，无法进入其他页面。'}
                </div>
              </div>
              <Button color="warning" onPress={() => void handleStartTwoFactorSetup()} isLoading={twoFactorLoading}>
                立即绑定 2FA
              </Button>
            </CardBody>
          </Card>
        )}

        <Card className="border border-gray-200 dark:border-default-200 shadow-md hover:shadow-lg transition-shadow">
          <CardBody className="p-5 space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h3 className="text-base font-semibold text-foreground">登录二步验证</h3>
                <p className="text-sm text-default-500 mt-1">
                  使用 Google Authenticator、Microsoft Authenticator、1Password 等支持 TOTP 的应用生成 6 位动态验证码。
                </p>
              </div>
              <Button
                color={twoFactorStatus?.enabled ? 'danger' : 'primary'}
                variant={twoFactorStatus?.enabled ? 'flat' : 'solid'}
                isDisabled={disableActionBlocked}
                onPress={() => {
                  if (twoFactorStatus?.enabled) {
                    resetDisableForm();
                    setTwoFactorDisableOpen(true);
                  } else {
                    void handleStartTwoFactorSetup();
                  }
                }}
                isLoading={twoFactorLoading}
              >
                {twoFactorStatus?.enabled
                  ? disableActionBlocked
                    ? '策略强制启用'
                    : '关闭验证'
                  : '开始设置'}
              </Button>
            </div>

            <div className="rounded-2xl bg-default-50 dark:bg-default-100 px-4 py-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-medium text-foreground">
                    {twoFactorStatus?.enabled ? '当前账号已开启额外验证' : '当前账号仅使用账号密码登录'}
                  </div>
                  <div className="mt-1 text-xs text-default-500">
                    {twoFactorStatus?.enabled
                      ? `绑定时间：${twoFactorStatus?.boundAt ? new Date(twoFactorStatus.boundAt).toLocaleString('zh-CN') : '已绑定'}`
                      : twoFactorStatus?.required
                        ? '当前安全策略要求该账号完成二步验证绑定。'
                        : '建议为管理员账号启用二步验证，降低凭据泄露风险。'}
                  </div>
                </div>
                <div className={`rounded-full px-3 py-1 text-xs font-medium ${
                  twoFactorStatus?.enabled
                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300'
                    : 'bg-default-200 text-default-700 dark:bg-default-300 dark:text-default-600'
                }`}>
                  {twoFactorStatus?.enabled ? '已保护' : '未保护'}
                </div>
              </div>
            </div>

            {disableActionBlocked && (
              <div className="rounded-xl border border-primary-200 bg-primary-50 px-4 py-3 text-sm text-primary-700">
                当前策略要求该账号始终启用二步验证。如需关闭，请先前往“网站配置”调整强制范围。
              </div>
            )}
          </CardBody>
        </Card>

        <Card className="border border-gray-200 dark:border-default-200 shadow-md hover:shadow-lg transition-shadow">
          <CardBody className="p-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {isAdmin && adminMenuItems.map((item) => (
                <button
                  key={item.path}
                  onClick={() => navigate(item.path)}
                  title={item.description}
                  className="flex flex-col items-center p-3 rounded-2xl bg-gray-50 dark:bg-default-100 hover:bg-gray-100 dark:hover:bg-default-200 transition-colors duration-200"
                >
                  <div className={`w-10 h-10 ${item.color} rounded-full flex items-center justify-center mb-2`}>
                    {item.icon}
                  </div>
                  <span className="text-xs text-foreground text-center">{item.label}</span>
                </button>
              ))}

              <button
                onClick={() => {
                  resetPasswordForm();
                  setPasswordModalOpen(true);
                }}
                className="flex flex-col items-center p-3 rounded-2xl bg-gray-50 dark:bg-default-100 hover:bg-gray-100 dark:hover:bg-default-200 transition-colors duration-200"
              >
                <div className="w-10 h-10 bg-blue-100 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400 rounded-full flex items-center justify-center mb-2">
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 8a6 6 0 01-7.743 5.743L10 14l-1 1-1 1H6v2H2v-4l4.257-4.257A6 6 0 1118 8zm-6-4a1 1 0 100 2 2 2 0 012 2 1 1 0 102 0 4 4 0 00-4-4z" clipRule="evenodd" />
                  </svg>
                </div>
                <span className="text-xs text-foreground text-center">修改密码</span>
              </button>

              <button
                onClick={handleLogout}
                className="flex flex-col items-center p-3 rounded-2xl bg-gray-50 dark:bg-default-100 hover:bg-gray-100 dark:hover:bg-default-200 transition-colors duration-200"
              >
                <div className="w-10 h-10 bg-red-100 dark:bg-red-500/20 text-red-600 dark:text-red-400 rounded-full flex items-center justify-center mb-2">
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M3 3a1 1 0 00-1 1v12a1 1 0 102 0V4a1 1 0 00-1-1zm10.293 9.293a1 1 0 001.414 1.414l3-3a1 1 0 000-1.414l-3-3a1 1 0 10-1.414 1.414L14.586 9H7a1 1 0 100 2h7.586l-1.293 1.293z" clipRule="evenodd" />
                  </svg>
                </div>
                <span className="text-xs text-foreground text-center">退出登录</span>
              </button>
            </div>
          </CardBody>
        </Card>

        <div className="fixed inset-x-0 bottom-20 text-center py-4">
          <p className="text-xs text-gray-400 dark:text-gray-500">
            {siteConfig.release_version} · {siteConfig.build_revision}
          </p>
        </div>
      </div>

      <Modal
        isOpen={passwordModalOpen}
        onOpenChange={(open) => {
          setPasswordModalOpen(open);
          if (!open) resetPasswordForm();
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

      <Modal
        isOpen={twoFactorSetupOpen}
        onOpenChange={(open) => {
          setTwoFactorSetupOpen(open);
          if (!open) {
            resetEnableForm();
          }
        }}
        size="3xl"
        scrollBehavior="outside"
        backdrop="blur"
        placement="center"
      >
        <ModalContent>
          {(onClose: () => void) => (
            <>
              <ModalHeader className="flex flex-col gap-1">启用二步验证</ModalHeader>
              <ModalBody>
                <div className="space-y-4">
                  <div className="rounded-xl border border-primary-200 bg-primary-50 px-4 py-3 text-sm text-primary-700">
                    <div>1. 扫描下方二维码，或在认证器应用中手动录入密钥</div>
                    <div>2. 账户名建议使用：{twoFactorSetupData?.username || username}</div>
                    <div>3. 输入当前密码和认证器生成的 6 位验证码完成绑定</div>
                  </div>

                  <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)] lg:items-start">
                    <div className="rounded-2xl border border-default-200 bg-white p-3 shadow-sm">
                      {twoFactorQrDataUrl ? (
                        <img src={twoFactorQrDataUrl} alt="2FA QR Code" className="mx-auto h-64 w-64 rounded-lg" />
                      ) : (
                        <div className="flex h-[220px] w-[220px] items-center justify-center rounded-lg bg-default-100 text-sm text-default-500">
                          正在生成二维码...
                        </div>
                      )}
                    </div>

                    <div className="space-y-4 min-w-0">
                      <div className="rounded-xl bg-default-50 dark:bg-default-100 p-4">
                        <div className="text-xs text-default-500">Issuer</div>
                        <div className="mt-1 text-sm font-medium text-foreground">{twoFactorSetupData?.issuer}</div>
                      </div>

                      <div className="rounded-xl bg-default-50 dark:bg-default-100 p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-xs text-default-500">密钥</div>
                          <Button
                            size="sm"
                            variant="flat"
                            onPress={() => twoFactorSetupData?.secret && copyToClipboard(twoFactorSetupData.secret, '密钥')}
                          >
                            复制密钥
                          </Button>
                        </div>
                        <div className="mt-2 break-all font-mono text-sm text-foreground">{twoFactorSetupData?.secret}</div>
                      </div>

                      <div className="rounded-xl bg-default-50 dark:bg-default-100 p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-xs text-default-500">绑定地址</div>
                          <Button
                            size="sm"
                            variant="flat"
                            onPress={() => twoFactorSetupData?.otpauthUri && copyToClipboard(twoFactorSetupData.otpauthUri, '绑定地址')}
                          >
                            复制地址
                          </Button>
                        </div>
                        <div className="mt-2 break-all text-sm text-foreground">{twoFactorSetupData?.otpauthUri}</div>
                      </div>
                    </div>
                  </div>

                  <Input
                    label="当前密码"
                    type="password"
                    placeholder="请输入当前登录密码"
                    value={enableForm.currentPassword}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEnableForm(prev => ({ ...prev, currentPassword: e.target.value }))}
                    variant="bordered"
                  />

                  <Input
                    label="6 位验证码"
                    placeholder="请输入认证器当前显示的 6 位验证码"
                    value={enableForm.oneTimeCode}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEnableForm(prev => ({ ...prev, oneTimeCode: e.target.value.replace(/[^\d]/g, '').slice(0, 6) }))}
                    variant="bordered"
                  />
                </div>
              </ModalBody>
              <ModalFooter>
                <Button color="default" variant="light" onPress={onClose}>
                  取消
                </Button>
                <Button color="primary" onPress={handleEnableTwoFactor} isLoading={twoFactorLoading}>
                  确认启用
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>

      <Modal
        isOpen={twoFactorDisableOpen}
        onOpenChange={(open) => {
          setTwoFactorDisableOpen(open);
          if (!open) {
            resetDisableForm();
          }
        }}
        size="2xl"
        scrollBehavior="outside"
        backdrop="blur"
        placement="center"
      >
        <ModalContent>
          {(onClose: () => void) => (
            <>
              <ModalHeader className="flex flex-col gap-1">关闭二步验证</ModalHeader>
              <ModalBody>
                <div className="rounded-xl border border-danger-200 bg-danger-50 px-4 py-3 text-sm text-danger-700">
                  关闭后，登录将只依赖账号密码。请确认当前环境已经有其他安全保护措施。
                </div>

                <Input
                  label="当前密码"
                  type="password"
                  placeholder="请输入当前登录密码"
                  value={disableForm.currentPassword}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDisableForm(prev => ({ ...prev, currentPassword: e.target.value }))}
                  variant="bordered"
                />

                <Input
                  label="6 位验证码"
                  placeholder="请输入认证器当前显示的 6 位验证码"
                  value={disableForm.oneTimeCode}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDisableForm(prev => ({ ...prev, oneTimeCode: e.target.value.replace(/[^\d]/g, '').slice(0, 6) }))}
                  variant="bordered"
                />
              </ModalBody>
              <ModalFooter>
                <Button color="default" variant="light" onPress={onClose}>
                  取消
                </Button>
                <Button color="danger" onPress={handleDisableTwoFactor} isLoading={twoFactorLoading}>
                  确认关闭
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </div>
  );
}
