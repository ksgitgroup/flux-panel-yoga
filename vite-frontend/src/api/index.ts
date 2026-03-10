import Network from './network';

// 登陆相关接口
export interface LoginData {
  username: string;
  password: string;
  captchaId: string;
  twoFactorCode?: string;
}

export interface LoginResponse {
  token?: string;
  role_id?: number;
  name?: string;
  admin?: boolean;
  principalType?: string;
  authSource?: string;
  permissions?: string[];
  roleCodes?: string[];
  email?: string;
  sessionExpiresAt?: number;
  requirePasswordChange?: boolean;
  requireTwoFactorSetup?: boolean;
  twoFactorRequired?: boolean;
  twoFactorEnabled?: boolean;
  requireTwoFactorVerification?: boolean;
  twoFactorChallengeToken?: string;
  twoFactorChallengeExpiresAt?: number;
}

export interface IamAuthOptions {
  authMode: 'local_only' | 'dingtalk_only' | 'hybrid' | string;
  localAdminEnabled: boolean;
  dingtalkOauthEnabled: boolean;
  dingtalkConfigured: boolean;
  dingtalkClientIdConfigured: boolean;
}

export interface TwoFactorLoginData {
  challengeToken: string;
  twoFactorCode: string;
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

export interface DingtalkAuthorizeResponse {
  authorizeUrl: string;
  state: string;
  redirectUri: string;
  channel: string;
}

export interface XuiInstance {
  id: number;
  name: string;
  provider: 'x-ui' | '3x-ui' | string;
  baseUrl: string;
  webBasePath: string;
  username: string;
  assetId?: number | null;
  assetName?: string | null;
  hostLabel?: string | null;
  managementMode: 'observe' | 'flux_managed' | string;
  syncEnabled: number;
  syncIntervalMinutes: number;
  allowInsecureTls: number;
  remark?: string | null;
  passwordConfigured: boolean;
  loginSecretConfigured: boolean;
  trafficCallbackPath: string;
  lastSyncAt?: number | null;
  lastSyncStatus?: string | null;
  lastSyncTrigger?: string | null;
  lastSyncError?: string | null;
  lastTestAt?: number | null;
  lastTestStatus?: string | null;
  lastTestError?: string | null;
  lastTrafficPushAt?: number | null;
  lastApiFlavor?: string | null;
  lastResolvedBasePath?: string | null;
  inboundCount: number;
  clientCount: number;
}

export interface XuiServerStatus {
  cpuUsage?: number | null;
  cpuCores?: number | null;
  logicalProcessors?: number | null;
  cpuSpeedMhz?: number | null;
  memoryUsed?: number | null;
  memoryTotal?: number | null;
  swapUsed?: number | null;
  swapTotal?: number | null;
  diskUsed?: number | null;
  diskTotal?: number | null;
  xrayState?: string | null;
  xrayErrorMessage?: string | null;
  xrayVersion?: string | null;
  uptime?: number | null;
  loads?: number[] | null;
  tcpCount?: number | null;
  udpCount?: number | null;
  netIoUp?: number | null;
  netIoDown?: number | null;
  netTrafficSent?: number | null;
  netTrafficReceived?: number | null;
  publicIpv4?: string | null;
  publicIpv6?: string | null;
  appThreads?: number | null;
  appMemory?: number | null;
  appUptime?: number | null;
}

export interface XuiProtocolSummary {
  protocol: string;
  inboundCount: number;
  activeInboundCount: number;
  enabledInboundCount: number;
  disabledInboundCount: number;
  deletedInboundCount: number;
  clientCount: number;
  onlineClientCount: number;
  up?: number | null;
  down?: number | null;
  allTime?: number | null;
  portSummary?: string | null;
  transportSummary?: string | null;
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
  serverStatus?: XuiServerStatus | null;
  serverStatusError?: string | null;
  protocolSummaries?: XuiProtocolSummary[] | null;
  inbounds: XuiInboundSnapshot[];
  clients: XuiClientSnapshot[];
}

export interface XuiInboundDirectoryItem {
  id: number;
  instanceId: number;
  instanceName?: string | null;
  instanceProvider?: string | null;
  instanceBaseUrl?: string | null;
  instanceWebBasePath?: string | null;
  instanceLastSyncStatus?: string | null;
  instanceLastSyncAt?: number | null;
  assetId?: number | null;
  assetName?: string | null;
  assetPrimaryIp?: string | null;
  assetRegion?: string | null;
  assetProvider?: string | null;
  assetEnvironment?: string | null;
  hostLabel?: string | null;
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
  clientCount?: number | null;
  onlineClientCount?: number | null;
  transportSummary?: string | null;
  lastSyncAt?: number | null;
  status: number;
}

export interface XuiProtocolDirectory {
  instanceCount: number;
  assetCount: number;
  protocolSummaries: XuiProtocolSummary[];
  items: XuiInboundDirectoryItem[];
}

export interface OnePanelSystemSummary {
  hostName?: string | null;
  os?: string | null;
  kernelVersion?: string | null;
  architecture?: string | null;
  dockerRunning?: boolean | null;
  openrestyRunning?: boolean | null;
  installedAppCount?: number | null;
  websiteCount?: number | null;
  containerCount?: number | null;
  cronjobCount?: number | null;
  backupRecordCount?: number | null;
}

export interface OnePanelAuditSummary {
  loginFailedCount24h?: number | null;
  operationCount24h?: number | null;
  riskyOperationCount24h?: number | null;
  lastLoginAt?: number | null;
  lastOperationAt?: number | null;
}

export interface OnePanelAppSummary {
  appKey?: string | null;
  name?: string | null;
  version?: string | null;
  status?: string | null;
  accessUrl?: string | null;
  portSummary?: string | null;
  upgradeAvailable?: boolean | null;
  updatedAt?: number | null;
}

export interface OnePanelWebsiteSummary {
  websiteId?: number | null;
  name?: string | null;
  primaryDomain?: string | null;
  status?: string | null;
  httpsEnabled?: boolean | null;
  certExpireAt?: number | null;
  proxyCount?: number | null;
  runtimeName?: string | null;
}

export interface OnePanelContainerSummary {
  containerId?: string | null;
  name?: string | null;
  image?: string | null;
  composeProject?: string | null;
  status?: string | null;
  cpuPercent?: number | null;
  memoryPercent?: number | null;
  portSummary?: string | null;
}

export interface OnePanelCronjobSummary {
  cronjobId?: number | null;
  name?: string | null;
  type?: string | null;
  status?: string | null;
  schedule?: string | null;
  lastRecordStatus?: string | null;
  lastRecordAt?: number | null;
}

export interface OnePanelBackupSummary {
  backupType?: string | null;
  sourceName?: string | null;
  lastRecordStatus?: string | null;
  lastBackupAt?: number | null;
  snapshotCount?: number | null;
  latestSnapshotAt?: number | null;
}

export interface OnePanelExporterReport {
  schemaVersion?: number | null;
  instanceKey?: string | null;
  assetId?: number | null;
  exporterVersion?: string | null;
  reportTime?: number | null;
  panelVersion?: string | null;
  panelEdition?: string | null;
  panelBaseUrl?: string | null;
  system?: OnePanelSystemSummary | null;
  audit?: OnePanelAuditSummary | null;
  apps?: OnePanelAppSummary[] | null;
  websites?: OnePanelWebsiteSummary[] | null;
  containers?: OnePanelContainerSummary[] | null;
  cronjobs?: OnePanelCronjobSummary[] | null;
  backups?: OnePanelBackupSummary[] | null;
}

export interface OnePanelInstance {
  id: number;
  name: string;
  assetId?: number | null;
  assetName?: string | null;
  assetPrimaryIp?: string | null;
  assetEnvironment?: string | null;
  assetRegion?: string | null;
  panelUrl?: string | null;
  instanceKey: string;
  reportEnabled: number;
  remark?: string | null;
  tokenIssuedAt?: number | null;
  lastReportAt?: number | null;
  lastReportStatus?: string | null;
  lastReportError?: string | null;
  lastReportRemoteIp?: string | null;
  exporterVersion?: string | null;
  panelVersion?: string | null;
  panelEdition?: string | null;
  appCount?: number | null;
  websiteCount?: number | null;
  containerCount?: number | null;
  cronjobCount?: number | null;
  backupCount?: number | null;
}

export interface OnePanelInstanceDetail {
  instance: OnePanelInstance;
  latestReport?: OnePanelExporterReport | null;
  latestReportTime?: number | null;
  latestReportRemoteIp?: string | null;
}

export interface OnePanelBootstrap {
  instance: OnePanelInstance;
  nodeToken: string;
  envTemplate: string;
  installSnippet: string;
}

export interface XuiSyncResult {
  instanceId: number;
  instanceName: string;
  trigger: string;
  remoteInboundCount: number;
  remoteClientCount: number;
  apiFlavor?: string | null;
  resolvedBasePath?: string | null;
  createdInboundCount?: number;
  updatedInboundCount?: number;
  deletedInboundCount?: number;
  createdClientCount?: number;
  updatedClientCount?: number;
  deletedClientCount?: number;
  finishedAt: number;
  message: string;
}

export interface AssetHost {
  id: number;
  name: string;
  label?: string | null;
  primaryIp?: string | null;
  ipv6?: string | null;
  environment?: string | null;
  provider?: string | null;
  region?: string | null;
  role?: string | null;
  os?: string | null;
  osCategory?: string | null;
  cpuCores?: number | null;
  memTotalMb?: number | null;
  diskTotalGb?: number | null;
  bandwidthMbps?: number | null;
  monthlyTrafficGb?: number | null;
  sshPort?: number | null;
  purchaseDate?: number | null;
  expireDate?: number | null;
  monthlyCost?: string | null;
  currency?: string | null;
  tags?: string | null;
  gostNodeId?: number | null;
  gostNodeName?: string | null;
  monitorNodeUuid?: string | null;
  pikaNodeId?: string | null;
  cpuName?: string | null;
  arch?: string | null;
  virtualization?: string | null;
  kernelVersion?: string | null;
  gpuName?: string | null;
  swapTotalMb?: number | null;
  purpose?: string | null;
  remark?: string | null;
  panelUrl?: string | null;
  onePanelInstanceId?: number | null;
  onePanelInstanceName?: string | null;
  onePanelReportEnabled?: number | null;
  onePanelLastReportStatus?: string | null;
  onePanelLastReportAt?: number | null;
  onePanelLastReportError?: string | null;
  onePanelExporterVersion?: string | null;
  onePanelPanelVersion?: string | null;
  billingCycle?: number | null;
  totalXuiInstances: number;
  totalProtocols: number;
  totalInbounds: number;
  totalClients: number;
  onlineClients: number;
  totalForwards: number;
  lastObservedAt?: number | null;
  monitorOnline?: number | null;
  monitorCpuUsage?: number | null;
  monitorMemUsed?: number | null;
  monitorMemTotal?: number | null;
  monitorNetIn?: number | null;
  monitorNetOut?: number | null;
  probeSource?: string | null;
  monitorLastSyncAt?: number | null;
  probeTrafficLimit?: number | null;
  probeTrafficUsed?: number | null;
  probeExpiredAt?: number | null;
  probeTags?: string | null;
}

export interface AssetForwardLink {
  id: number;
  name: string;
  tunnelId?: number | null;
  tunnelName?: string | null;
  status: number;
  remoteAddr: string;
  remoteSourceType?: string | null;
  remoteSourceLabel?: string | null;
  remoteSourceProtocol?: string | null;
  createdTime?: number | null;
  updatedTime?: number | null;
}

export interface MonitorMetricLatest {
  cpuUsage?: number | null;
  memUsed?: number | null;
  memTotal?: number | null;
  swapUsed?: number | null;
  swapTotal?: number | null;
  diskUsed?: number | null;
  diskTotal?: number | null;
  netIn?: number | null;
  netOut?: number | null;
  netTotalUp?: number | null;
  netTotalDown?: number | null;
  gpuUsage?: number | null;
  temperature?: number | null;
  load1?: number | null;
  load5?: number | null;
  load15?: number | null;
  uptime?: number | null;
  connections?: number | null;
  connectionsUdp?: number | null;
  processCount?: number | null;
  sampledAt?: number | null;
}

export interface MonitorNodeSnapshot {
  id: number;
  instanceId: number;
  instanceName?: string | null;
  instanceType?: string | null;
  remoteNodeUuid: string;
  assetId?: number | null;
  assetName?: string | null;
  name?: string | null;
  ip?: string | null;
  ipv6?: string | null;
  os?: string | null;
  cpuName?: string | null;
  cpuCores?: number | null;
  memTotal?: number | null;
  swapTotal?: number | null;
  diskTotal?: number | null;
  region?: string | null;
  version?: string | null;
  virtualization?: string | null;
  arch?: string | null;
  kernelVersion?: string | null;
  gpuName?: string | null;
  hidden?: number | null;
  tags?: string | null;
  nodeGroup?: string | null;
  weight?: number | null;
  price?: number | null;
  billingCycle?: number | null;
  currency?: string | null;
  expiredAt?: number | null;
  trafficLimit?: number | null;
  trafficLimitType?: string | null;
  trafficUsed?: number | null;
  trafficResetDay?: number | null;
  online?: number | null;
  lastActiveAt?: number | null;
  lastSyncAt?: number | null;
  latestMetric?: MonitorMetricLatest | null;
  instanceBaseUrl?: string | null;
  peerNodeId?: number | null;
  peerInstanceType?: string | null;
  // Asset enrichment fields
  provider?: string | null;
  label?: string | null;
  bandwidthMbps?: number | null;
  sshPort?: number | null;
  panelUrl?: string | null;
  remark?: string | null;
  purchaseDate?: number | null;
  monthlyCost?: string | null;
  purpose?: string | null;
  // Offline diagnostics fields
  firstSeenAt?: number | null;
  connectionStatus?: string | null;
  offlineDuration?: number | null;
  offlineReason?: string | null;
}

export interface MonitorInstance {
  id: number;
  name: string;
  type: string;
  baseUrl: string;
  apiKey?: string | null;
  username?: string | null;
  syncEnabled?: number | null;
  syncIntervalMinutes?: number | null;
  allowInsecureTls?: number | null;
  remark?: string | null;
  lastSyncAt?: number | null;
  lastSyncStatus?: string | null;
  lastSyncError?: string | null;
  nodeCount?: number | null;
  onlineNodeCount?: number | null;
  createdTime?: number | null;
  updatedTime?: number | null;
}

export interface MonitorProviderHighlight {
  title: string;
  category?: string | null;
  detail?: string | null;
  severity?: string | null;
  count?: number | null;
  timestamp?: number | null;
}

export interface PikaSecuritySummary {
  totalMonitors?: number | null;
  enabledMonitors?: number | null;
  publicMonitors?: number | null;
  alertRecordCount?: number | null;
  tamperProtectedNodes?: number | null;
  tamperEventCount?: number | null;
  tamperAlertCount?: number | null;
  auditCoverageNodes?: number | null;
  publicListeningPortCount?: number | null;
  suspiciousProcessCount?: number | null;
  highlights?: MonitorProviderHighlight[] | null;
}

export interface KomariOperationsSummary {
  publicNodeCount?: number | null;
  publicBoundNodeCount?: number | null;
  hiddenBoundNodeCount?: number | null;
  pingTaskCount?: number | null;
  loadNotificationCount?: number | null;
  offlineNotificationCount?: number | null;
  highlights?: MonitorProviderHighlight[] | null;
}

export interface MonitorProviderSummary {
  type: string;
  totalNodes?: number | null;
  onlineNodes?: number | null;
  pikaSecurity?: PikaSecuritySummary | null;
  komariOperations?: KomariOperationsSummary | null;
}

export interface MonitorInstanceDetail {
  instance: MonitorInstance;
  nodes: MonitorNodeSnapshot[];
  providerSummary?: MonitorProviderSummary | null;
  providerSummaryError?: string | null;
}

export interface PikaListeningPort {
  protocol?: string | null;
  address?: string | null;
  port?: number | null;
  processName?: string | null;
  processPid?: number | null;
  isPublic?: boolean | null;
}

export interface PikaProcess {
  pid?: number | null;
  name?: string | null;
  username?: string | null;
  cpuPercent?: number | null;
  memPercent?: number | null;
  exeDeleted?: boolean | null;
  cmdline?: string | null;
}

export interface PikaTamperEvent {
  path?: string | null;
  operation?: string | null;
  details?: string | null;
  timestamp?: number | null;
}

export interface PikaTamperAlert {
  path?: string | null;
  details?: string | null;
  restored?: boolean | null;
  timestamp?: number | null;
}

export interface PikaAuditRun {
  startTime?: number | null;
  endTime?: number | null;
  passCount?: number | null;
  failCount?: number | null;
  warnCount?: number | null;
  totalCount?: number | null;
  system?: string | null;
}

export interface PikaNodeSecurityDetail {
  tamperEnabled?: boolean | null;
  tamperProtectedPaths?: string[] | null;
  tamperApplyStatus?: string | null;
  tamperApplyMessage?: string | null;
  publicListeningPortCount?: number | null;
  suspiciousProcessCount?: number | null;
  auditStartTime?: number | null;
  auditEndTime?: number | null;
  auditWarnings?: string[] | null;
  publicListeningPorts?: PikaListeningPort[] | null;
  suspiciousProcesses?: PikaProcess[] | null;
  recentTamperEvents?: PikaTamperEvent[] | null;
  recentTamperAlerts?: PikaTamperAlert[] | null;
  recentAuditRuns?: PikaAuditRun[] | null;
}

export interface KomariPingTask {
  taskId: number;
  name?: string | null;
  target?: string | null;
  type?: string | null;
  interval?: number | null;
  clientCount?: number | null;
}

export interface KomariLoadNotification {
  name?: string | null;
  metric?: string | null;
  threshold?: number | null;
  ratio?: number | null;
  interval?: number | null;
}

export interface KomariOfflineNotification {
  enabled?: boolean | null;
  gracePeriod?: number | null;
}

export interface KomariNodeOperationsDetail {
  publicVisible?: boolean | null;
  publicNodeName?: string | null;
  publicNodeRegion?: string | null;
  publicNodeOs?: string | null;
  pingTasks?: KomariPingTask[] | null;
  loadNotifications?: KomariLoadNotification[] | null;
  offlineNotifications?: KomariOfflineNotification[] | null;
}

export interface KomariPingRecord {
  time?: number | null;
  value?: number | null;
  loss?: boolean | null;
}

export interface KomariPingTaskDetail {
  taskId: number;
  name?: string | null;
  target?: string | null;
  type?: string | null;
  interval?: number | null;
  clientCount?: number | null;
  recordCount?: number | null;
  lossCount?: number | null;
  lossPercent?: number | null;
  minLatency?: number | null;
  maxLatency?: number | null;
  avgLatency?: number | null;
  lastRecordAt?: number | null;
  records?: KomariPingRecord[] | null;
}

export interface MonitorNodeProviderDetail {
  nodeId: number;
  nodeName?: string | null;
  instanceType?: string | null;
  pikaSecurity?: PikaNodeSecurityDetail | null;
  komariOperations?: KomariNodeOperationsDetail | null;
  error?: string | null;
}

export interface AssetHostDetail {
  asset: AssetHost;
  xuiInstances: XuiInstance[];
  protocolSummaries: XuiProtocolSummary[];
  forwards: AssetForwardLink[];
  monitorNodes?: MonitorNodeSnapshot[];
  onePanelInstance?: OnePanelInstance | null;
}

export interface XuiForwardTarget {
  assetId?: number | null;
  assetName?: string | null;
  assetLabel?: string | null;
  instanceId: number;
  instanceName: string;
  inboundSnapshotId: number;
  protocol?: string | null;
  remark?: string | null;
  tag?: string | null;
  port?: number | null;
  transportSummary?: string | null;
  clientCount?: number | null;
  onlineClientCount?: number | null;
  remoteHost: string;
  remoteAddress: string;
  sourceLabel: string;
}

export interface PortalLink {
  id: string;
  groupName: string;
  title: string;
  href: string;
  description?: string | null;
  abbr?: string | null;
  environment?: string | null;
  target: 'new_tab' | 'same_tab' | string;
  sortOrder?: number | null;
  enabled: boolean;
}

export const login = (data: LoginData) => Network.post<LoginResponse>("/user/login", data);
export const completeTwoFactorLogin = (data: TwoFactorLoginData) => Network.post<LoginResponse>("/user/login/2fa", data);

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
export const getXuiProtocolDirectory = () => Network.post<XuiProtocolDirectory>("/xui/protocol-directory");
export const createXuiInstance = (data: any) => Network.post<XuiInstance>("/xui/create", data);
export const updateXuiInstance = (data: any) => Network.post<XuiInstance>("/xui/update", data);
export const deleteXuiInstance = (id: number) => Network.post("/xui/delete", { id });
export const testXuiInstance = (id: number) => Network.post<{
  instanceId: number;
  instanceName: string;
  remoteInboundCount: number;
  remoteClientCount: number;
  apiFlavor?: string | null;
  resolvedBasePath?: string | null;
  message: string;
}>("/xui/test", { id });
export const syncXuiInstance = (id: number) => Network.post<XuiSyncResult>("/xui/sync", { id });
export const getAssetList = () => Network.post<AssetHost[]>("/asset/list");
export const getAssetDetail = (id: number) => Network.post<AssetHostDetail>("/asset/detail", { id });
export const createAsset = (data: any) => Network.post<AssetHost>("/asset/create", data);
export const updateAsset = (data: any) => Network.post<AssetHost>("/asset/update", data);
export const deleteAsset = (id: number) => Network.post("/asset/delete", { id });
export const batchUpdateAsset = (data: { ids: number[]; field: string; value: string; mode?: string }) => Network.post("/asset/batch-update", data);
export const geolocateIp = (ip: string) => Network.post<{ country?: string; countryCode?: string; regionName?: string; city?: string; isp?: string }>("/asset/geolocate", { ip });
export const getForwardXuiTargets = () => Network.post<XuiForwardTarget[]>("/forward/xui-targets");
export const getPortalLinks = () => Network.post<PortalLink[]>("/portal/list");
export const savePortalLinks = (items: PortalLink[]) => Network.post<PortalLink[]>("/portal/save", { items });

// Monitor (Komari/Pika probe integration)
export const getMonitorList = () => Network.post<MonitorInstance[]>("/monitor/list");
export const getMonitorDetail = (id: number) => Network.post<MonitorInstanceDetail>("/monitor/detail", { id });
export const createMonitorInstance = (data: any) => Network.post<MonitorInstance>("/monitor/create", data);
export const updateMonitorInstance = (data: any) => Network.post<MonitorInstance>("/monitor/update", data);
export const deleteMonitorInstance = (id: number) => Network.post("/monitor/delete", { id });
export const testMonitorInstance = (id: number) => Network.post("/monitor/test", { id });
export const syncMonitorInstance = (id: number) => Network.post("/monitor/sync", { id });
export const getMonitorUnboundNodes = () => Network.post<MonitorNodeSnapshot[]>("/monitor/unbound-nodes");
export const getMonitorNodeProviderDetail = (id: number) =>
  Network.post<MonitorNodeProviderDetail>("/monitor/node-provider-detail", { id });
export const getKomariPingTaskDetail = (nodeId: number, taskId: number, hours: number = 12) =>
  Network.post<KomariPingTaskDetail>("/monitor/komari-ping-task-detail", { nodeId, taskId, hours });

export interface MonitorProvisionResult {
  uuid: string;
  token: string;
  instanceId: number;
  instanceName: string;
  endpoint: string;
  installCommand: string;
  installCommandCn?: string;
}
export const provisionMonitorAgent = (instanceId: number, name?: string) =>
  Network.post<MonitorProvisionResult>("/monitor/provision", { instanceId, name });

export interface DashboardNodesResponse {
  nodes: MonitorNodeSnapshot[];
  total: number;
  online: number;
  offline: number;
}
export const getMonitorDashboard = () => Network.post<DashboardNodesResponse>("/monitor/dashboard");
export const deleteMonitorNode = (id: number) => Network.post("/monitor/delete-node", { id });

// 1Panel exporter integration
export const getOnePanelList = () => Network.post<OnePanelInstance[]>("/onepanel/list");
export const getOnePanelDetail = (id: number) => Network.post<OnePanelInstanceDetail>("/onepanel/detail", { id });
export const createOnePanelInstance = (data: any) => Network.post<OnePanelBootstrap>("/onepanel/create", data);
export const updateOnePanelInstance = (data: any) => Network.post<OnePanelInstance>("/onepanel/update", data);
export const deleteOnePanelInstance = (id: number) => Network.post("/onepanel/delete", { id });
export const rotateOnePanelToken = (id: number) => Network.post<OnePanelBootstrap>("/onepanel/rotate-token", { id });
export const diagnoseOnePanelInstance = (id: number) => Network.post("/onepanel/diagnose", { id });

// JumpServer integration
export const getJumpServerStatus = () => Network.post<{ enabled: boolean; configured: boolean; url: string }>("/jumpserver/status");
export const jumpServerConnect = (assetId: number, protocol?: string, account?: string) =>
  Network.post<{ url: string; tokenId: string }>("/jumpserver/connect", { assetId, protocol: protocol || 'ssh', account: account || 'root' });

// Historical records / charts
export interface MonitorRecordPoint {
  timestamp: number;
  value: number;
}
export interface MonitorRecordSeries {
  name: string;
  data: MonitorRecordPoint[];
}
export interface MonitorRecordsResponse {
  series: MonitorRecordSeries[];
  probeType: string;
  range: string;
  nodeId: number;
}
export const getMonitorRecords = (nodeId: number, range: string, type?: string) =>
  Network.post<MonitorRecordsResponse>("/monitor/records", { nodeId, range, type: type || 'all' });

// Terminal access
export const getTerminalAccessUrl = (nodeId: number) =>
  Network.post<{ terminalUrl: string; nodeName: string; nodeIp: string; instanceName: string }>("/monitor/terminal-access", { nodeId });

// Dual-probe provision
export const provisionDualAgent = (komariInstanceId: number | null, pikaInstanceId: number | null, name?: string) =>
  Network.post<{ komari?: MonitorProvisionResult; pika?: MonitorProvisionResult; komariError?: string; pikaError?: string; combinedCommand: string }>("/monitor/provision-dual", { komariInstanceId, pikaInstanceId, name });

// Alert system
export interface AlertRule {
  id: number;
  name: string;
  enabled: number;
  metric: string;
  operator: string;
  threshold: number;
  durationSeconds: number;
  scopeType: string;
  scopeValue?: string | null;
  notifyType: string;
  notifyTarget?: string | null;
  cooldownMinutes: number;
  lastTriggeredAt?: number | null;
  probeCondition?: string | null;
  severity?: string | null;
  escalateAfterMinutes?: number | null;
  createdTime: number;
  updatedTime: number;
}
export interface AlertLog {
  id: number;
  ruleId: number;
  ruleName?: string | null;
  nodeId?: number | null;
  nodeName?: string | null;
  metric?: string | null;
  currentValue?: number | null;
  threshold?: number | null;
  message?: string | null;
  notifyStatus?: string | null;
  createdTime: number;
}
export const getAlertRules = () => Network.post<AlertRule[]>("/alert/rules");
export const createAlertRule = (data: Partial<AlertRule>) => Network.post<AlertRule>("/alert/rule/create", data);
export const updateAlertRule = (data: Partial<AlertRule>) => Network.post<AlertRule>("/alert/rule/update", data);
export const deleteAlertRule = (id: number) => Network.post("/alert/rule/delete", { id });
export const toggleAlertRule = (id: number) => Network.post<AlertRule>("/alert/rule/toggle", { id });
export const getAlertLogs = (page?: number, size?: number) =>
  Network.post<{ records: AlertLog[]; total: number }>("/alert/logs", { page: page || 1, size: size || 20 });
export const clearAlertLogs = () => Network.post("/alert/logs/clear");

// Enterprise IAM
export const getIamAuthOptions = () => Network.post<IamAuthOptions>("/iam/auth/options");
export const getDingtalkAuthorizeUrl = (channel: string = 'web') =>
  Network.post<DingtalkAuthorizeResponse>("/iam/auth/dingtalk/authorize-url", { channel });
export const completeDingtalkAuth = (authCode: string, state: string) =>
  Network.post<LoginResponse>("/iam/auth/dingtalk/login", { authCode, state });
export const testDingtalkConfig = () => Network.post("/iam/auth/dingtalk/test");
export const getIamCurrentProfile = () => Network.post("/iam/auth/me");
export const logoutIamSession = () => Network.post("/iam/auth/logout");

export interface IamPermissionView {
  id: number;
  code: string;
  name: string;
  moduleKey: string;
  description?: string | null;
  sortOrder?: number | null;
  enabled: number;
}

export interface IamRoleView {
  id: number;
  code: string;
  name: string;
  description?: string | null;
  roleScope?: string | null;
  builtin: number;
  sortOrder?: number | null;
  enabled: number;
  userCount: number;
  permissionCount: number;
  createdTime: number;
  updatedTime: number;
}

export interface IamRoleDetail {
  role: IamRoleView;
  permissionIds: number[];
  permissions: IamPermissionView[];
}

export interface IamUserView {
  id: number;
  displayName: string;
  email: string;
  authSource: string;
  localUsername?: string | null;
  mobile?: string | null;
  jobTitle?: string | null;
  dingtalkUserId?: string | null;
  departmentPath?: string | null;
  orgActive: number;
  enabled: number;
  lastOrgSyncAt?: number | null;
  lastLoginAt?: number | null;
  remark?: string | null;
  roleIds: number[];
  roleNames: string[];
  createdTime: number;
  updatedTime: number;
}

export interface IamUserDetail {
  user: IamUserView;
  roles: IamRoleView[];
}

export const getIamRoleList = () => Network.post<IamRoleView[]>("/iam/role/list");
export const getIamRoleDetail = (id: number) => Network.post<IamRoleDetail>("/iam/role/detail", { id });
export const createIamRole = (data: any) => Network.post<IamRoleDetail>("/iam/role/create", data);
export const updateIamRole = (data: any) => Network.post<IamRoleDetail>("/iam/role/update", data);
export const deleteIamRole = (id: number) => Network.post("/iam/role/delete", { id });
export const getIamPermissions = () => Network.post<IamPermissionView[]>("/iam/role/permissions");
export const assignIamRolePermissions = (roleId: number, permissionIds: number[]) =>
  Network.post<IamRoleDetail>("/iam/role/assign-permissions", { roleId, permissionIds });

export const getIamUserList = () => Network.post<IamUserView[]>("/iam/user/list");
export const getIamUserDetail = (id: number) => Network.post<IamUserDetail>("/iam/user/detail", { id });
export const createIamUser = (data: any) => Network.post<IamUserDetail>("/iam/user/create", data);
export const updateIamUser = (data: any) => Network.post<IamUserDetail>("/iam/user/update", data);
export const deleteIamUser = (id: number) => Network.post("/iam/user/delete", { id });
export const assignIamUserRoles = (userId: number, roleIds: number[]) =>
  Network.post<IamUserDetail>("/iam/user/assign-roles", { userId, roleIds });

// ==================== Audit Log ====================
export interface AuditLogItem {
  id: number;
  username: string;
  action: string;
  module: string;
  targetId?: number | null;
  targetName?: string | null;
  detail?: string | null;
  ip?: string | null;
  result?: string | null;
  createdTime: number;
}
export interface AuditStats {
  todayCount: number;
  weekCount: number;
  moduleDistribution: { module: string; count: number }[];
}
export const getAuditLogs = (params: { page?: number; size?: number; module?: string; action?: string; startTime?: number; endTime?: number }) =>
  Network.post<{ records: AuditLogItem[]; total: number; page: number; size: number }>("/audit/logs", params);
export const getAuditStats = () => Network.post<AuditStats>("/audit/stats");
export const clearAuditLogs = (days: number) => Network.post<number>("/audit/clear", { days });

// ==================== Expiry Reminder ====================
export interface ExpiryReminderConfig {
  id: number;
  enabled: number;
  remindDaysBefore: string;
  notifyChannel: string;
  lastCheckAt?: number | null;
}
export const getExpiryConfig = () => Network.post<ExpiryReminderConfig>("/audit/expiry/config");
export const updateExpiryConfig = (config: Partial<ExpiryReminderConfig>) =>
  Network.post("/audit/expiry/config/update", config);
export const checkExpiryNow = () =>
  Network.post<{ checkedCount: number; notifiedCount: number; details: any[] }>("/audit/expiry/check-now");

// ==================== Notification Center ====================
export interface NotificationItem {
  id: number;
  title: string;
  content: string;
  type: string;
  severity: string;
  sourceModule?: string | null;
  sourceId?: number | null;
  readStatus: number;
  readAt?: number | null;
  createdTime: number;
}
export interface NotifyChannelItem {
  id: number;
  name: string;
  type: string;
  enabled: number;
  configJson?: string | null;
  createdTime: number;
}
export interface NotifyPolicyItem {
  id: number;
  name: string;
  enabled: number;
  eventTypes?: string | null;
  severityFilter?: string | null;
  channelIds?: string | null;
  createdTime: number;
}
export const getNotifications = (params?: { page?: number; size?: number; readStatus?: number; type?: string }) =>
  Network.post<{ records: NotificationItem[]; total: number; page: number; size: number }>("/notification/list", params);
export const getUnreadCount = () => Network.post<{ count: number }>("/notification/unread");
export const markNotificationRead = (id: number) => Network.post("/notification/read", { id });
export const markAllNotificationsRead = () => Network.post("/notification/read-all");
export const getNotifyChannels = () => Network.post<NotifyChannelItem[]>("/notification/channel/list");
export const createNotifyChannel = (data: Partial<NotifyChannelItem>) => Network.post<NotifyChannelItem>("/notification/channel/create", data);
export const updateNotifyChannel = (data: Partial<NotifyChannelItem>) => Network.post<NotifyChannelItem>("/notification/channel/update", data);
export const deleteNotifyChannel = (id: number) => Network.post("/notification/channel/delete", { id });
export const testNotifyChannel = (id: number) => Network.post("/notification/channel/test", { id });
export const getNotifyPolicies = () => Network.post<NotifyPolicyItem[]>("/notification/policy/list");
export const createNotifyPolicy = (data: Partial<NotifyPolicyItem>) => Network.post<NotifyPolicyItem>("/notification/policy/create", data);
export const updateNotifyPolicy = (data: Partial<NotifyPolicyItem>) => Network.post<NotifyPolicyItem>("/notification/policy/update", data);
export const deleteNotifyPolicy = (id: number) => Network.post("/notification/policy/delete", { id });

// ==================== Server Group / Topology ====================
export interface ServerGroupItem {
  id: number;
  name: string;
  description?: string | null;
  groupType?: string | null;
  region?: string | null;
  color?: string | null;
  sortOrder?: number | null;
  createdTime: number;
}
export interface ServerGroupMemberItem {
  id: number;
  groupId: number;
  assetId: number;
  roleInGroup?: string | null;
  sortOrder?: number | null;
  assetName?: string | null;
  primaryIp?: string | null;
  region?: string | null;
  role?: string | null;
  provider?: string | null;
}
export interface TopologyData {
  nodes: { id: string; name: string; ip?: string; type: string; region?: string; role?: string }[];
  edges: { from: string; to: string; label?: string; forwardId?: number; forwardName?: string }[];
}
export const getServerGroups = () => Network.post<ServerGroupItem[]>("/topology/group/list");
export const createServerGroup = (data: Partial<ServerGroupItem>) => Network.post<ServerGroupItem>("/topology/group/create", data);
export const updateServerGroup = (data: Partial<ServerGroupItem>) => Network.post<ServerGroupItem>("/topology/group/update", data);
export const deleteServerGroup = (id: number) => Network.post("/topology/group/delete", { id });
export const getGroupMembers = (groupId: number) => Network.post<ServerGroupMemberItem[]>("/topology/group/members", { groupId });
export const addGroupMember = (groupId: number, assetId: number, roleInGroup?: string) =>
  Network.post<ServerGroupMemberItem>("/topology/group/member/add", { groupId, assetId, roleInGroup });
export const removeGroupMember = (id: number) => Network.post("/topology/group/member/remove", { id });
export const getTopologyData = () => Network.post<TopologyData>("/topology/data");
export const getGroupDashboard = (groupId: number) =>
  Network.post<{ group: ServerGroupItem; totalCount: number; onlineCount: number; offlineCount: number; totalMonthlyCost: number; members: any[] }>("/topology/group/dashboard", { groupId });

// ==================== Backup Management ====================
export interface BackupRecordItem {
  id: number;
  name: string;
  type: string;
  sourceId?: number | null;
  sourceName?: string | null;
  backupData?: string | null;
  triggerType: string;
  backupStatus: string;
  createdTime: number;
}
export interface BackupScheduleItem {
  id: number;
  name: string;
  type: string;
  cronExpr: string;
  enabled: number;
  lastRunAt?: number | null;
  createdTime: number;
}
export const getBackupRecords = (params?: { type?: string; page?: number; size?: number }) =>
  Network.post<any>("/backup/list", params);
export const exportGostConfig = (nodeId: number) => Network.post<BackupRecordItem>("/backup/export/gost", { nodeId });
export const exportXuiConfig = (instanceId: number) => Network.post<BackupRecordItem>("/backup/export/xui", { instanceId });
export const backupDatabase = () => Network.post<BackupRecordItem>("/backup/database");
export const deleteBackupRecord = (id: number) => Network.post("/backup/delete", { id });
export const getBackupSchedules = () => Network.post<BackupScheduleItem[]>("/backup/schedule/list");
export const createBackupSchedule = (data: Partial<BackupScheduleItem>) => Network.post<BackupScheduleItem>("/backup/schedule/create", data);
export const updateBackupSchedule = (data: Partial<BackupScheduleItem>) => Network.post<BackupScheduleItem>("/backup/schedule/update", data);
export const deleteBackupSchedule = (id: number) => Network.post("/backup/schedule/delete", { id });

// ==================== IP Quality ====================
export interface IpCheckRecordItem {
  id: number;
  ip: string;
  assetId?: number | null;
  assetName?: string | null;
  checkType: string;
  blacklistResult?: string | null;
  blacklistScore?: number | null;
  geoInfo?: string | null;
  portCheck?: string | null;
  overallStatus: string;
  createdTime: number;
}
export interface LatencyMatrixItem {
  id: number;
  fromRegion?: string | null;
  fromAssetId?: number | null;
  toIp?: string | null;
  toAssetId?: number | null;
  latencyMs?: number | null;
  packetLoss?: number | null;
  jitterMs?: number | null;
  testMethod?: string | null;
  createdTime: number;
}
export const checkIpQuality = (ip: string, assetId?: number) =>
  Network.post<IpCheckRecordItem>("/ip-quality/check", { ip, assetId });
export const batchCheckIpQuality = (assetIds: number[]) =>
  Network.post<IpCheckRecordItem[]>("/ip-quality/batch-check", { assetIds });
export const getIpCheckRecords = (params?: { page?: number; size?: number; ip?: string; overallStatus?: string }) =>
  Network.post<{ records: IpCheckRecordItem[]; total: number; page: number; size: number }>("/ip-quality/list", params);
export const getLatestIpCheckByAsset = () => Network.post<IpCheckRecordItem[]>("/ip-quality/latest-by-asset");
export const getLatencyMatrix = () => Network.post<LatencyMatrixItem[]>("/ip-quality/latency-matrix");

// ==================== Traffic Analysis ====================
export interface TrafficOverview {
  totalUpload24h: number;
  totalDownload24h: number;
  peakRate24h: number;
  unacknowledgedAnomalies: number;
}
export interface TrafficHourlyStat {
  id: number;
  dimensionType: string;
  dimensionId?: number | null;
  dimensionName?: string | null;
  hourKey: string;
  uploadBytes: number;
  downloadBytes: number;
  totalBytes: number;
  peakRateBps?: number | null;
  createdTime: number;
}
export interface TrafficAnomalyItem {
  id: number;
  dimensionType: string;
  dimensionId?: number | null;
  dimensionName?: string | null;
  anomalyType: string;
  severity: string;
  description?: string | null;
  currentValue?: number | null;
  baselineValue?: number | null;
  deviationRatio?: number | null;
  acknowledged: number;
  createdTime: number;
}
export const getTrafficOverview = () => Network.post<TrafficOverview>("/traffic-analysis/overview");
export const getTrafficTrend = (params?: { dimensionType?: string; dimensionId?: number; range?: string }) =>
  Network.post<TrafficHourlyStat[]>("/traffic-analysis/trend", params);
export const getTrafficTopUsers = (range?: string, limit?: number) =>
  Network.post<{ dimensionId: number; dimensionName?: string; totalBytes: number }[]>("/traffic-analysis/top-users", { range, limit });
export const getTrafficTopForwards = (range?: string, limit?: number) =>
  Network.post<{ dimensionId: number; dimensionName?: string; totalBytes: number }[]>("/traffic-analysis/top-forwards", { range, limit });
export const getTrafficPeakHours = (range?: string) =>
  Network.post<{ hour: number; totalBytes: number }[]>("/traffic-analysis/peak-hours", { range });
export const getTrafficProtocolDistribution = (range?: string) =>
  Network.post<{ protocol: string; totalBytes: number }[]>("/traffic-analysis/protocol-distribution", { range });
export const getTrafficAnomalies = (params?: { page?: number; size?: number; acknowledged?: number }) =>
  Network.post<{ records: TrafficAnomalyItem[]; total: number; page: number; size: number }>("/traffic-analysis/anomalies", params);
export const acknowledgeTrafficAnomaly = (id: number) => Network.post("/traffic-analysis/anomalies/acknowledge", { id });
