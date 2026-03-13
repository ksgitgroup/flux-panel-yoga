import { useState, useEffect, useCallback } from 'react';
import { Button } from '@heroui/button';
import { getActiveCritical, snoozeNotification, NotificationItem } from '@/api';

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return '刚刚';
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}分钟前`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}小时前`;
  return `${Math.floor(diff / 86400_000)}天前`;
}

export function AlertBanner() {
  const [alerts, setAlerts] = useState<NotificationItem[]>([]);
  const [collapsed, setCollapsed] = useState(false);
  const [actioningId, setActioningId] = useState<number | null>(null);

  const fetchAlerts = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) return;
      const res = await getActiveCritical();
      if (res.code === 0 && Array.isArray(res.data)) {
        setAlerts(res.data);
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    fetchAlerts();
    const interval = setInterval(fetchAlerts, 60_000);
    return () => clearInterval(interval);
  }, [fetchAlerts]);

  const handleSnooze = async (id: number, days: number) => {
    setActioningId(id);
    try {
      await snoozeNotification(id, days);
      setAlerts(prev => prev.filter(a => a.id !== id));
    } catch { /* ignore */ }
    finally { setActioningId(null); }
  };

  if (alerts.length === 0) return null;

  const criticals = alerts.filter(a => a.severity === 'critical');
  const warnings = alerts.filter(a => a.severity === 'warning');

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 pt-2">
      <div className={`rounded-xl border overflow-hidden transition-all ${criticals.length > 0 ? 'border-red-300 dark:border-red-800 bg-red-50/80 dark:bg-red-950/30' : 'border-amber-300 dark:border-amber-800 bg-amber-50/80 dark:bg-amber-950/30'}`}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2">
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold text-white ${criticals.length > 0 ? 'bg-red-500 animate-pulse' : 'bg-amber-500'}`}>
              {alerts.length}
            </span>
            <span className={`text-sm font-semibold ${criticals.length > 0 ? 'text-red-700 dark:text-red-400' : 'text-amber-700 dark:text-amber-400'}`}>
              {criticals.length > 0 ? `${criticals.length} 条紧急告警` : ''}{criticals.length > 0 && warnings.length > 0 ? '，' : ''}{warnings.length > 0 ? `${warnings.length} 条警告` : ''}需要处理
            </span>
          </div>
          <div className="flex items-center gap-1">
            <Button size="sm" variant="light" className="h-6 min-w-0 text-[11px]" onPress={() => setCollapsed(!collapsed)}>
              {collapsed ? '展开' : '收起'}
            </Button>
            <Button size="sm" variant="light" className="h-6 min-w-0 text-[11px] text-default-400" onPress={() => {
              // Snooze all for 1 day
              alerts.forEach(a => snoozeNotification(a.id, 1));
              setAlerts([]);
            }}>
              全部稍后提醒
            </Button>
          </div>
        </div>

        {/* Alert items */}
        {!collapsed && (
          <div className="border-t border-divider/30 divide-y divide-divider/20">
            {alerts.map(a => (
              <div key={a.id} className="flex items-center gap-3 px-4 py-2 text-sm">
                <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${a.severity === 'critical' ? 'bg-red-500 animate-pulse' : 'bg-amber-500'}`} />
                <div className="flex-1 min-w-0">
                  <span className={`font-medium ${a.severity === 'critical' ? 'text-red-700 dark:text-red-400' : 'text-amber-700 dark:text-amber-400'}`}>{a.title}</span>
                  {a.content && <span className="text-default-500 ml-2 text-xs">{a.content.length > 60 ? a.content.slice(0, 60) + '...' : a.content}</span>}
                  <span className="text-default-400 ml-2 text-[10px]">{timeAgo(a.createdTime)}</span>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <Button
                    size="sm" variant="flat" color={a.severity === 'critical' ? 'danger' : 'warning'}
                    className="h-6 min-w-0 text-[11px] px-2"
                    isLoading={actioningId === a.id}
                    onPress={() => handleSnooze(a.id, 0)}
                  >
                    确认
                  </Button>
                  <Button
                    size="sm" variant="light"
                    className="h-6 min-w-0 text-[11px] px-1.5 text-default-500"
                    onPress={() => handleSnooze(a.id, 3)}
                  >
                    3天
                  </Button>
                  <Button
                    size="sm" variant="light"
                    className="h-6 min-w-0 text-[11px] px-1.5 text-default-500"
                    onPress={() => handleSnooze(a.id, 7)}
                  >
                    7天
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
