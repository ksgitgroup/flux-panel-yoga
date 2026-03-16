import { useState, useEffect, useCallback, useRef } from 'react';
import { Button } from '@heroui/button';
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, useDisclosure } from '@heroui/modal';
import { Chip } from '@heroui/chip';
import { getActiveCritical, snoozeNotification, NotificationItem } from '@/api';

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return '刚刚';
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}分钟前`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}小时前`;
  return `${Math.floor(diff / 86400_000)}天前`;
}

const SNOOZE_OPTIONS = [
  { days: 0, label: '确认处理', color: 'danger' as const },
  { days: 1, label: '1天后', color: 'default' as const },
  { days: 3, label: '3天后', color: 'default' as const },
  { days: 7, label: '7天后', color: 'default' as const },
];

export function AlertBanner() {
  const [alerts, setAlerts] = useState<NotificationItem[]>([]);
  const [collapsed, setCollapsed] = useState(false);
  const [actioningId, setActioningId] = useState<number | null>(null);
  const { isOpen: isModalOpen, onOpen: onModalOpen, onClose: onModalClose } = useDisclosure();
  const modalShownRef = useRef(false);

  const fetchAlerts = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) return;
      const res = await getActiveCritical();
      if (res.code === 0 && Array.isArray(res.data)) {
        setAlerts(res.data);
        const criticals = (res.data as NotificationItem[]).filter(a => a.severity === 'critical');
        if (criticals.length > 0 && !modalShownRef.current) {
          modalShownRef.current = true;
          onModalOpen();
        }
      }
    } catch { /* ignore */ }
  }, [onModalOpen]);

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

  const handleSnoozeAll = async (days: number) => {
    for (const a of alerts) {
      await snoozeNotification(a.id, days);
    }
    setAlerts([]);
    onModalClose();
  };

  const criticals = alerts.filter(a => a.severity === 'critical');
  const warnings = alerts.filter(a => a.severity === 'warning');

  return (
    <>
      {/* Critical Alert Modal — shows once on login when critical alerts exist */}
      <Modal isOpen={isModalOpen} onClose={onModalClose} size="lg" backdrop="blur" isDismissable={false}>
        <ModalContent>
          <ModalHeader className="flex items-center gap-2">
            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-red-500 text-white text-xs font-bold animate-pulse">
              {criticals.length}
            </span>
            <span className="text-red-600 dark:text-red-400">紧急告警需要处理</span>
          </ModalHeader>
          <ModalBody>
            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              {criticals.map(a => (
                <div key={a.id} className="flex items-start gap-3 p-3 rounded-lg bg-red-50/80 dark:bg-red-950/20 border border-red-200 dark:border-red-800/50">
                  <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse mt-1.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm text-red-700 dark:text-red-400">{a.title}</span>
                      <Chip size="sm" color="danger" variant="flat" className="h-4 text-[9px]">严重</Chip>
                      <span className="text-[10px] text-default-400">{timeAgo(a.createdTime)}</span>
                    </div>
                    {a.content && <p className="text-xs text-default-500 mt-1 line-clamp-2">{a.content}</p>}
                    <div className="flex gap-1 mt-2">
                      {SNOOZE_OPTIONS.map(opt => (
                        <Button key={opt.days} size="sm" variant={opt.days === 0 ? 'flat' : 'light'}
                          color={opt.days === 0 ? 'danger' : 'default'}
                          className="h-6 min-w-0 text-[11px] px-2"
                          isLoading={actioningId === a.id}
                          onPress={() => handleSnooze(a.id, opt.days)}>
                          {opt.label}
                        </Button>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </ModalBody>
          <ModalFooter className="justify-between">
            <span className="text-xs text-default-400">选择延后提醒后该告警将在指定天数后重新出现</span>
            <div className="flex gap-2">
              <Button size="sm" variant="light" onPress={() => handleSnoozeAll(1)}>全部 1 天后提醒</Button>
              <Button size="sm" color="danger" variant="flat" onPress={() => handleSnoozeAll(0)}>全部确认处理</Button>
              <Button size="sm" variant="light" onPress={onModalClose}>稍后处理</Button>
            </div>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* In-page banner */}
      {alerts.length > 0 && (
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
                <Button size="sm" variant="light" className="h-6 min-w-0 text-[11px] text-default-400" onPress={() => handleSnoozeAll(1)}>
                  全部 1 天后提醒
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
                      {SNOOZE_OPTIONS.map(opt => (
                        <Button key={opt.days} size="sm" variant={opt.days === 0 ? 'flat' : 'light'}
                          color={a.severity === 'critical' && opt.days === 0 ? 'danger' : a.severity === 'warning' && opt.days === 0 ? 'warning' : 'default'}
                          className="h-6 min-w-0 text-[11px] px-1.5"
                          isLoading={actioningId === a.id}
                          onPress={() => handleSnooze(a.id, opt.days)}>
                          {opt.label}
                        </Button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
