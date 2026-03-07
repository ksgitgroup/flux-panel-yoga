import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import toast from 'react-hot-toast';
import axios from 'axios';
import { Button } from "@heroui/button";
import { Card, CardBody, CardHeader } from "@heroui/card";
import { Chip } from "@heroui/chip";
import { Modal, ModalBody, ModalContent, ModalHeader } from "@heroui/modal";
import { Progress } from "@heroui/progress";
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { getDiagnosisSummary, getDiagnosisTrend, getNodeList, getUserPackageInfo } from "@/api";
import { siteConfig } from "@/config/site";

interface UserInfo {
  flow: number;
  inFlow: number;
  outFlow: number;
  num: number;
  expTime?: string;
  flowResetTime?: number;
}

interface UserTunnel {
  id: number;
  tunnelId: number;
  tunnelName: string;
  flow: number;
  inFlow: number;
  outFlow: number;
  num: number;
  expTime?: string;
  flowResetTime?: number;
  tunnelFlow: number;
}

interface Forward {
  id: number;
  name: string;
  tunnelId: number;
  tunnelName: string;
  inIp: string;
  inPort: number;
  remoteAddr: string;
  inFlow: number;
  outFlow: number;
  status: number;
}

interface AddressItem {
  id: number;
  ip: string;
  address: string;
  copying: boolean;
}

interface StatisticsFlow {
  id: number;
  userId: number;
  flow: number;
  totalFlow: number;
  time: string;
  createdTime: number;
}

interface DiagnosisBatchItem {
  id: number;
  targetType: string;
  targetId: number;
  targetName: string;
  overallSuccess: boolean;
  resultsJson: string;
  averageTime?: number;
  packetLoss?: number;
  createdTime: number;
}

interface DiagnosisSummary {
  totalCount: number;
  successCount: number;
  failCount: number;
  healthRate: number;
  avgLatency?: number;
  lastRunTime?: number;
  recentFailures: DiagnosisBatchItem[];
}

interface TrendPoint {
  time: number;
  hour: string;
  success: number;
  fail: number;
  total: number;
  avgLatency?: number;
}

interface NodeRuntimeInfo {
  cpuUsage: number;
  memoryUsage: number;
  uploadTraffic: number;
  downloadTraffic: number;
  uploadSpeed: number;
  downloadSpeed: number;
  uptime: number;
}

interface DashboardNode {
  id: number;
  name: string;
  status: number;
  connectionStatus: 'online' | 'offline';
  systemInfo?: NodeRuntimeInfo | null;
}

const formatFlow = (value: number, unit: string = 'bytes'): string => {
  if (value === 99999) return '无限制';
  if (unit === 'gb') return `${value || 0} GB`;
  if (!value) return '0 B';
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(2)} KB`;
  if (value < 1024 * 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(2)} MB`;
  return `${(value / (1024 * 1024 * 1024)).toFixed(2)} GB`;
};

const formatFlowAxis = (value: number) => {
  if (value === 0) return '0';
  if (value < 1024) return `${value}B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)}K`;
  if (value < 1024 * 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)}M`;
  return `${(value / (1024 * 1024 * 1024)).toFixed(1)}G`;
};

const formatSpeed = (value: number) => `${formatFlow(value)}/s`;

const formatNumber = (value: number): string => {
  if (value === 99999) return '无限制';
  return `${value || 0}`;
};

const formatDateTime = (ts?: number) => {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('zh-CN', { hour12: false });
};

const formatRelativeTime = (ts?: number) => {
  if (!ts) return '—';
  const diff = Date.now() - ts;
  if (diff < 60_000) return '刚刚';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`;
  return `${Math.floor(diff / 86_400_000)} 天前`;
};

const normalizeSummary = (data: any): DiagnosisSummary => ({
  totalCount: Number(data?.totalCount ?? 0),
  successCount: Number(data?.successCount ?? 0),
  failCount: Number(data?.failCount ?? 0),
  healthRate: Number(data?.healthRate ?? 100),
  avgLatency: data?.avgLatency ?? undefined,
  lastRunTime: data?.lastRunTime ?? undefined,
  recentFailures: Array.isArray(data?.recentFailures) ? data.recentFailures : [],
});

const normalizeTrend = (data: any): TrendPoint[] =>
  Array.isArray(data)
    ? data.map((item) => ({
        time: Number(item?.time ?? 0),
        hour: item?.hour || '--:--',
        success: Number(item?.success ?? 0),
        fail: Number(item?.fail ?? 0),
        total: Number(item?.total ?? 0),
        avgLatency: item?.avgLatency ?? undefined,
      }))
    : [];

const getExpStatus = (expTime?: string) => {
  if (!expTime) {
    return { tone: 'success' as const, label: '永久有效' };
  }

  const now = new Date();
  const expDate = new Date(expTime);
  if (Number.isNaN(expDate.getTime())) {
    return { tone: 'default' as const, label: '日期异常' };
  }
  if (expDate.getTime() <= now.getTime()) {
    return { tone: 'danger' as const, label: '已过期' };
  }

  const diffDays = Math.ceil((expDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays <= 7) return { tone: 'danger' as const, label: `${diffDays} 天后到期` };
  if (diffDays <= 30) return { tone: 'warning' as const, label: `${diffDays} 天后到期` };
  return { tone: 'success' as const, label: `${diffDays} 天后到期` };
};

const getHealthTone = (healthRate: number) => {
  if (healthRate >= 97) return { color: '#059669', bg: 'from-emerald-500 to-teal-500', label: '稳定' };
  if (healthRate >= 85) return { color: '#2563eb', bg: 'from-blue-500 to-cyan-500', label: '可控' };
  if (healthRate >= 70) return { color: '#d97706', bg: 'from-amber-500 to-orange-500', label: '关注' };
  return { color: '#dc2626', bg: 'from-rose-500 to-red-500', label: '告警' };
};

const getEnvironmentLabel = () => siteConfig.environment_name || siteConfig.branch || 'DEV';
const toneLabelMap: Record<'default' | 'primary' | 'success' | 'warning' | 'danger', string> = {
  default: '概览',
  primary: '重点',
  success: '稳定',
  warning: '注意',
  danger: '告警',
};

const OverviewMetric = ({
  label,
  value,
  subtitle,
  tone = 'default',
  progress,
}: {
  label: string;
  value: string;
  subtitle: string;
  tone?: 'default' | 'primary' | 'success' | 'warning' | 'danger';
  progress?: number;
}) => (
  <Card className="border border-default-200 bg-white/80 shadow-sm dark:bg-black/20">
    <CardBody className="gap-3 p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs uppercase tracking-[0.18em] text-default-400">{label}</p>
        <Chip size="sm" variant="flat" color={tone}>{toneLabelMap[tone]}</Chip>
      </div>
      <div>
        <p className="text-2xl font-semibold text-foreground">{value}</p>
        <p className="mt-1 text-xs leading-5 text-default-500">{subtitle}</p>
      </div>
      {typeof progress === 'number' && (
        <Progress
          aria-label={label}
          size="sm"
          value={Math.max(0, Math.min(progress, 100))}
          color={progress >= 90 ? 'danger' : progress >= 70 ? 'warning' : 'primary'}
          classNames={{ track: 'bg-default-100' }}
        />
      )}
    </CardBody>
  </Card>
);

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [userInfo, setUserInfo] = useState<UserInfo>({} as UserInfo);
  const [userTunnels, setUserTunnels] = useState<UserTunnel[]>([]);
  const [forwardList, setForwardList] = useState<Forward[]>([]);
  const [statisticsFlows, setStatisticsFlows] = useState<StatisticsFlow[]>([]);
  const [diagnosisSummary, setDiagnosisSummary] = useState<DiagnosisSummary | null>(null);
  const [diagnosisTrend, setDiagnosisTrend] = useState<TrendPoint[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [nodes, setNodes] = useState<DashboardNode[]>([]);

  const websocketRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const reconnectAttemptsRef = useRef(0);

  const [addressModalOpen, setAddressModalOpen] = useState(false);
  const [addressModalTitle, setAddressModalTitle] = useState('');
  const [addressList, setAddressList] = useState<AddressItem[]>([]);

  const checkExpirationNotifications = (nextUserInfo: UserInfo, tunnels: UserTunnel[]) => {
    const notificationKey = `expiration-${nextUserInfo.expTime}-${tunnels.map((item) => item.expTime).join(',')}`;
    if (localStorage.getItem('lastNotified') === notificationKey) return;

    let hasNotification = false;
    const now = new Date();
    const notifyExpiration = (name: string, expTime?: string, prefix?: string) => {
      if (!expTime) return;
      const expDate = new Date(expTime);
      if (Number.isNaN(expDate.getTime())) return;
      const diffDays = Math.ceil((expDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

      if (diffDays <= 0) {
        hasNotification = true;
        toast(`${prefix || ''}${name}已过期`, {
          icon: '⚠️',
          duration: 7000,
          style: { background: '#dc2626', color: '#fff' },
        });
        return;
      }

      if (diffDays <= 7) {
        hasNotification = true;
        toast(`${prefix || ''}${name}${diffDays === 1 ? '将于明天过期' : `将于 ${diffDays} 天后过期`}`, {
          icon: '⚠️',
          duration: 6000,
          style: { background: '#f59e0b', color: '#fff' },
        });
      }
    };

    notifyExpiration('账户', nextUserInfo.expTime, '');
    tunnels.forEach((tunnel) => notifyExpiration(`隧道 “${tunnel.tunnelName}”`, tunnel.expTime));

    if (hasNotification) {
      localStorage.setItem('lastNotified', notificationKey);
    }
  };

  useEffect(() => {
    setLoading(true);
    setUserInfo({} as UserInfo);
    setUserTunnels([]);
    setForwardList([]);
    setStatisticsFlows([]);
    setDiagnosisSummary(null);
    setDiagnosisTrend([]);

    const adminStatus = localStorage.getItem('admin');
    setIsAdmin(adminStatus === 'true');
    localStorage.setItem('e', '/dashboard');
    void loadDashboard();
  }, []);

  useEffect(() => {
    if (!isAdmin) {
      setNodes([]);
      if (reconnectTimerRef.current) {
        window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (websocketRef.current) {
        websocketRef.current.close();
        websocketRef.current = null;
      }
      return;
    }

    let unmounted = false;

    const loadNodes = async () => {
      try {
        const response = await getNodeList();
        if (unmounted || response.code !== 0) return;
        setNodes((response.data || []).map((node: any) => ({
          ...node,
          connectionStatus: node.status === 1 ? 'online' : 'offline',
          systemInfo: null,
        })));
      } catch {
        /* silent */
      }
    };

    const closeSocket = () => {
      if (reconnectTimerRef.current) {
        window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (websocketRef.current) {
        websocketRef.current.onopen = null;
        websocketRef.current.onmessage = null;
        websocketRef.current.onerror = null;
        websocketRef.current.onclose = null;
        websocketRef.current.close();
        websocketRef.current = null;
      }
    };

    const attemptReconnect = () => {
      if (unmounted || reconnectAttemptsRef.current >= 4) return;
      reconnectAttemptsRef.current += 1;
      reconnectTimerRef.current = window.setTimeout(() => {
        initSocket();
      }, reconnectAttemptsRef.current * 2500);
    };

    const handleSocketMessage = (payload: any) => {
      const { id, type, data } = payload || {};

      if (type === 'status') {
        setNodes((prev) => prev.map((node) => (
          node.id == id
            ? {
                ...node,
                connectionStatus: data === 1 ? 'online' : 'offline',
                systemInfo: data === 0 ? null : node.systemInfo,
              }
            : node
        )));
        return;
      }

      if (type === 'info') {
        setNodes((prev) => prev.map((node) => {
          if (node.id != id) return node;

          try {
            const systemInfo = typeof data === 'string' ? JSON.parse(data) : data;
            const currentUpload = parseInt(systemInfo.bytes_transmitted, 10) || 0;
            const currentDownload = parseInt(systemInfo.bytes_received, 10) || 0;
            const currentUptime = parseInt(systemInfo.uptime, 10) || 0;

            let uploadSpeed = 0;
            let downloadSpeed = 0;

            if (node.systemInfo?.uptime) {
              const diff = currentUptime - node.systemInfo.uptime;
              if (diff > 0 && diff <= 10) {
                const uploadDiff = currentUpload - (node.systemInfo.uploadTraffic || 0);
                const downloadDiff = currentDownload - (node.systemInfo.downloadTraffic || 0);
                if (uploadDiff >= 0) uploadSpeed = uploadDiff / diff;
                if (downloadDiff >= 0) downloadSpeed = downloadDiff / diff;
              }
            }

            return {
              ...node,
              connectionStatus: 'online',
              systemInfo: {
                cpuUsage: parseFloat(systemInfo.cpu_usage) || 0,
                memoryUsage: parseFloat(systemInfo.memory_usage) || 0,
                uploadTraffic: currentUpload,
                downloadTraffic: currentDownload,
                uploadSpeed,
                downloadSpeed,
                uptime: currentUptime,
              }
            };
          } catch {
            return node;
          }
        }));
      }
    };

    const initSocket = () => {
      if (unmounted) return;
      if (websocketRef.current && (
        websocketRef.current.readyState === WebSocket.OPEN ||
        websocketRef.current.readyState === WebSocket.CONNECTING
      )) {
        return;
      }

      closeSocket();

      const baseUrl = axios.defaults.baseURL || (import.meta.env.VITE_API_BASE ? `${import.meta.env.VITE_API_BASE}/api/v1/` : '/api/v1/');
      const wsUrl = baseUrl.replace(/^http/, 'ws').replace(/\/api\/v1\/$/, '') + `/system-info?type=0&secret=${localStorage.getItem('token')}`;

      try {
        websocketRef.current = new WebSocket(wsUrl);
        websocketRef.current.onopen = () => {
          reconnectAttemptsRef.current = 0;
        };
        websocketRef.current.onmessage = (event) => {
          try {
            handleSocketMessage(JSON.parse(event.data));
          } catch {
            /* silent */
          }
        };
        websocketRef.current.onerror = () => {
          /* silent */
        };
        websocketRef.current.onclose = () => {
          websocketRef.current = null;
          attemptReconnect();
        };
      } catch {
        attemptReconnect();
      }
    };

    void loadNodes();
    initSocket();

    return () => {
      unmounted = true;
      closeSocket();
    };
  }, [isAdmin]);

  const loadDashboard = async () => {
    setLoading(true);
    try {
      const [packageResp, summaryResp, trendResp] = await Promise.all([
        getUserPackageInfo(),
        getDiagnosisSummary().catch(() => null),
        getDiagnosisTrend({ hours: 24 }).catch(() => null),
      ]);

      if (packageResp.code !== 0) {
        toast.error(packageResp.msg || '获取仪表盘数据失败');
        return;
      }

      const data = packageResp.data || {};
      const nextUserInfo = data.userInfo || ({} as UserInfo);
      const nextTunnels = data.tunnelPermissions || [];
      const nextForwards = data.forwards || [];
      const nextStatisticsFlows = data.statisticsFlows || [];

      setUserInfo(nextUserInfo);
      setUserTunnels(nextTunnels);
      setForwardList(nextForwards);
      setStatisticsFlows(nextStatisticsFlows);
      checkExpirationNotifications(nextUserInfo, nextTunnels);

      if (summaryResp?.code === 0) {
        setDiagnosisSummary(normalizeSummary(summaryResp.data));
      }
      if (trendResp?.code === 0) {
        setDiagnosisTrend(normalizeTrend(trendResp.data));
      }
    } catch (error) {
      console.error('加载仪表盘失败:', error);
      toast.error('获取仪表盘数据失败');
    } finally {
      setLoading(false);
    }
  };

  const calculateUserTotalUsedFlow = () => (userInfo.inFlow || 0) + (userInfo.outFlow || 0);
  const calculateForwardBillingFlow = (forward: Forward) => (forward.inFlow || 0) + (forward.outFlow || 0);
  const calculateTunnelUsedFlow = (tunnel: UserTunnel) => (tunnel.inFlow || 0) + (tunnel.outFlow || 0);
  const getTunnelUsedForwards = (tunnelId: number) => forwardList.filter((forward) => forward.tunnelId === tunnelId).length;
  const calculateUsagePercentage = (type: 'flow' | 'forwards') => {
    if (type === 'flow') {
      if (userInfo.flow === 99999) return 0;
      const totalLimit = (userInfo.flow || 0) * 1024 * 1024 * 1024;
      return totalLimit > 0 ? Math.min((calculateUserTotalUsedFlow() / totalLimit) * 100, 100) : 0;
    }
    if (userInfo.num === 99999) return 0;
    return userInfo.num ? Math.min((forwardList.length / userInfo.num) * 100, 100) : 0;
  };

  const formatResetTime = (resetDay?: number) => {
    if (resetDay === undefined || resetDay === null) return '未设置';
    if (resetDay === 0) return '不重置';
    const now = new Date();
    const currentDay = now.getDate();
    let daysUntilReset = 0;
    if (resetDay > currentDay) {
      daysUntilReset = resetDay - currentDay;
    } else if (resetDay < currentDay) {
      const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, resetDay);
      daysUntilReset = Math.ceil((nextMonth.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    }
    if (daysUntilReset === 0) return '今日重置';
    if (daysUntilReset === 1) return '明日重置';
    return `${daysUntilReset} 天后重置`;
  };

  const formatRemoteAddress = (remoteAddr: string) => {
    if (!remoteAddr) return '';
    const addresses = remoteAddr.split(',').map((item) => item.trim()).filter(Boolean);
    if (addresses.length <= 1) return addresses[0] || '';
    return `${addresses[0]} (+${addresses.length - 1})`;
  };

  const hasMultipleRemoteAddresses = (remoteAddr: string) => {
    if (!remoteAddr) return false;
    return remoteAddr.split(',').map((item) => item.trim()).filter(Boolean).length > 1;
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success('已复制');
    } catch {
      toast.error('复制失败：请使用 https 访问面板');
    }
  };

  const showRemoteAddressModal = (remoteAddr: string, title: string) => {
    if (!remoteAddr) return;
    const addresses = remoteAddr.split(',').map((item) => item.trim()).filter(Boolean);
    if (addresses.length <= 1) {
      void copyToClipboard(remoteAddr);
      return;
    }
    setAddressList(addresses.map((address, index) => ({ id: index, ip: address, address, copying: false })));
    setAddressModalTitle(`${title} (${addresses.length} 个)`);
    setAddressModalOpen(true);
  };

  const copyAddress = async (addressItem: AddressItem) => {
    setAddressList((prev) => prev.map((item) => item.id === addressItem.id ? { ...item, copying: true } : item));
    await copyToClipboard(addressItem.address);
    setAddressList((prev) => prev.map((item) => item.id === addressItem.id ? { ...item, copying: false } : item));
  };

  const copyAllAddresses = async () => {
    if (addressList.length === 0) return;
    await copyToClipboard(addressList.map((item) => item.address).join('\n'));
  };

  const trafficChartData = useMemo(() => {
    const base = statisticsFlows.map((item) => ({
      time: item.time,
      flow: Number(item.flow || 0),
      createdTime: Number(item.createdTime || 0),
    }));

    return base.map((item, index, list) => {
      const related = list.slice(Math.max(0, index - 1), Math.min(list.length, index + 2));
      const movingAverage = related.length
        ? related.reduce((sum, current) => sum + current.flow, 0) / related.length
        : item.flow;

      return {
        ...item,
        movingAverage,
        formattedFlow: formatFlow(item.flow),
      };
    });
  }, [statisticsFlows]);

  const totalFlow24h = useMemo(() => trafficChartData.reduce((sum, item) => sum + item.flow, 0), [trafficChartData]);
  const activeFlowHours = useMemo(() => trafficChartData.filter((item) => item.flow > 0).length, [trafficChartData]);
  const averageFlow24h = useMemo(
    () => (trafficChartData.length ? totalFlow24h / trafficChartData.length : 0),
    [trafficChartData, totalFlow24h],
  );
  const peakFlowPoint = useMemo(() => {
    if (!trafficChartData.length) return null;
    return trafficChartData.reduce((peak, current) => current.flow > peak.flow ? current : peak, trafficChartData[0]);
  }, [trafficChartData]);
  const hasTrafficData = useMemo(() => trafficChartData.some((item) => item.flow > 0), [trafficChartData]);
  const latestFlowPoint = trafficChartData[trafficChartData.length - 1];
  const previousFlowPoint = trafficChartData[trafficChartData.length - 2];
  const trafficMomentum = useMemo(() => {
    const latest = latestFlowPoint?.flow || 0;
    const previous = previousFlowPoint?.flow || 0;
    if (!previous && !latest) return { label: '暂无波动', tone: 'default' as const };
    if (!previous) return { label: '本小时开始出现流量', tone: 'success' as const };
    const change = ((latest - previous) / previous) * 100;
    if (change >= 15) return { label: `较上一时段上升 ${change.toFixed(0)}%`, tone: 'success' as const };
    if (change <= -15) return { label: `较上一时段下降 ${Math.abs(change).toFixed(0)}%`, tone: 'warning' as const };
    return { label: '整体保持平稳', tone: 'primary' as const };
  }, [latestFlowPoint, previousFlowPoint]);

  const diagnosisTrendData = useMemo(() => (
    diagnosisTrend.map((item) => ({
      ...item,
      healthRate: item.total > 0 ? Number(((item.success / item.total) * 100).toFixed(1)) : null,
    }))
  ), [diagnosisTrend]);

  const diagnosisHotspots = useMemo(() => (
    [...diagnosisTrendData]
      .filter((item) => item.fail > 0 || (item.avgLatency ?? 0) > 0)
      .sort((a, b) => {
        const scoreA = a.fail * 1000 + Number(a.avgLatency || 0);
        const scoreB = b.fail * 1000 + Number(b.avgLatency || 0);
        return scoreB - scoreA;
      })
      .slice(0, 3)
  ), [diagnosisTrendData]);

  const liveNodeSummary = useMemo(() => {
    const onlineNodes = nodes.filter((node) => node.connectionStatus === 'online');
    const nodesWithInfo = onlineNodes.filter((node) => node.systemInfo);
    const totals = nodesWithInfo.reduce((acc, node) => {
      acc.uploadTraffic += node.systemInfo?.uploadTraffic || 0;
      acc.downloadTraffic += node.systemInfo?.downloadTraffic || 0;
      acc.uploadSpeed += node.systemInfo?.uploadSpeed || 0;
      acc.downloadSpeed += node.systemInfo?.downloadSpeed || 0;
      return acc;
    }, { uploadTraffic: 0, downloadTraffic: 0, uploadSpeed: 0, downloadSpeed: 0 });

    const busiestNode = nodesWithInfo.reduce<DashboardNode | null>((current, node) => {
      const currentScore = (current?.systemInfo?.uploadSpeed || 0) + (current?.systemInfo?.downloadSpeed || 0);
      const nextScore = (node.systemInfo?.uploadSpeed || 0) + (node.systemInfo?.downloadSpeed || 0);
      return nextScore > currentScore ? node : current;
    }, null);

    return {
      total: nodes.length,
      online: onlineNodes.length,
      withRealtime: nodesWithInfo.length,
      busiestNode,
      ...totals,
    };
  }, [nodes]);

  const healthRate = diagnosisSummary?.healthRate ?? 100;
  const healthTone = getHealthTone(healthRate);
  const trafficScopeLabel = isAdmin ? '全站计费流量' : '当前账号计费流量';

  const forwardLeaders = useMemo(
    () => [...forwardList].sort((a, b) => calculateForwardBillingFlow(b) - calculateForwardBillingFlow(a)).slice(0, 5),
    [forwardList],
  );

  const expiringTunnels = useMemo(() => {
    return [...userTunnels]
      .filter((item) => item.expTime)
      .sort((a, b) => new Date(a.expTime || '').getTime() - new Date(b.expTime || '').getTime())
      .slice(0, 4);
  }, [userTunnels]);

  const metricCards = useMemo(() => {
    if (isAdmin) {
      return [
        {
          label: '24H 全站流量',
          value: formatFlow(totalFlow24h),
          subtitle: `${activeFlowHours} / 24 个整点出现流量`,
          tone: 'primary' as const,
        },
        {
          label: '纳入诊断资源',
          value: `${diagnosisSummary?.totalCount ?? 0}`,
          subtitle: `${diagnosisSummary?.successCount ?? 0} 个正常，${diagnosisSummary?.failCount ?? 0} 个异常`,
          tone: (diagnosisSummary?.failCount || 0) > 0 ? 'warning' as const : 'success' as const,
        },
        {
          label: '当前健康率',
          value: `${healthRate.toFixed(1)}%`,
          subtitle: diagnosisSummary?.avgLatency ? `平均延迟 ${diagnosisSummary.avgLatency.toFixed(1)} ms` : '平均延迟暂不可用',
          tone: healthRate >= 85 ? 'success' as const : healthRate >= 70 ? 'warning' as const : 'danger' as const,
        },
        {
          label: '最近一次诊断',
          value: diagnosisSummary?.lastRunTime ? formatRelativeTime(diagnosisSummary.lastRunTime) : '未执行',
          subtitle: diagnosisSummary?.lastRunTime ? formatDateTime(diagnosisSummary.lastRunTime) : '请检查自动诊断配置',
          tone: 'default' as const,
        },
      ];
    }

    return [
      {
        label: '流量配额',
        value: formatFlow(userInfo.flow, 'gb'),
        subtitle: `本月重置：${formatResetTime(userInfo.flowResetTime)}`,
        tone: 'primary' as const,
      },
      {
        label: '已用流量',
        value: formatFlow(calculateUserTotalUsedFlow()),
        subtitle: userInfo.flow === 99999 ? '当前套餐流量不限' : `${calculateUsagePercentage('flow').toFixed(1)}% 已使用`,
        tone: calculateUsagePercentage('flow') >= 85 ? 'warning' as const : 'success' as const,
        progress: userInfo.flow === 99999 ? 100 : calculateUsagePercentage('flow'),
      },
      {
        label: '转发配额',
        value: formatNumber(userInfo.num || 0),
        subtitle: `${userTunnels.length} 条可用隧道，${forwardList.length} 条转发正在管理`,
        tone: 'primary' as const,
      },
      {
        label: '健康快照',
        value: `${healthRate.toFixed(1)}%`,
        subtitle: diagnosisSummary?.failCount ? `${diagnosisSummary.failCount} 条异常待处理` : '当前未检测到异常',
        tone: healthRate >= 85 ? 'success' as const : 'warning' as const,
      },
    ];
  }, [
    isAdmin,
    totalFlow24h,
    activeFlowHours,
    diagnosisSummary,
    healthRate,
    userInfo,
    userTunnels.length,
    forwardList.length,
  ]);

  if (loading) {
    return (
      <div className="px-3 lg:px-6 py-4">
        <div className="flex h-64 items-center justify-center">
          <div className="flex items-center gap-3 text-default-500">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-default-200 border-t-default-500" />
            <span>正在加载仪表盘...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 px-3 py-3 lg:px-6 lg:py-5">
      <Card className="overflow-hidden border border-default-200 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.14),transparent_32%),radial-gradient(circle_at_top_right,rgba(37,99,235,0.14),transparent_28%),linear-gradient(180deg,rgba(255,255,255,0.98),rgba(247,250,252,0.98))] shadow-sm dark:bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.18),transparent_32%),radial-gradient(circle_at_top_right,rgba(37,99,235,0.18),transparent_28%),linear-gradient(180deg,rgba(9,9,11,0.96),rgba(15,23,42,0.95))]">
        <CardBody className="gap-6 p-5 lg:p-6">
          <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
            <div className="max-w-3xl">
              <div className="flex flex-wrap items-center gap-2">
                <Chip size="sm" variant="flat" color="primary">{getEnvironmentLabel()}</Chip>
                <Chip size="sm" variant="flat" color={healthRate >= 85 ? 'success' : healthRate >= 70 ? 'warning' : 'danger'}>
                  诊断 {healthTone.label}
                </Chip>
                <Chip size="sm" variant="flat" color="default">{siteConfig.release_version} · {siteConfig.commit_sha}</Chip>
              </div>
              <h1 className="mt-4 text-2xl font-semibold tracking-tight text-foreground lg:text-3xl">仪表盘</h1>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-default-600">
                这里汇总 {trafficScopeLabel} 的 24 小时采样、节点实时出口态势、自动诊断健康脉冲、异常焦点和资源使用情况。目标不是堆指标，而是先回答三个问题：流量是否真实在波动、异常是否集中、下一步该去哪里处理。
              </p>
              <div className="mt-5 flex flex-wrap gap-3">
                <Button as={Link} to="/monitor" color="primary">进入诊断看板</Button>
                <Button as={Link} to="/forward" variant="flat" color="primary">查看转发管理</Button>
                <Button as={Link} to={isAdmin ? '/node' : '/tunnel'} variant="light">
                  {isAdmin ? '查看节点监控' : '查看隧道资源'}
                </Button>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:w-[420px]">
              <div className="rounded-3xl border border-white/60 bg-white/80 p-4 shadow-sm dark:border-white/10 dark:bg-white/5">
                <p className="text-xs uppercase tracking-[0.2em] text-default-400">最新诊断</p>
                <p className="mt-3 text-lg font-semibold text-foreground">{diagnosisSummary?.lastRunTime ? formatRelativeTime(diagnosisSummary.lastRunTime) : '暂未执行'}</p>
                <p className="mt-1 text-xs text-default-500">{diagnosisSummary?.lastRunTime ? formatDateTime(diagnosisSummary.lastRunTime) : '自动诊断开启后会在这里显示'}</p>
              </div>
              <div className="rounded-3xl border border-white/60 bg-white/80 p-4 shadow-sm dark:border-white/10 dark:bg-white/5">
                <p className="text-xs uppercase tracking-[0.2em] text-default-400">24H 峰值</p>
                <p className="mt-3 text-lg font-semibold text-foreground">{peakFlowPoint ? peakFlowPoint.time : '--'}</p>
                <p className="mt-1 text-xs text-default-500">{peakFlowPoint ? peakFlowPoint.formattedFlow : '当前周期暂无流量高峰'}</p>
              </div>
              <div className="rounded-3xl border border-white/60 bg-white/80 p-4 shadow-sm dark:border-white/10 dark:bg-white/5 sm:col-span-2">
                <p className="text-xs uppercase tracking-[0.2em] text-default-400">本时段态势判断</p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="text-lg font-semibold text-foreground">{trafficMomentum.label}</span>
                  <Chip size="sm" variant="flat" color={trafficMomentum.tone}>{trafficScopeLabel}</Chip>
                </div>
                <p className="mt-1 text-xs text-default-500">如果这里持续出现异常波动，先看流量峰值，再跳到诊断看板看失败资源。</p>
              </div>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {metricCards.map((item) => (
              <OverviewMetric key={item.label} {...item} />
            ))}
          </div>
        </CardBody>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.8fr)_minmax(320px,0.95fr)]">
        <Card className="border border-default-200 shadow-sm">
          <CardHeader className="flex items-center justify-between gap-4 pb-0">
            <div>
              <p className="text-sm font-semibold text-foreground">24 小时 {trafficScopeLabel} 采样</p>
              <p className="text-xs text-default-500">这里是账户级整点计费流量；节点出口实时带宽会单独展示，避免把两类口径混成一张假图。</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Chip size="sm" variant="flat" color="primary">24H 累计 {formatFlow(totalFlow24h)}</Chip>
              <Chip size="sm" variant="flat" color={hasTrafficData ? 'success' : 'default'}>
                {hasTrafficData ? `活跃 ${activeFlowHours} / 24 个时段` : '本周期暂无流量'}
              </Chip>
              {isAdmin && (
                <Chip size="sm" variant="flat" color={liveNodeSummary.online > 0 ? 'secondary' : 'default'}>
                  在线节点 {liveNodeSummary.online}/{liveNodeSummary.total}
                </Chip>
              )}
            </div>
          </CardHeader>
          <CardBody className="space-y-4 pt-5">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
              <div className="rounded-2xl border border-default-200 bg-default-50/70 px-4 py-3">
                <p className="text-xs text-default-400">小时均值</p>
                <p className="mt-2 text-lg font-semibold text-foreground">{formatFlow(averageFlow24h)}</p>
              </div>
              <div className="rounded-2xl border border-default-200 bg-default-50/70 px-4 py-3">
                <p className="text-xs text-default-400">当前小时</p>
                <p className="mt-2 text-lg font-semibold text-foreground">{formatFlow(latestFlowPoint?.flow || 0)}</p>
              </div>
              <div className="rounded-2xl border border-default-200 bg-default-50/70 px-4 py-3">
                <p className="text-xs text-default-400">峰值时段</p>
                <p className="mt-2 text-lg font-semibold text-foreground">{peakFlowPoint?.time || '--'}</p>
              </div>
              {isAdmin && (
                <div className="rounded-2xl border border-default-200 bg-default-50/70 px-4 py-3">
                  <p className="text-xs text-default-400">实时上行</p>
                  <p className="mt-2 text-lg font-semibold text-foreground">{formatSpeed(liveNodeSummary.uploadSpeed)}</p>
                </div>
              )}
              {isAdmin && (
                <div className="rounded-2xl border border-default-200 bg-default-50/70 px-4 py-3">
                  <p className="text-xs text-default-400">实时下行</p>
                  <p className="mt-2 text-lg font-semibold text-foreground">{formatSpeed(liveNodeSummary.downloadSpeed)}</p>
                </div>
              )}
              <div className="rounded-2xl border border-default-200 bg-default-50/70 px-4 py-3 sm:col-span-2 xl:col-span-1">
                <p className="text-xs text-default-400">策略建议</p>
                <p className="mt-2 text-sm font-semibold text-foreground">{hasTrafficData ? '对照峰值时段排查异常资源' : '等待小时采样或检查流量统计任务'}</p>
              </div>
            </div>

            <div className="rounded-[28px] border border-default-200 bg-[linear-gradient(180deg,rgba(15,118,110,0.08),rgba(255,255,255,0.95))] p-4 dark:bg-[linear-gradient(180deg,rgba(15,118,110,0.14),rgba(9,9,11,0.92))]">
              {trafficChartData.length === 0 || !hasTrafficData ? (
                <div className="flex h-80 flex-col items-center justify-center text-center">
                  <div className="rounded-full bg-default-100 p-4 dark:bg-default-100/20">
                    <svg className="h-10 w-10 text-default-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 3v18h18M7 14l3-3 4 4 5-7" />
                    </svg>
                  </div>
                  <p className="mt-4 text-lg font-medium text-foreground">最近 24 小时暂未采样到有效流量</p>
                  <p className="mt-2 max-w-md text-sm text-default-500">如果这里长期为空，需要确认流量统计定时任务是否正常写入数据，而不是继续盯前端样式。</p>
                </div>
              ) : (
                <div className="h-80 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={trafficChartData} margin={{ top: 12, right: 12, left: -18, bottom: 0 }}>
                      <defs>
                        <linearGradient id="trafficFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#14b8a6" stopOpacity={0.32} />
                          <stop offset="95%" stopColor="#14b8a6" stopOpacity={0.04} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} className="opacity-20" />
                      <XAxis dataKey="time" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} minTickGap={18} />
                      <YAxis tickFormatter={formatFlowAxis} tick={{ fontSize: 12 }} tickLine={false} axisLine={false} width={64} />
                      <Tooltip
                        content={({ active, payload, label }) => {
                          if (!active || !payload?.length) return null;
                          const flow = Number(payload.find((item) => item.dataKey === 'flow')?.value || 0);
                          const avg = Number(payload.find((item) => item.dataKey === 'movingAverage')?.value || 0);
                          return (
                            <div className="rounded-2xl border border-default-200 bg-white/95 p-3 shadow-lg dark:bg-default-100/95">
                              <p className="text-sm font-semibold text-foreground">{label}</p>
                              <p className="mt-2 text-xs text-default-500">整点流量增量</p>
                              <p className="text-base font-bold text-teal-600 dark:text-teal-300">{formatFlow(flow)}</p>
                              <p className="mt-2 text-xs text-default-500">短周期均值</p>
                              <p className="text-sm font-semibold text-foreground">{formatFlow(avg)}</p>
                            </div>
                          );
                        }}
                      />
                      <Bar dataKey="flow" barSize={18} radius={[8, 8, 0, 0]} fill="#99f6e4" />
                      <Area type="monotone" dataKey="flow" stroke="none" fill="url(#trafficFill)" />
                      <Line type="monotone" dataKey="flow" stroke="#0f766e" strokeWidth={3} dot={false} activeDot={{ r: 4, strokeWidth: 2, fill: '#fff' }} />
                      <Line type="monotone" dataKey="movingAverage" stroke="#2563eb" strokeWidth={2} dot={false} strokeDasharray="5 5" />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            <div className="grid gap-3 xl:grid-cols-2">
              <div className="rounded-2xl border border-default-200 bg-default-50/70 px-4 py-3">
                <p className="text-xs uppercase tracking-[0.18em] text-default-400">数据口径</p>
                <p className="mt-2 text-sm leading-6 text-default-600">
                  当前 24H 图表来自 `statistics_flow` 的整点快照，反映账号维度的计费流量增量。系统会累计保存每条隧道和转发的总流量，但还没有为它们持久化“逐小时历史”，所以现在不能可靠画出每条隧道/转发的 24H 细分曲线。
                </p>
              </div>
              <div className="rounded-2xl border border-default-200 bg-default-50/70 px-4 py-3">
                <p className="text-xs uppercase tracking-[0.18em] text-default-400">节点实时出口</p>
                {isAdmin ? (
                  <>
                    <p className="mt-2 text-sm leading-6 text-default-600">
                      在线 {liveNodeSummary.online}/{liveNodeSummary.total} 个节点，当前总上行 {formatSpeed(liveNodeSummary.uploadSpeed)}，总下行 {formatSpeed(liveNodeSummary.downloadSpeed)}。
                    </p>
                    <p className="mt-2 text-xs text-default-500">
                      {liveNodeSummary.busiestNode
                        ? `当前最忙节点：${liveNodeSummary.busiestNode.name} · ${(liveNodeSummary.busiestNode.systemInfo?.uploadSpeed || 0) + (liveNodeSummary.busiestNode.systemInfo?.downloadSpeed || 0) > 0
                          ? `${formatSpeed((liveNodeSummary.busiestNode.systemInfo?.uploadSpeed || 0) + (liveNodeSummary.busiestNode.systemInfo?.downloadSpeed || 0))} 总吞吐`
                          : '等待实时数据'}`
                        : '节点实时带宽来自 WebSocket 上报，适合判断 VPS 出口瞬时负载。'}
                    </p>
                  </>
                ) : (
                  <p className="mt-2 text-sm leading-6 text-default-600">当前账号仪表盘不显示全站节点出口，如需核对节点带宽，请让管理员在节点监控页面查看。</p>
                )}
              </div>
            </div>
          </CardBody>
        </Card>

        <Card className="border border-default-200 shadow-sm">
          <CardHeader className="pb-0">
            <div>
              <p className="text-sm font-semibold text-foreground">自动诊断脉冲</p>
              <p className="text-xs text-default-500">用最近 24 小时的诊断曲线确认异常是否集中、是否重复出现。</p>
            </div>
          </CardHeader>
          <CardBody className="space-y-5 pt-5">
            <div className="flex flex-col items-center gap-4 rounded-[28px] border border-default-200 bg-default-50/80 p-5 text-center">
              <div
                className="grid h-36 w-36 place-items-center rounded-full"
                style={{
                  background: `conic-gradient(${healthTone.color} ${Math.max(0, Math.min(healthRate, 100)) * 3.6}deg, rgba(148,163,184,0.18) 0deg)`,
                }}
              >
                <div className="grid h-28 w-28 place-items-center rounded-full bg-white dark:bg-black">
                  <div>
                    <p className="text-3xl font-semibold text-foreground">{healthRate.toFixed(1)}%</p>
                    <p className="text-xs uppercase tracking-[0.2em] text-default-400">健康率</p>
                  </div>
                </div>
              </div>
              <div>
                <p className="text-lg font-semibold text-foreground">{healthTone.label} 状态</p>
                <p className="mt-1 text-xs text-default-500">
                  最近一次诊断：{diagnosisSummary?.lastRunTime ? formatDateTime(diagnosisSummary.lastRunTime) : '暂未执行'}
                </p>
              </div>
              <div className="grid w-full grid-cols-3 gap-3 text-left">
                <div className="rounded-2xl border border-default-200 bg-white/80 px-3 py-3 dark:bg-black/20">
                  <p className="text-xs text-default-400">正常</p>
                  <p className="mt-1 text-lg font-semibold text-foreground">{diagnosisSummary?.successCount ?? 0}</p>
                </div>
                <div className="rounded-2xl border border-default-200 bg-white/80 px-3 py-3 dark:bg-black/20">
                  <p className="text-xs text-default-400">异常</p>
                  <p className="mt-1 text-lg font-semibold text-danger">{diagnosisSummary?.failCount ?? 0}</p>
                </div>
                <div className="rounded-2xl border border-default-200 bg-white/80 px-3 py-3 dark:bg-black/20">
                  <p className="text-xs text-default-400">延迟</p>
                  <p className="mt-1 text-lg font-semibold text-foreground">{diagnosisSummary?.avgLatency ? `${diagnosisSummary.avgLatency.toFixed(0)} ms` : '--'}</p>
                </div>
              </div>
            </div>

            <div className="rounded-[24px] border border-default-200 bg-[linear-gradient(180deg,rgba(37,99,235,0.08),rgba(255,255,255,0.96))] p-4 dark:bg-[linear-gradient(180deg,rgba(37,99,235,0.14),rgba(9,9,11,0.94))]">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-foreground">24H 诊断趋势</p>
                  <p className="text-xs text-default-500">柱状图聚焦失败资源，折线直接给健康率，避免“总量高但其实没出事”的误读。</p>
                </div>
                <Button as={Link} to="/monitor" size="sm" variant="flat" color="primary">查看明细</Button>
              </div>
              {diagnosisHotspots.length > 0 && (
                <div className="mb-3 flex flex-wrap gap-2">
                  {diagnosisHotspots.map((item) => (
                    <Chip key={`${item.hour}-${item.time}`} size="sm" variant="flat" color={item.fail > 0 ? 'danger' : 'warning'}>
                      {item.hour} · {item.fail > 0 ? `${item.fail} 个异常` : `${Math.round(item.avgLatency || 0)}ms`}
                    </Chip>
                  ))}
                </div>
              )}
              {diagnosisTrend.length === 0 ? (
                <div className="py-8 text-center text-sm text-default-500">暂无诊断趋势数据</div>
              ) : (
                <div className="h-48 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={diagnosisTrendData} margin={{ top: 10, right: 18, left: -18, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} className="opacity-20" />
                      <XAxis dataKey="hour" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={20} />
                      <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={44} />
                      <YAxis yAxisId="rate" orientation="right" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={36} domain={[0, 100]} tickFormatter={(value) => `${value}%`} />
                      <Tooltip
                        content={({ active, payload, label }) => {
                          if (!active || !payload?.length) return null;
                          const fail = Number(payload.find((item) => item.dataKey === 'fail')?.value || 0);
                          const total = Number(payload.find((item) => item.dataKey === 'total')?.value || 0);
                          const rate = Number(payload.find((item) => item.dataKey === 'healthRate')?.value || 0);
                          const latency = Number(payload.find((item) => item.dataKey === 'avgLatency')?.value || 0);
                          return (
                            <div className="rounded-2xl border border-default-200 bg-white/95 p-3 shadow-lg dark:bg-default-100/95">
                              <p className="text-sm font-semibold text-foreground">{label}</p>
                              <p className="mt-2 text-xs text-default-500">失败资源</p>
                              <p className="text-base font-bold text-danger">{fail}</p>
                              <p className="mt-2 text-xs text-default-500">健康率 / 总诊断数</p>
                              <p className="text-sm font-semibold text-foreground">{rate ? `${rate.toFixed(1)}%` : '--'} · {total}</p>
                              <p className="mt-2 text-xs text-default-500">平均延时</p>
                              <p className="text-sm font-semibold text-foreground">{latency ? `${latency.toFixed(1)} ms` : '--'}</p>
                            </div>
                          );
                        }}
                      />
                      <Bar dataKey="fail" fill="#fca5a5" radius={[6, 6, 0, 0]} barSize={14} />
                      <Line yAxisId="rate" dataKey="healthRate" stroke="#2563eb" strokeWidth={2.5} dot={false} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </CardBody>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,1fr)]">
        <Card className="border border-default-200 shadow-sm">
          <CardHeader className="flex items-center justify-between gap-4 pb-0">
            <div>
              <p className="text-sm font-semibold text-foreground">异常焦点</p>
              <p className="text-xs text-default-500">只展示最近需要你做判断的异常资源，避免把整页变成流水账。</p>
            </div>
            <Button as={Link} to="/monitor" size="sm" variant="flat" color="primary">查看全部</Button>
          </CardHeader>
          <CardBody className="space-y-3 pt-5">
            {diagnosisSummary?.recentFailures?.length ? diagnosisSummary.recentFailures.map((record) => (
              <div key={record.id} className="rounded-3xl border border-danger-200 bg-danger-50/60 p-4 shadow-sm transition-colors hover:bg-danger-50 dark:border-danger-800/40 dark:bg-danger-900/10 dark:hover:bg-danger-900/20">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Chip size="sm" variant="flat" color="danger">{record.targetType === 'tunnel' ? '隧道异常' : '转发异常'}</Chip>
                      <span className="text-sm font-semibold text-foreground">{record.targetName}</span>
                    </div>
                    <p className="mt-2 text-xs text-default-500">
                      发生于 {formatDateTime(record.createdTime)} · 最近更新时间 {formatRelativeTime(record.createdTime)}
                    </p>
                  </div>
                  <div className="grid min-w-[190px] grid-cols-2 gap-3 lg:max-w-[220px]">
                    <div className="rounded-2xl border border-danger-200 bg-white/80 px-3 py-3 text-left dark:bg-black/20">
                      <p className="text-xs text-default-400">延迟</p>
                      <p className="mt-1 text-sm font-semibold text-foreground">{record.averageTime ? `${record.averageTime} ms` : '--'}</p>
                    </div>
                    <div className="rounded-2xl border border-danger-200 bg-white/80 px-3 py-3 text-left dark:bg-black/20">
                      <p className="text-xs text-default-400">丢包</p>
                      <p className="mt-1 text-sm font-semibold text-foreground">{record.packetLoss !== undefined && record.packetLoss !== null ? `${record.packetLoss}%` : '--'}</p>
                    </div>
                  </div>
                </div>
              </div>
            )) : (
              <div className="flex min-h-[220px] flex-col items-center justify-center rounded-[28px] border border-dashed border-success-300 bg-success-50/50 text-center dark:border-success-800/50 dark:bg-success-900/10">
                <div className="rounded-full bg-success-100 p-4 text-success dark:bg-success-900/20">
                  <svg className="h-10 w-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <p className="mt-4 text-lg font-medium text-foreground">当前没有待处理异常</p>
                <p className="mt-2 text-sm text-default-500">如果你要确认历史故障是否真的消失，直接去诊断看板看趋势和链路细节。</p>
              </div>
            )}
          </CardBody>
        </Card>

        <Card className="border border-default-200 shadow-sm">
          <CardHeader className="flex items-center justify-between gap-4 pb-0">
            <div>
              <p className="text-sm font-semibold text-foreground">活跃转发焦点</p>
              <p className="text-xs text-default-500">按当前账单流量排序，方便优先关注最重要的几个业务入口。</p>
            </div>
            {forwardList.length > 5 && (
              <Button as={Link} to="/forward" size="sm" variant="flat" color="primary">查看全部 {forwardList.length} 个</Button>
            )}
          </CardHeader>
          <CardBody className="space-y-3 pt-5">
            {forwardLeaders.length === 0 ? (
              <div className="py-14 text-center text-sm text-default-500">当前没有转发数据</div>
            ) : forwardLeaders.map((item, index) => {
              const flow = calculateForwardBillingFlow(item);
              const ratio = peakFlowPoint?.flow ? Math.min((flow / peakFlowPoint.flow) * 100, 100) : 0;
              return (
                <div key={item.id} className="rounded-3xl border border-default-200 bg-white/80 p-4 shadow-sm dark:bg-black/20">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-3">
                      <div className={`grid h-8 w-8 place-items-center rounded-2xl text-xs font-semibold ${index === 0 ? 'bg-amber-100 text-amber-700' : index === 1 ? 'bg-slate-200 text-slate-700' : index === 2 ? 'bg-orange-100 text-orange-700' : 'bg-default-100 text-default-600'}`}>
                        {index + 1}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-foreground">{item.name}</p>
                        <p className="mt-1 text-xs text-default-500">{item.tunnelName} · {item.status === 1 ? '运行中' : '已停用'}</p>
                      </div>
                    </div>
                    <Chip size="sm" variant="flat" color={item.status === 1 ? 'success' : 'default'}>
                      {item.status === 1 ? '在线' : '停用'}
                    </Chip>
                  </div>
                  <div className="mt-4">
                    <div className="mb-2 flex items-center justify-between gap-3 text-xs text-default-500">
                      <span>账单流量</span>
                      <span className="font-semibold text-foreground">{formatFlow(flow)}</span>
                    </div>
                    <Progress aria-label={item.name} size="sm" value={ratio} color={ratio >= 80 ? 'warning' : 'primary'} classNames={{ track: 'bg-default-100' }} />
                  </div>
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <button
                      className="rounded-full border border-default-200 bg-default-50 px-3 py-1 text-xs text-default-600 transition-colors hover:bg-default-100"
                      onClick={() => hasMultipleRemoteAddresses(item.remoteAddr) ? showRemoteAddressModal(item.remoteAddr, '公网出口') : copyToClipboard(formatRemoteAddress(item.remoteAddr))}
                      title={formatRemoteAddress(item.remoteAddr)}
                    >
                      {formatRemoteAddress(item.remoteAddr) || '无出口地址'}
                    </button>
                    <Button as={Link} to="/forward" size="sm" variant="light">去转发管理</Button>
                  </div>
                </div>
              );
            })}
          </CardBody>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(360px,1fr)]">
        {!isAdmin ? (
          <Card className="border border-default-200 shadow-sm">
            <CardHeader className="pb-0">
              <div>
                <p className="text-sm font-semibold text-foreground">资源配额与到期快照</p>
                <p className="text-xs text-default-500">把最需要关注的套餐占用和即将到期资源放在一起，减少来回切页。</p>
              </div>
            </CardHeader>
            <CardBody className="space-y-4 pt-5">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-3xl border border-default-200 bg-default-50/70 p-4">
                  <p className="text-xs text-default-400">流量使用率</p>
                  <p className="mt-2 text-2xl font-semibold text-foreground">{userInfo.flow === 99999 ? '∞' : `${calculateUsagePercentage('flow').toFixed(1)}%`}</p>
                  <p className="mt-1 text-xs text-default-500">{formatFlow(calculateUserTotalUsedFlow())} / {formatFlow(userInfo.flow, 'gb')}</p>
                </div>
                <div className="rounded-3xl border border-default-200 bg-default-50/70 p-4">
                  <p className="text-xs text-default-400">转发使用率</p>
                  <p className="mt-2 text-2xl font-semibold text-foreground">{userInfo.num === 99999 ? '∞' : `${calculateUsagePercentage('forwards').toFixed(1)}%`}</p>
                  <p className="mt-1 text-xs text-default-500">{forwardList.length} / {formatNumber(userInfo.num || 0)}</p>
                </div>
              </div>

              <div className="space-y-3">
                {expiringTunnels.length > 0 ? expiringTunnels.map((tunnel) => {
                  const exp = getExpStatus(tunnel.expTime);
                  return (
                    <div key={tunnel.id} className="rounded-3xl border border-default-200 bg-white/80 p-4 shadow-sm dark:bg-black/20">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-foreground">{tunnel.tunnelName}</p>
                          <p className="mt-1 text-xs text-default-500">{formatFlow(calculateTunnelUsedFlow(tunnel))} 已用 · {getTunnelUsedForwards(tunnel.tunnelId)} 条转发</p>
                        </div>
                        <Chip size="sm" variant="flat" color={exp.tone}>{exp.label}</Chip>
                      </div>
                    </div>
                  );
                }) : (
                  <div className="rounded-3xl border border-dashed border-default-300 bg-default-50/60 p-5 text-sm text-default-500">
                    当前没有即将到期的隧道资源。
                  </div>
                )}
              </div>
            </CardBody>
          </Card>
        ) : (
          <Card className="border border-default-200 shadow-sm">
            <CardHeader className="pb-0">
              <div>
                <p className="text-sm font-semibold text-foreground">运维建议</p>
                <p className="text-xs text-default-500">结合流量、健康率和异常数给出下一步操作建议。</p>
              </div>
            </CardHeader>
            <CardBody className="space-y-3 pt-5">
              <div className="rounded-3xl border border-default-200 bg-default-50/70 p-4">
                <p className="text-sm font-semibold text-foreground">当前判断</p>
                <p className="mt-2 text-sm leading-7 text-default-600">
                  {(diagnosisSummary?.failCount || 0) > 0
                    ? '先进入诊断看板，按异常资源优先级处理；如果同一时段流量又有明显上升，优先检查峰值时段对应的高流量转发。'
                    : hasTrafficData
                      ? '当前没有明显异常，建议关注峰值时段资源是否有过载迹象，同时核对自动诊断间隔是否符合值班要求。'
                      : '流量与诊断都偏安静，建议确认流量统计任务和自动诊断任务是否持续写入。'}
                </p>
              </div>
              <div className="rounded-3xl border border-default-200 bg-white/80 p-4 shadow-sm dark:bg-black/20">
                <p className="text-xs text-default-400">异常资源占比</p>
                <p className="mt-2 text-2xl font-semibold text-foreground">
                  {diagnosisSummary?.totalCount ? `${(((diagnosisSummary.failCount || 0) / diagnosisSummary.totalCount) * 100).toFixed(1)}%` : '0%'}
                </p>
                <p className="mt-1 text-xs text-default-500">如果这个比例持续抬升，就不该只看单点告警，要检查整体链路。</p>
              </div>
              <div className="rounded-3xl border border-default-200 bg-white/80 p-4 shadow-sm dark:bg-black/20">
                <p className="text-xs text-default-400">部署环境</p>
                <p className="mt-2 text-lg font-semibold text-foreground">{getEnvironmentLabel()}</p>
                <p className="mt-1 text-xs text-default-500">{siteConfig.release_version} · {siteConfig.build_revision}</p>
              </div>
            </CardBody>
          </Card>
        )}

        <Card className="border border-default-200 shadow-sm">
          <CardHeader className="pb-0">
            <div>
              <p className="text-sm font-semibold text-foreground">系统脉络</p>
              <p className="text-xs text-default-500">把版本、环境、调度与告警入口放在同一块，值班时不用再到处找线索。</p>
            </div>
          </CardHeader>
          <CardBody className="space-y-4 pt-5">
            <div className="rounded-3xl border border-default-200 bg-white/80 p-4 shadow-sm dark:bg-black/20">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-default-400">Release</p>
                  <p className="mt-2 text-lg font-semibold text-foreground">{siteConfig.release_version}</p>
                </div>
                <Chip size="sm" variant="flat" color="primary">{getEnvironmentLabel()}</Chip>
              </div>
              <p className="mt-3 text-xs text-default-500">构建标识：{siteConfig.build_revision}</p>
              <p className="text-xs text-default-500">构建时间：{siteConfig.build_time}</p>
            </div>

            <div className="rounded-3xl border border-default-200 bg-white/80 p-4 shadow-sm dark:bg-black/20">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-default-400">诊断入口</p>
                  <p className="mt-2 text-sm font-semibold text-foreground">异常排查首选诊断看板</p>
                </div>
                <Button as={Link} to="/monitor" size="sm" variant="flat" color="primary">打开</Button>
              </div>
              <p className="mt-3 text-xs leading-6 text-default-500">当企业微信收到告警时，第一步不是去翻群消息，而是回到诊断看板确认失败链路和最近 24 小时趋势。</p>
            </div>

            <div className="rounded-3xl border border-default-200 bg-white/80 p-4 shadow-sm dark:bg-black/20">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-default-400">配置入口</p>
                  <p className="mt-2 text-sm font-semibold text-foreground">环境名、Webhook 模板、冷静期都在网站配置</p>
                </div>
                <Button as={Link} to={isAdmin ? '/config' : '/profile'} size="sm" variant="flat" color="primary">
                  {isAdmin ? '前往配置' : '打开个人中心'}
                </Button>
              </div>
              <p className="mt-3 text-xs leading-6 text-default-500">现在企业微信标题会带环境名，模板和节流间隔都可配置，避免“这条告警到底来自哪个环境”这种低级混乱。</p>
            </div>
          </CardBody>
        </Card>
      </div>

      <Modal isOpen={addressModalOpen} onClose={() => setAddressModalOpen(false)} size="2xl" scrollBehavior="outside" backdrop="blur" placement="center">
        <ModalContent>
          <ModalHeader className="text-base">{addressModalTitle}</ModalHeader>
          <ModalBody className="pb-6">
            <div className="mb-4 text-right">
              <Button size="sm" onClick={copyAllAddresses}>复制全部</Button>
            </div>
            <div className="max-h-60 space-y-2 overflow-y-auto">
              {addressList.map((item) => (
                <div key={item.id} className="flex items-center justify-between rounded-lg border border-default-200 p-3">
                  <code className="mr-3 flex-1 text-sm text-foreground">{item.address}</code>
                  <Button size="sm" variant="light" isLoading={item.copying} onClick={() => copyAddress(item)}>
                    复制
                  </Button>
                </div>
              ))}
            </div>
          </ModalBody>
        </ModalContent>
      </Modal>
    </div>
  );
}
