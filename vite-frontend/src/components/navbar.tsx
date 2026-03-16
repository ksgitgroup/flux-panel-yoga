import { useState, useEffect, useCallback, useRef } from "react";
import { Link } from "@heroui/link";
import {
  Navbar as HeroUINavbar,
  NavbarBrand,
  NavbarContent,
} from "@heroui/navbar";
import { Badge } from "@heroui/badge";
import { Chip } from "@heroui/chip";
import { Button } from "@heroui/button";
import { Spinner } from "@heroui/spinner";
import { isWebViewFunc } from '@/utils/panel';
import { useNavigate } from "react-router-dom";
import toast from 'react-hot-toast';

import { Logo } from "@/components/icons";
import { siteConfig, getCachedConfig } from "@/config/site";
import { getUnreadCount, getNotifications, markNotificationRead, markAllNotificationsRead, NotificationItem } from "@/api";

const SEVERITY_COLORS: Record<string, string> = {
  critical: "bg-red-500",
  warning: "bg-amber-500",
  info: "bg-blue-500",
};

const SEVERITY_LABELS: Record<string, string> = {
  critical: "紧急",
  warning: "警告",
  info: "信息",
};

const TYPE_LABELS: Record<string, string> = {
  alert: "告警",
  alert_recovery: "恢复",
  daily_summary: "日报",
  expiry_reminder: "到期",
  system: "系统",
  probe_offline: "离线",
  diagnosis: "诊断",
  traffic: "流量",
};

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return "刚刚";
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}分钟前`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}小时前`;
  return `${Math.floor(diff / 86400_000)}天前`;
}

export const Navbar = () => {
  const navigate = useNavigate();
  const [appName, setAppName] = useState(siteConfig.name);
  const [isWebView, setIsWebView] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [criticalCount, setCriticalCount] = useState(0);
  const [panelOpen, setPanelOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [notifLoading, setNotifLoading] = useState(false);
  const [filterType, setFilterType] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const prevCriticalRef = useRef(0);

  useEffect(() => {
    setIsWebView(isWebViewFunc());
  }, []);

  useEffect(() => {
    const checkForUpdates = async () => {
      try {
        const cachedAppName = await getCachedConfig('app_name');
        if (cachedAppName && cachedAppName !== appName) {
          setAppName(cachedAppName);
          siteConfig.name = cachedAppName;
        }
      } catch (error) {
        console.warn('检查配置更新失败:', error);
      }
    };
    const timer = setTimeout(checkForUpdates, 100);
    const handleConfigUpdate = async () => {
      try {
        const cachedAppName = await getCachedConfig('app_name');
        if (cachedAppName) {
          setAppName(cachedAppName);
          siteConfig.name = cachedAppName;
        }
      } catch (error) {
        console.warn('更新配置失败:', error);
      }
    };
    window.addEventListener('configUpdated', handleConfigUpdate);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('configUpdated', handleConfigUpdate);
    };
  }, [appName]);

  // Poll unread count every 30s, with critical alert toast
  const fetchUnread = useCallback(async () => {
    try {
      const token = localStorage.getItem("token");
      if (!token) return;
      const res = await getUnreadCount();
      if (res.code === 0 && res.data) {
        const data = res.data as any;
        const newCount = data.count || 0;
        const newCritical = data.critical || 0;
        setUnreadCount(newCount);
        setCriticalCount(newCritical);

        // Pop toast when new critical alerts arrive
        if (newCritical > prevCriticalRef.current && prevCriticalRef.current >= 0) {
          const diff = newCritical - prevCriticalRef.current;
          toast.error(
            `${diff} 条紧急告警需要处理`,
            { duration: 8000, icon: '\u{1F6A8}', style: { fontWeight: 600 } }
          );
        }
        prevCriticalRef.current = newCritical;
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    fetchUnread();
    const interval = setInterval(fetchUnread, 30_000);
    return () => clearInterval(interval);
  }, [fetchUnread]);

  // Fetch recent notifications when panel opens or filter changes
  const fetchNotifications = useCallback(async () => {
    setNotifLoading(true);
    try {
      const res = await getNotifications({ page: 1, size: 12, type: filterType || undefined });
      if (res.code === 0 && res.data) {
        const records = (res.data as any).records || [];
        // Sort: critical first, then warning, then by time
        records.sort((a: NotificationItem, b: NotificationItem) => {
          const order: Record<string, number> = { critical: 0, warning: 1, info: 2 };
          const sa = order[a.severity] ?? 2;
          const sb = order[b.severity] ?? 2;
          if (sa !== sb) return sa - sb;
          return b.createdTime - a.createdTime;
        });
        setNotifications(records);
      }
    } catch { /* ignore */ }
    finally { setNotifLoading(false); }
  }, [filterType]);

  useEffect(() => {
    if (panelOpen) fetchNotifications();
  }, [panelOpen, fetchNotifications]);

  // Close panel on outside click
  useEffect(() => {
    if (!panelOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setPanelOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [panelOpen]);

  const handleMarkRead = async (id: number) => {
    try {
      await markNotificationRead(id);
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, readStatus: 1 } : n));
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch { /* ignore */ }
  };

  const handleMarkAllRead = async () => {
    try {
      await markAllNotificationsRead();
      setNotifications(prev => prev.map(n => ({ ...n, readStatus: 1 })));
      setUnreadCount(0);
      setCriticalCount(0);
      prevCriticalRef.current = 0;
    } catch { /* ignore */ }
  };

  const isLoggedIn = !!localStorage.getItem("token");

  // Bell tier: only red glow for critical alerts, otherwise idle
  const bellTier = criticalCount > 0 ? 'critical' : 'idle';
  const bellStyles = {
    critical: 'bg-red-100 dark:bg-red-950/60 text-red-600 dark:text-red-400 ring-2 ring-red-400/50 animate-pulse',
    warning:  'bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 ring-1 ring-amber-300/40',
    idle:     'bg-default-100 dark:bg-default-50 text-default-500 hover:text-default-700 dark:hover:text-default-300 hover:bg-default-200 dark:hover:bg-default-100',
  };
  const badgeStyles = {
    critical: 'bg-red-500 shadow-lg shadow-red-500/30',
    warning:  'bg-amber-500',
    idle:     '',
  };

  return (
    <>
      <HeroUINavbar maxWidth="xl" position="sticky" height="60px" className="shrink-0">
        <NavbarContent className="basis-1/5 sm:basis-full" justify="start">
          <NavbarBrand className="gap-2 max-w-fit">
            <Link
              className="flex justify-start items-center gap-2 max-w-[200px] sm:max-w-none"
              color="foreground"
              href="/"
            >
              <Logo size={24} />
              <p className="font-bold text-inherit truncate">{appName}</p>
            </Link>
          </NavbarBrand>
        </NavbarContent>

        <NavbarContent className="basis-1/5 sm:basis-full" justify="end">
          {/* Notification Bell */}
          {isLoggedIn && (
            <div className="relative" ref={panelRef}>
              <button
                className={`relative rounded-full p-2 transition-all duration-200 ${bellStyles[bellTier]}`}
                onClick={() => setPanelOpen(!panelOpen)}
                title="通知中心"
              >
                <svg className="w-5 h-5" fill={bellTier === 'critical' ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={bellTier === 'idle' ? 2 : 2.5} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
                {criticalCount > 0 && (
                  <span className={`absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-bold leading-none text-white ${badgeStyles[bellTier]}`}>
                    {criticalCount > 99 ? "99+" : criticalCount}
                  </span>
                )}
              </button>

              {/* Notification Dropdown Panel */}
              {panelOpen && (
                <div className="absolute right-0 top-full mt-2 w-[360px] sm:w-[420px] max-h-[520px] bg-white dark:bg-zinc-900 rounded-xl shadow-xl border border-divider/60 z-50 flex flex-col overflow-hidden">
                  {/* Header */}
                  <div className="px-4 py-3 border-b border-divider/40">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm">通知中心</span>
                        {criticalCount > 0 && (
                          <Badge content={criticalCount} color="danger" size="sm">
                            <span />
                          </Badge>
                        )}
                      </div>
                      {unreadCount > 0 && (
                        <button
                          className="text-xs text-primary hover:text-primary-600 transition-colors"
                          onClick={handleMarkAllRead}
                        >
                          全部已读
                        </button>
                      )}
                    </div>
                    {/* Quick filter chips */}
                    <div className="flex gap-1 mt-2 flex-wrap">
                      <Chip
                        size="sm"
                        variant={!filterType ? "solid" : "flat"}
                        color="default"
                        className="cursor-pointer h-5 text-[10px]"
                        onClick={() => setFilterType(null)}
                      >
                        全部
                      </Chip>
                      {['alert', 'alert_recovery', 'expiry_reminder', 'system', 'daily_summary'].map(t => (
                        <Chip
                          key={t}
                          size="sm"
                          variant={filterType === t ? "solid" : "flat"}
                          color={t === 'alert' ? "danger" : t === 'alert_recovery' ? "success" : t === 'expiry_reminder' ? "warning" : "default"}
                          className="cursor-pointer h-5 text-[10px]"
                          onClick={() => setFilterType(filterType === t ? null : t)}
                        >
                          {TYPE_LABELS[t] || t}
                        </Chip>
                      ))}
                    </div>
                  </div>

                  {/* Critical alert banner */}
                  {criticalCount > 0 && (
                    <div className="bg-red-50 dark:bg-red-950/30 border-b border-red-200 dark:border-red-800/50 px-4 py-2 flex items-center gap-2">
                      <span className="text-red-600 dark:text-red-400 text-xs font-semibold">
                        {criticalCount} 条紧急告警未处理
                      </span>
                      <Button
                        size="sm"
                        variant="flat"
                        color="danger"
                        className="ml-auto h-6 text-[10px] min-w-0"
                        onPress={() => { setPanelOpen(false); navigate("/notification"); }}
                      >
                        立即处理
                      </Button>
                    </div>
                  )}

                  {/* Notification List */}
                  <div className="flex-1 overflow-y-auto">
                    {notifLoading ? (
                      <div className="flex justify-center py-8"><Spinner size="sm" /></div>
                    ) : notifications.length === 0 ? (
                      <div className="text-center text-default-400 text-sm py-8">暂无通知</div>
                    ) : (
                      notifications.map((n) => (
                        <div
                          key={n.id}
                          className={`px-4 py-2.5 border-b border-divider/20 hover:bg-default-50 dark:hover:bg-zinc-800 transition-colors cursor-pointer ${n.readStatus === 0 ? "" : "opacity-50"} ${n.severity === 'critical' && n.readStatus === 0 ? 'bg-red-50/50 dark:bg-red-950/20' : ''}`}
                          onClick={() => { if (n.readStatus === 0) handleMarkRead(n.id); }}
                        >
                          <div className="flex items-start gap-2">
                            <div className={`mt-1 w-2 h-2 rounded-full flex-shrink-0 ${SEVERITY_COLORS[n.severity] || SEVERITY_COLORS.info} ${n.severity === 'critical' && n.readStatus === 0 ? 'animate-pulse' : ''}`} />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className={`text-sm font-medium truncate ${n.severity === 'critical' ? 'text-red-600 dark:text-red-400' : ''}`}>{n.title}</span>
                                <Chip
                                  size="sm"
                                  variant="flat"
                                  color={n.severity === 'critical' ? 'danger' : n.severity === 'warning' ? 'warning' : 'default'}
                                  className="h-4 text-[9px] shrink-0"
                                >
                                  {SEVERITY_LABELS[n.severity] || n.severity}
                                </Chip>
                                {n.type && (
                                  <Chip size="sm" variant="flat" className="h-4 text-[9px] shrink-0">
                                    {TYPE_LABELS[n.type] || n.type}
                                  </Chip>
                                )}
                              </div>
                              <p className="text-xs text-default-500 mt-0.5 line-clamp-1">{n.content}</p>
                              <span className="text-[10px] text-default-400">{timeAgo(n.createdTime)}</span>
                            </div>
                            {n.readStatus === 0 && (
                              <div className="w-2 h-2 rounded-full bg-primary flex-shrink-0 mt-1.5" />
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  {/* Footer */}
                  <div className="border-t border-divider/40 px-4 py-2">
                    <Button
                      size="sm"
                      variant="light"
                      color="primary"
                      className="w-full"
                      onPress={() => {
                        setPanelOpen(false);
                        navigate("/notification");
                      }}
                    >
                      查看全部通知
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* WebView settings icon */}
          {isWebView && (
            <button
              className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
              onClick={() => navigate('/settings')}
              title="面板设置"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
          )}
        </NavbarContent>
      </HeroUINavbar>
    </>
  );
};
