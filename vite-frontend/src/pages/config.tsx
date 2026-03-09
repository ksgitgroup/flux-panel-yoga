import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from "@heroui/button";
import { Card, CardBody, CardHeader } from "@heroui/card";
import { Chip } from "@heroui/chip";
import { Input, Textarea } from "@heroui/input";
import { Spinner } from "@heroui/spinner";
import { Divider } from "@heroui/divider";
import { Switch } from "@heroui/switch";
import { Select, SelectItem } from "@heroui/select";
import toast from 'react-hot-toast';
import { updateConfigs, testWebhook, testDingtalkConfig } from '@/api';
import { SettingsIcon } from '@/components/icons';
import { hasPermission } from '@/utils/auth';
import { clearConfigCache, getCachedConfigs, siteConfig, updateSiteConfig } from '@/config/site';

type ConfigType = 'input' | 'switch' | 'select' | 'textarea';
type ConfigSectionKey = 'basic' | 'security' | 'iam' | 'diagnosis' | 'alerting';

interface ConfigItem {
  key: string;
  label: string;
  section: ConfigSectionKey;
  placeholder?: string;
  description?: string;
  type: ConfigType;
  options?: { label: string; value: string; description?: string }[];
  dependsOn?: string;
  dependsValue?: string;
  defaultValue?: string;
  rows?: number;
}

const DEFAULT_ALERT_TEMPLATE = `# 🚨 {{appName}} {{environment}} 自动诊断告警

> 时间：{{time}}
> 环境：{{environment}}
> 诊断范围：{{resourceSummary}}
> 异常数量：**{{failureCount}}**
> 发送节奏：{{cooldownLabel}}

{{failureDetails}}`;

const DEFAULT_RECOVERY_TEMPLATE = `# ✅ {{appName}} {{environment}} 诊断已恢复

> 时间：{{time}}
> 环境：{{environment}}
> 诊断范围：{{resourceSummary}}
> 状态：最近一次自动诊断未发现异常`;

const CONFIG_SECTIONS: Record<ConfigSectionKey, { title: string; description: string; chip: string }> = {
  basic: {
    title: '基础信息',
    description: '控制站点名称、环境标识和面板基础接入信息。环境名会直接进入侧边栏和告警标题。',
    chip: '站点识别',
  },
  security: {
    title: '登录安全',
    description: '登录验证码和二步验证都属于入口防线。这里统一管理登录入口的强度要求。',
    chip: '入口防护',
  },
  iam: {
    title: '钉钉登录',
    description: '配置钉钉 OAuth 应用实现组织成员免密登录。所有敏感字段在保存后会自动脱敏。',
    chip: '身份认证',
  },
  diagnosis: {
    title: '自动诊断',
    description: '调度器按分钟轮询配置，并按设定间隔执行全量诊断。这里决定诊断节奏。',
    chip: '任务调度',
  },
  alerting: {
    title: '企业微信告警（旧版）',
    description: '此为旧版企业微信告警配置。推荐使用「通知中心 → 通知渠道」统一管理所有通知渠道（企业微信/Telegram/Webhook/Email），并配合「通知策略」灵活路由事件。',
    chip: '值班通知',
  },
};

const CONFIG_ITEMS: ConfigItem[] = [
  {
    key: 'app_name',
    label: '应用名称',
    section: 'basic',
    placeholder: '请输入应用名称',
    description: '显示在浏览器标签页和导航栏中的产品名称。',
    type: 'input',
  },
  {
    key: 'site_environment_name',
    label: '环境名称',
    section: 'basic',
    placeholder: '例如 LOCAL / DEV / PROD / HK-DEV',
    description: '用于侧边栏、仪表盘和企业微信告警标题。建议使用稳定且一眼可识别的环境名。',
    type: 'input',
  },
  {
    key: 'ip',
    label: '面板后端地址',
    section: 'basic',
    placeholder: '请输入 ip:port',
    description: '用于节点与面板通讯。不要套 CDN，不支持 https，通讯内容已加密。',
    type: 'input',
  },
  {
    key: 'captcha_enabled',
    label: '启用验证码',
    section: 'security',
    description: '开启后，用户登录时需要完成验证码验证。',
    type: 'switch',
  },
  {
    key: 'captcha_type',
    label: '验证码类型',
    section: 'security',
    description: '选择用户在登录页看到的验证码样式。',
    type: 'select',
    dependsOn: 'captcha_enabled',
    dependsValue: 'true',
    options: [
      { label: '随机类型', value: 'RANDOM', description: '系统随机选择验证码类型' },
      { label: '滑块验证码', value: 'SLIDER', description: '拖动滑块完成拼图验证' },
      { label: '文字点选验证码', value: 'WORD_IMAGE_CLICK', description: '按顺序点击指定文字' },
      { label: '旋转验证码', value: 'ROTATE', description: '旋转图片到正确角度' },
      { label: '拼图验证码', value: 'CONCAT', description: '拖动滑块完成图片拼接' },
    ],
  },
  {
    key: 'two_factor_enforcement_scope',
    label: '二步验证强制范围',
    section: 'security',
    description: '决定是否要求管理员或全部账号必须完成二步验证绑定。已启用 2FA 的账号在登录时必须输入 6 位动态码；未启用的账号会被锁定到个人中心完成绑定。',
    type: 'select',
    defaultValue: 'disabled',
    options: [
      { label: '不强制', value: 'disabled', description: '用户可以自行决定是否启用二步验证' },
      { label: '仅管理员强制', value: 'admin', description: '管理员账号必须绑定 2FA，普通用户可自行选择' },
      { label: '全站强制', value: 'all', description: '所有账号必须绑定 2FA 后才能进入业务页面' },
    ],
  },
  {
    key: 'iam_auth_mode',
    label: '认证模式',
    section: 'iam',
    description: 'hybrid = 同时支持本地管理员 + 钉钉登录；local_only = 仅本地管理员；dingtalk_only = 仅钉钉登录（需先确认钉钉配置正确）。',
    type: 'select',
    defaultValue: 'hybrid',
    options: [
      { label: '混合模式', value: 'hybrid', description: '本地管理员 + 钉钉登录同时可用' },
      { label: '仅本地管理员', value: 'local_only', description: '禁用钉钉登录，仅允许本地账号密码' },
      { label: '仅钉钉', value: 'dingtalk_only', description: '禁用本地登录，仅允许钉钉扫码（确保钉钉已配置）' },
    ],
  },
  {
    key: 'iam_local_admin_enabled',
    label: '启用本地管理员登录',
    section: 'iam',
    description: '关闭后，管理员也必须通过钉钉登录。建议在钉钉配置验证通过后再关闭此选项。',
    type: 'switch',
  },
  {
    key: 'dingtalk_oauth_enabled',
    label: '启用钉钉登录',
    section: 'iam',
    description: '开启后，登录页显示「使用钉钉登录」按钮。需要先完成以下配置。',
    type: 'switch',
  },
  {
    key: 'dingtalk_client_id',
    label: '应用 Client ID (AppKey)',
    section: 'iam',
    placeholder: 'dingxxxxxxxxxxxxxxxx',
    description: '获取方式：登录钉钉开放平台 open.dingtalk.com → 应用开发 → 企业内部应用 → 选择或创建应用 → 应用信息 → AppKey 即为 Client ID。',
    type: 'input',
    dependsOn: 'dingtalk_oauth_enabled',
    dependsValue: 'true',
  },
  {
    key: 'dingtalk_client_secret',
    label: '应用 Client Secret (AppSecret)',
    section: 'iam',
    placeholder: '保存后自动脱敏为 ******',
    description: '获取方式：同上页面中的 AppSecret。此字段保存后会脱敏显示为 ******，如需更新请直接填写新值覆盖保存。如显示为 ******，表示已配置。',
    type: 'input',
    dependsOn: 'dingtalk_oauth_enabled',
    dependsValue: 'true',
  },
  {
    key: 'dingtalk_redirect_uri',
    label: '回调地址 (Redirect URI)',
    section: 'iam',
    placeholder: 'https://你的面板域名/login/dingtalk/callback',
    description: '配置方式：钉钉开放平台 → 应用 → 登录与分享 → 回调域名，填写面板的完整 URL（包含 /login/dingtalk/callback）。注意：必须与面板实际访问地址完全一致，包括协议和端口。',
    type: 'input',
    dependsOn: 'dingtalk_oauth_enabled',
    dependsValue: 'true',
  },
  {
    key: 'dingtalk_corp_id',
    label: '企业 Corp ID（可选）',
    section: 'iam',
    placeholder: 'dingxxxxxxxxxxxxxxxx',
    description: '获取方式：钉钉管理后台 oa.dingtalk.com → 首页顶部显示的 CorpId。留空表示不限制组织。',
    type: 'input',
    dependsOn: 'dingtalk_oauth_enabled',
    dependsValue: 'true',
  },
  {
    key: 'dingtalk_required_email_domain',
    label: '允许的邮箱域名（可选）',
    section: 'iam',
    placeholder: '例如 company.com',
    description: '限制只允许此域名的企业邮箱登录。留空表示不限制。建议设置以防止非组织成员通过钉钉登录。',
    type: 'input',
    dependsOn: 'dingtalk_oauth_enabled',
    dependsValue: 'true',
  },
  {
    key: 'auto_diagnosis_enabled',
    label: '启用自动诊断',
    section: 'diagnosis',
    description: '开启后系统会周期性对隧道和转发执行自动诊断。',
    type: 'switch',
  },
  {
    key: 'auto_diagnosis_interval',
    label: '诊断间隔（分钟）',
    section: 'diagnosis',
    placeholder: '建议 10 ~ 60',
    description: '每隔多少分钟执行一次全量诊断。过小会增加噪音，过大则会延迟发现故障。',
    type: 'input',
    dependsOn: 'auto_diagnosis_enabled',
    dependsValue: 'true',
  },
  {
    key: 'wechat_webhook_enabled',
    label: '启用企业微信机器人',
    section: 'alerting',
    description: '开启后，自动诊断异常会按节流策略推送到企业微信群。',
    type: 'switch',
  },
  {
    key: 'wechat_webhook_url',
    label: '企业微信机器人 Webhook 地址',
    section: 'alerting',
    placeholder: 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=xxx',
    description: '企业微信群机器人生成的 Webhook URL。该配置仅管理员可见。',
    type: 'input',
    dependsOn: 'wechat_webhook_enabled',
    dependsValue: 'true',
  },
  {
    key: 'wechat_webhook_cooldown_minutes',
    label: '同类异常最短发送间隔（分钟）',
    section: 'alerting',
    placeholder: '默认 30',
    description: '处于持续异常时，系统会在这个冷静期内合并相同方向的告警，避免刷屏。',
    type: 'input',
    dependsOn: 'wechat_webhook_enabled',
    dependsValue: 'true',
  },
  {
    key: 'wechat_webhook_max_failures',
    label: '单次消息最多展示异常条目数',
    section: 'alerting',
    placeholder: '默认 8',
    description: '避免单次告警过长，超出部分会提示到面板查看完整诊断看板。',
    type: 'input',
    dependsOn: 'wechat_webhook_enabled',
    dependsValue: 'true',
  },
  {
    key: 'wechat_notify_recovery_enabled',
    label: '异常恢复后发送恢复通知',
    section: 'alerting',
    description: '当上一轮是失败状态、当前恢复正常时，发送一次恢复消息。',
    type: 'switch',
    dependsOn: 'wechat_webhook_enabled',
    dependsValue: 'true',
  },
  {
    key: 'wechat_webhook_template',
    label: '异常通知模板',
    section: 'alerting',
    description: '支持占位符：{{appName}} {{environment}} {{time}} {{resourceSummary}} {{failureCount}} {{cooldownLabel}} {{failureDetails}}',
    type: 'textarea',
    dependsOn: 'wechat_webhook_enabled',
    dependsValue: 'true',
    defaultValue: DEFAULT_ALERT_TEMPLATE,
    rows: 8,
  },
  {
    key: 'wechat_recovery_template',
    label: '恢复通知模板',
    section: 'alerting',
    description: '默认模板会带上环境名和诊断范围，适合在值班群中快速确认恢复。',
    type: 'textarea',
    dependsOn: 'wechat_webhook_enabled',
    dependsValue: 'true',
    defaultValue: DEFAULT_RECOVERY_TEMPLATE,
    rows: 6,
  },
];

const getInitialConfigs = (): Record<string, string> => {
  if (typeof window === 'undefined') return {};

  const configKeys = ['app_name', 'captcha_enabled', 'captcha_type', 'ip', 'site_environment_name'];
  const initialConfigs: Record<string, string> = {};

  try {
    configKeys.forEach((key) => {
      const cachedValue = localStorage.getItem('vite_config_' + key);
      if (cachedValue !== null) {
        initialConfigs[key] = cachedValue;
      }
    });
  } catch {
    // ignore cache read errors
  }

  return initialConfigs;
};

const SaveIcon = ({ className }: { className?: string }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
    <polyline points="17,21 17,13 7,13 7,21" />
    <polyline points="7,3 7,8 15,8" />
  </svg>
);

export default function ConfigPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const canViewConfig = hasPermission('site_config.read');
  const canManageConfig = hasPermission('site_config.write');
  const initialConfigs = getInitialConfigs();
  const [configs, setConfigs] = useState<Record<string, string>>(initialConfigs);
  const [loading, setLoading] = useState(Object.keys(initialConfigs).length === 0);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [originalConfigs, setOriginalConfigs] = useState<Record<string, string>>(initialConfigs);
  const [testingWebhook, setTestingWebhook] = useState(false);
  const [testingDingtalk, setTestingDingtalk] = useState(false);
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    if (!canViewConfig) {
      toast.error('权限不足，无法访问网站配置');
      navigate('/dashboard', { replace: true });
    }
  }, [canViewConfig, navigate]);

  const activeSection = (searchParams.get('section') as ConfigSectionKey) || 'basic';

  // Scroll to section when sidebar nav is clicked
  useEffect(() => {
    const el = sectionRefs.current[activeSection];
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [activeSection]);

  const loadConfigs = async (currentConfigs?: Record<string, string>) => {
    const configsToCompare = currentConfigs || configs;
    const hasInitialData = Object.keys(configsToCompare).length > 0;

    if (!hasInitialData) {
      setLoading(true);
    }

    try {
      const configData = await getCachedConfigs();
      const mergedConfigs = {
        ...configData,
        wechat_webhook_cooldown_minutes: configData.wechat_webhook_cooldown_minutes || '30',
        wechat_webhook_max_failures: configData.wechat_webhook_max_failures || '8',
        site_environment_name: configData.site_environment_name || siteConfig.environment_name || '默认环境',
        wechat_notify_recovery_enabled: configData.wechat_notify_recovery_enabled || 'true',
        wechat_webhook_template: configData.wechat_webhook_template || DEFAULT_ALERT_TEMPLATE,
        wechat_recovery_template: configData.wechat_recovery_template || DEFAULT_RECOVERY_TEMPLATE,
      };

      const hasDataChanged = JSON.stringify(mergedConfigs) !== JSON.stringify(configsToCompare);
      if (hasDataChanged) {
        setConfigs(mergedConfigs);
        setOriginalConfigs({ ...mergedConfigs });
        setHasChanges(false);
      }
    } catch (error) {
      console.error('[ConfigPage] 加载配置失败:', error);
      if (!hasInitialData) {
        toast.error('加载配置出错，请重试');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      loadConfigs(initialConfigs);
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  const handleConfigChange = (key: string, value: string) => {
    const nextConfigs = { ...configs, [key]: value };

    if (key === 'captcha_enabled' && value === 'true' && !nextConfigs.captcha_type) {
      nextConfigs.captcha_type = 'RANDOM';
    }

    if (key === 'wechat_webhook_enabled' && value === 'true') {
      nextConfigs.wechat_webhook_cooldown_minutes ||= '30';
      nextConfigs.wechat_webhook_max_failures ||= '8';
      nextConfigs.wechat_notify_recovery_enabled ||= 'true';
      nextConfigs.wechat_webhook_template ||= DEFAULT_ALERT_TEMPLATE;
      nextConfigs.wechat_recovery_template ||= DEFAULT_RECOVERY_TEMPLATE;
    }

    setConfigs(nextConfigs);

    const changed = Object.keys({ ...nextConfigs, ...originalConfigs }).some(
      (configKey) => (nextConfigs[configKey] || '') !== (originalConfigs[configKey] || ''),
    );
    setHasChanges(changed);
  };

  const handleSave = async () => {
    if (!canManageConfig) {
      toast.error('权限不足，无法保存配置');
      return;
    }
    setSaving(true);
    try {
      const response = await updateConfigs(configs);
      if (response.code !== 0) {
        toast.error('保存配置失败: ' + response.msg);
        return;
      }

      toast.success('配置保存成功');
      clearConfigCache();

      const changedKeys = Object.keys(configs).filter((key) => configs[key] !== originalConfigs[key]);
      setOriginalConfigs({ ...configs });
      setHasChanges(false);

      if (changedKeys.includes('app_name') || changedKeys.includes('site_environment_name')) {
        await updateSiteConfig();
      }

      window.dispatchEvent(new CustomEvent('configUpdated', { detail: { changedKeys } }));
    } catch {
      toast.error('保存配置出错，请重试');
    } finally {
      setSaving(false);
    }
  };

  const shouldShowItem = (item: ConfigItem) => {
    if (!item.dependsOn || !item.dependsValue) return true;
    return configs[item.dependsOn] === item.dependsValue;
  };

  const groupedItems = useMemo(() => {
    return (Object.keys(CONFIG_SECTIONS) as ConfigSectionKey[]).map((sectionKey) => ({
      sectionKey,
      items: CONFIG_ITEMS.filter((item) => item.section === sectionKey && shouldShowItem(item)),
    }));
  }, [configs]);

  const renderConfigItem = (item: ConfigItem) => {
    const isChanged = hasChanges && (configs[item.key] || '') !== (originalConfigs[item.key] || '');

    const wrapperClasses = isChanged
      ? 'border-warning-300 data-[hover=true]:border-warning-400'
      : '';

    if (item.type === 'input') {
      return (
        <Input
          value={configs[item.key] || ''}
          onChange={(e) => handleConfigChange(item.key, e.target.value)}
          placeholder={item.placeholder}
          variant="bordered"
          classNames={{ inputWrapper: wrapperClasses }}
        />
      );
    }

    if (item.type === 'textarea') {
      return (
        <Textarea
          value={configs[item.key] || ''}
          onChange={(e) => handleConfigChange(item.key, e.target.value)}
          placeholder={item.placeholder}
          variant="bordered"
          minRows={item.rows || 6}
          classNames={{ inputWrapper: wrapperClasses }}
        />
      );
    }

    if (item.type === 'switch') {
      return (
        <Switch
          isSelected={configs[item.key] === 'true'}
          onValueChange={(checked) => handleConfigChange(item.key, checked ? 'true' : 'false')}
          color="primary"
          classNames={{ wrapper: isChanged ? 'border-warning-300' : '' }}
        >
          <span className="text-sm text-gray-700 dark:text-gray-300">
            {configs[item.key] === 'true' ? '已启用' : '已禁用'}
          </span>
        </Switch>
      );
    }

    return (
      <Select
        selectedKeys={configs[item.key] ? [configs[item.key]] : []}
        onSelectionChange={(keys) => {
          const selectedKey = Array.from(keys)[0] as string;
          if (selectedKey) {
            handleConfigChange(item.key, selectedKey);
          }
        }}
        placeholder="请选择"
        variant="bordered"
        classNames={{ trigger: wrapperClasses }}
      >
        {item.options?.map((option) => (
          <SelectItem key={option.value} description={option.description}>
            {option.label}
          </SelectItem>
        )) || []}
      </Select>
    );
  };

  const renderFieldActions = (item: ConfigItem) => {
    if (!canManageConfig) {
      return null;
    }
    if (item.key === 'wechat_webhook_url' && configs.wechat_webhook_url) {
      return (
        <Button
          size="sm"
          color="success"
          variant="flat"
          isLoading={testingWebhook}
          onPress={async () => {
            setTestingWebhook(true);
            try {
              await updateConfigs(configs);
              const res = await testWebhook();
              if (res.code === 0) {
                toast.success(res.data || '测试消息已发送，请检查企业微信群');
              } else {
                toast.error(res.msg || '发送失败');
              }
            } catch {
              toast.error('测试推送出错');
            } finally {
              setTestingWebhook(false);
            }
          }}
        >
          发送测试消息
        </Button>
      );
    }

    if ((item.key === 'wechat_webhook_template' || item.key === 'wechat_recovery_template') && item.defaultValue) {
      return (
        <Button
          size="sm"
          variant="light"
          onPress={() => handleConfigChange(item.key, item.defaultValue || '')}
        >
          恢复默认模板
        </Button>
      );
    }

    if (item.key === 'dingtalk_redirect_uri') {
      return (
        <Button
          size="sm"
          color="success"
          variant="flat"
          isLoading={testingDingtalk}
          isDisabled={hasChanges}
          onPress={async () => {
            setTestingDingtalk(true);
            try {
              const res = await testDingtalkConfig();
              if (res.code === 0 && res.data) {
                const d = res.data as any;
                if (d.success) {
                  toast.success(d.message || '钉钉配置验证通过');
                } else {
                  toast.error(d.message || '验证失败');
                }
              } else {
                toast.error(res.msg || '测试失败');
              }
            } catch {
              toast.error('测试请求出错');
            } finally {
              setTestingDingtalk(false);
            }
          }}
        >
          {hasChanges ? '请先保存' : '验证配置'}
        </Button>
      );
    }

    return null;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Spinner size="lg" label="加载配置中..." />
      </div>
    );
  }

  return (
    <div className="space-y-4 p-1 lg:p-2">
      {/* Sticky header bar */}
      <div className="sticky top-[60px] z-20 -mx-1 lg:-mx-2 px-1 lg:px-2 pb-2 pt-1 bg-gradient-to-b from-slate-50/95 via-slate-50/80 to-transparent dark:from-black/95 dark:via-black/80 backdrop-blur-sm">
        <Card className="border border-default-200 shadow-sm">
          <CardBody className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between py-3">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-primary/10 p-2 text-primary">
                <SettingsIcon className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-lg font-semibold">网站配置</h1>
                <div className="flex flex-wrap items-center gap-2 mt-0.5">
                  <Chip size="sm" variant="flat" color="primary">环境：{configs.site_environment_name || '未设置'}</Chip>
                  <Chip size="sm" variant="flat" color={configs.auto_diagnosis_enabled === 'true' ? 'success' : 'default'}>
                    自动诊断：{configs.auto_diagnosis_enabled === 'true' ? `${configs.auto_diagnosis_interval || '30'} 分钟` : '未启用'}
                  </Chip>
                </div>
              </div>
            </div>

            <Button
              color="primary"
              startContent={<SaveIcon className="w-4 h-4" />}
              onClick={handleSave}
              isLoading={saving}
              disabled={!canManageConfig || !hasChanges}
            >
              {saving ? '保存中...' : '保存配置'}
            </Button>
          </CardBody>
        </Card>
      </div>

      {/* Mobile section tabs */}
      <div className="flex flex-wrap gap-2 xl:hidden">
        {(Object.keys(CONFIG_SECTIONS) as ConfigSectionKey[]).map((sectionKey) => {
          const section = CONFIG_SECTIONS[sectionKey];
          const isActive = activeSection === sectionKey;
          return (
            <Button
              key={sectionKey}
              size="sm"
              variant={isActive ? 'solid' : 'flat'}
              color={isActive ? 'primary' : 'default'}
              onPress={() => setSearchParams({ section: sectionKey })}
            >
              {section.title}
            </Button>
          );
        })}
      </div>

      {/* All sections rendered continuously */}
      {groupedItems.map(({ sectionKey, items }) => {
        if (items.length === 0) return null;
        const section = CONFIG_SECTIONS[sectionKey];

        return (
          <div
            key={sectionKey}
            ref={(el) => { sectionRefs.current[sectionKey] = el; }}
            className="scroll-mt-[140px]"
          >
            {/* Alert rule management quick entry */}
            {sectionKey === 'alerting' && (
              <Card className="border border-primary/20 bg-primary-50/30 dark:bg-primary-50/5 shadow-sm mb-4">
                <CardBody className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 py-3">
                  <div>
                    <p className="text-sm font-semibold">告警规则管理</p>
                    <p className="text-xs text-default-500 mt-0.5">
                      配置节点监控告警规则（CPU/内存/离线/到期/流量等），管理告警日志
                    </p>
                  </div>
                  <Button size="sm" color="primary" variant="flat" onPress={() => navigate('/alert')}>
                    管理规则
                  </Button>
                </CardBody>
              </Card>
            )}

            <Card className="border border-default-200 shadow-sm">
              <CardHeader className="flex flex-col items-start gap-3 pb-0">
                <div className="flex flex-wrap items-center gap-3">
                  <h2 className="text-xl font-semibold">{section.title}</h2>
                  <Chip size="sm" variant="flat" color="primary">{section.chip}</Chip>
                </div>
                <p className="text-sm text-default-500">{section.description}</p>
              </CardHeader>
              <CardBody className="space-y-5 pt-5">
                {items.map((item, index) => (
                  <div key={item.key} className="space-y-3">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div className="max-w-3xl">
                        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">{item.label}</label>
                        {item.description && (
                          <p className="mt-1 text-xs leading-6 text-gray-500 dark:text-gray-400">{item.description}</p>
                        )}
                      </div>
                      {renderFieldActions(item)}
                    </div>

                    {renderConfigItem(item)}

                    {index !== items.length - 1 && <Divider className="pt-2" />}
                  </div>
                ))}

                {sectionKey === 'alerting' && (
                  <div className="rounded-2xl border border-dashed border-default-300 bg-default-50/70 px-4 py-4 text-sm text-default-600 dark:bg-default-100/20">
                    <p className="font-semibold text-foreground">模板占位符</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {['{{appName}}', '{{environment}}', '{{time}}', '{{resourceSummary}}', '{{failureCount}}', '{{cooldownLabel}}', '{{failureDetails}}'].map((token) => (
                        <Chip key={token} size="sm" variant="flat">{token}</Chip>
                      ))}
                    </div>
                    <p className="mt-3 text-xs text-default-500">
                      异常详情会自动按"单次消息最多展示异常条目数"截断。恢复通知默认只在上一次状态是异常时发送一次。
                    </p>
                  </div>
                )}
              </CardBody>
            </Card>
          </div>
        );
      })}

      {hasChanges && (
        <Card className="border-warning-200 bg-warning-50 dark:bg-warning-900/20 dark:border-warning-800">
          <CardBody className="py-3">
            <div className="flex items-center gap-2 text-warning-700 dark:text-warning-300">
              <div className="h-2 w-2 rounded-full bg-warning-500 animate-pulse" />
              <span className="text-sm">检测到配置变更，请保存后再进行告警测试或页面刷新。</span>
            </div>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
