import Network from './network';

// 登陆相关接口
export interface LoginData {
  username: string;
  password: string;
  captchaId: string;
  twoFactorCode?: string;
}

export interface LoginResponse {
  token: string;
  role_id: number;
  name: string;
  requirePasswordChange?: boolean;
  requireTwoFactorSetup?: boolean;
  twoFactorRequired?: boolean;
  twoFactorEnabled?: boolean;
}

export interface TwoFactorStatusResponse {
  enabled: boolean;
  required: boolean;
  enforcementScope: 'disabled' | 'admin' | 'all' | string;
  boundAt?: number;
  username: string;
  issuer: string;
}

export interface TwoFactorSetupResponse extends TwoFactorStatusResponse {
  secret: string;
  otpauthUri: string;
}

export interface XuiInstance {
  id: number;
  name: string;
  baseUrl: string;
  webBasePath: string;
  username: string;
  hostLabel?: string | null;
  managementMode: 'observe' | 'flux_managed' | string;
  syncEnabled: number;
  syncIntervalMinutes: number;
  allowInsecureTls: number;
  remark?: string | null;
  passwordConfigured: boolean;
  trafficCallbackPath: string;
  lastSyncAt?: number | null;
  lastSyncStatus?: string | null;
  lastSyncTrigger?: string | null;
  lastSyncError?: string | null;
  lastTestAt?: number | null;
  lastTestStatus?: string | null;
  lastTestError?: string | null;
  lastTrafficPushAt?: number | null;
  inboundCount: number;
  clientCount: number;
}

export interface XuiInboundSnapshot {
  id: number;
  instanceId: number;
  remoteInboundId: number;
  remark?: string | null;
  tag?: string | null;
  protocol?: string | null;
  listen?: string | null;
  port?: number | null;
  enable: number;
  expiryTime?: number | null;
  total?: number | null;
  up?: number | null;
  down?: number | null;
  allTime?: number | null;
  clientCount: number;
  onlineClientCount: number;
  transportSummary?: string | null;
  lastSyncAt?: number | null;
  status: number;
}

export interface XuiClientSnapshot {
  id: number;
  instanceId: number;
  remoteInboundId: number;
  remoteClientId?: number | null;
  remoteClientKey: string;
  email?: string | null;
  enable: number;
  expiryTime?: number | null;
  total?: number | null;
  up?: number | null;
  down?: number | null;
  allTime?: number | null;
  online: number;
  lastOnlineAt?: number | null;
  comment?: string | null;
  subId?: string | null;
  limitIp?: number | null;
  resetDays?: number | null;
  lastSyncAt?: number | null;
  status: number;
}

export interface XuiInstanceDetail {
  instance: XuiInstance;
  inbounds: XuiInboundSnapshot[];
  clients: XuiClientSnapshot[];
}

export interface XuiSyncResult {
  instanceId: number;
  instanceName: string;
  trigger: string;
  remoteInboundCount: number;
  remoteClientCount: number;
  createdInboundCount?: number;
  updatedInboundCount?: number;
  deletedInboundCount?: number;
  createdClientCount?: number;
  updatedClientCount?: number;
  deletedClientCount?: number;
  finishedAt: number;
  message: string;
}

export const login = (data: LoginData) => Network.post<LoginResponse>("/user/login", data);

// 用户CRUD操作 - 全部使用POST请求
export const createUser = (data: any) => Network.post("/user/create", data);
export const getAllUsers = (pageData: any = {}) => Network.post("/user/list", pageData);
export const updateUser = (data: any) => Network.post("/user/update", data);
export const deleteUser = (id: number) => Network.post("/user/delete", { id });
export const getUserPackageInfo = () => Network.post("/user/package");

// 节点CRUD操作 - 全部使用POST请求
export const createNode = (data: any) => Network.post("/node/create", data);
export const getNodeList = () => Network.post("/node/list");
export const updateNode = (data: any) => Network.post("/node/update", data);
export const deleteNode = (id: number) => Network.post("/node/delete", { id });
export const getNodeInstallCommand = (id: number) => Network.post("/node/install", { id });
export const checkNodeStatus = (nodeId?: number) => {
  const params = nodeId ? { nodeId } : {};
  return Network.post("/node/check-status", params);
};

// 隧道CRUD操作 - 全部使用POST请求
export const createTunnel = (data: any) => Network.post("/tunnel/create", data);
export const getTunnelList = () => Network.post("/tunnel/list");
export const getTunnelById = (id: number) => Network.post("/tunnel/get", { id });
export const updateTunnel = (data: any) => Network.post("/tunnel/update", data);
export const deleteTunnel = (id: number) => Network.post("/tunnel/delete", { id });
export const diagnoseTunnel = (tunnelId: number) => Network.post("/tunnel/diagnose", { tunnelId });

// 用户隧道权限管理操作 - 全部使用POST请求
export const assignUserTunnel = (data: any) => Network.post("/tunnel/user/assign", data);
export const getUserTunnelList = (queryData: any = {}) => Network.post("/tunnel/user/list", queryData);
export const removeUserTunnel = (params: any) => Network.post("/tunnel/user/remove", params);
export const updateUserTunnel = (data: any) => Network.post("/tunnel/user/update", data);
export const userTunnel = () => Network.post("/tunnel/user/tunnel");

// 转发CRUD操作 - 全部使用POST请求
export const createForward = (data: any) => Network.post("/forward/create", data);
export const getForwardList = () => Network.post("/forward/list");
export const updateForward = (data: any) => Network.post("/forward/update", data);
export const deleteForward = (id: number) => Network.post("/forward/delete", { id });
export const forceDeleteForward = (id: number) => Network.post("/forward/force-delete", { id });

// 转发服务控制操作 - 通过Java后端接口
export const pauseForwardService = (forwardId: number) => Network.post("/forward/pause", { id: forwardId });
export const resumeForwardService = (forwardId: number) => Network.post("/forward/resume", { id: forwardId });

// 转发诊断操作
export const diagnoseForward = (forwardId: number) => Network.post("/forward/diagnose", { forwardId });

// 转发排序操作
export const updateForwardOrder = (data: { forwards: Array<{ id: number; inx: number }> }) => Network.post("/forward/update-order", data);
export const copyForward = (data: { id: number }) => Network.post("/forward/copy", data);
export const batchUpdateForward = (data: { ids: number[]; protocolId?: number; tagIds?: string }) => Network.post("/forward/batch-update", data);

// 限速规则CRUD操作 - 全部使用POST请求
export const createSpeedLimit = (data: any) => Network.post("/speed-limit/create", data);
export const getSpeedLimitList = () => Network.post("/speed-limit/list");
export const updateSpeedLimit = (data: any) => Network.post("/speed-limit/update", data);
export const deleteSpeedLimit = (id: number) => Network.post("/speed-limit/delete", { id });

// 修改密码接口
export const updatePassword = (data: any) => Network.post("/user/updatePassword", data);
export const getTwoFactorStatus = () => Network.post<TwoFactorStatusResponse>("/user/2fa/status");
export const setupTwoFactor = () => Network.post<TwoFactorSetupResponse>("/user/2fa/setup");
export const enableTwoFactor = (data: { currentPassword: string; oneTimeCode: string }) => Network.post("/user/2fa/enable", data);
export const disableTwoFactor = (data: { currentPassword: string; oneTimeCode: string }) => Network.post("/user/2fa/disable", data);

// 重置流量接口
export const resetUserFlow = (data: { id: number; type: number }) => Network.post("/user/reset", data);

// 网站配置相关接口
export const getConfigs = () => Network.post("/config/list");
export const getConfigByName = (name: string) => Network.post("/config/get", { name });
export const updateConfigs = (configMap: Record<string, string>) => Network.post("/config/update", configMap);
export const updateConfig = (name: string, value: string) => Network.post("/config/update-single", { name, value });


// 验证码相关接口
export const checkCaptcha = () => Network.post("/captcha/check");
export const generateCaptcha = () => Network.post(`/captcha/generate`);
export const verifyCaptcha = (data: { captchaId: string; trackData: string }) => Network.post("/captcha/verify", data);

// 诊断相关接口
export const getDiagnosisSummary = () => Network.post("/diagnosis/summary");
export const getDiagnosisHistory = (data: { targetType: string; targetId: number; limit?: number }) =>
  Network.post("/diagnosis/history", data);
export const runDiagnosisNow = () => Network.post("/diagnosis/run-now");
export const getDiagnosisRuntimeStatus = () => Network.post("/diagnosis/runtime-status");
export const testWebhook = () => Network.post("/diagnosis/test-webhook");
export const getDiagnosisLatestBatch = (data: { targetType: string; targetIds: number[] }) =>
  Network.post("/diagnosis/latest-batch", data);
export const getDiagnosisTrend = (data?: { hours?: number }) =>
  Network.post("/diagnosis/trend", data || {});

// Protocol 操作
export const createProtocol = (data: any) => Network.post("/protocol/create", data);
export const getProtocolList = () => Network.post("/protocol/list");
export const updateProtocol = (data: any) => Network.post("/protocol/update", data);
export const deleteProtocol = (id: number) => Network.post("/protocol/delete", { id });

// Tag 操作
export const createTag = (data: any) => Network.post("/tag/create", data);
export const getTagList = () => Network.post("/tag/list");
export const updateTag = (data: any) => Network.post("/tag/update", data);
export const deleteTag = (id: number) => Network.post("/tag/delete", { id });

// X-UI 集成
export const getXuiList = () => Network.post<XuiInstance[]>("/xui/list");
export const getXuiDetail = (id: number) => Network.post<XuiInstanceDetail>("/xui/detail", { id });
export const createXuiInstance = (data: any) => Network.post<XuiInstance>("/xui/create", data);
export const updateXuiInstance = (data: any) => Network.post<XuiInstance>("/xui/update", data);
export const deleteXuiInstance = (id: number) => Network.post("/xui/delete", { id });
export const testXuiInstance = (id: number) => Network.post<{ instanceId: number; instanceName: string; remoteInboundCount: number; remoteClientCount: number; message: string }>("/xui/test", { id });
export const syncXuiInstance = (id: number) => Network.post<XuiSyncResult>("/xui/sync", { id });
