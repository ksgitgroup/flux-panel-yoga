import { useEffect, useState, useCallback } from 'react';
import { Card, CardBody, CardHeader } from "@heroui/card";
import { Chip } from "@heroui/chip";
import { Input } from "@heroui/input";
import { Button } from "@heroui/button";
import { Spinner } from "@heroui/spinner";

import { Select, SelectItem } from "@heroui/select";
import { Tabs, Tab } from "@heroui/tabs";
import {
  Table, TableHeader, TableColumn, TableBody, TableRow, TableCell
} from "@heroui/table";
import {
  Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, useDisclosure
} from "@heroui/modal";
import toast from 'react-hot-toast';

import {
  getAuditLogs, getAuditStats, clearAuditLogs,
  AuditLogItem, AuditStats,
} from '@/api';

const MODULES = [
  { value: '', label: '全部模块' },
  { value: 'asset', label: '资产管理' },
  { value: 'forward', label: '转发规则' },
  { value: 'tunnel', label: '隧道' },
  { value: 'user', label: '用户管理' },
  { value: 'probe', label: '探针' },
  { value: 'alert', label: '告警' },
  { value: 'config', label: '系统配置' },
  { value: 'auth', label: '认证登录' },
];

const ACTIONS = [
  { value: '', label: '全部操作' },
  { value: 'create', label: '创建' },
  { value: 'update', label: '更新' },
  { value: 'delete', label: '删除' },
  { value: 'login', label: '登录' },
  { value: 'logout', label: '登出' },
  { value: 'toggle', label: '切换状态' },
  { value: 'export', label: '导出' },
];

const RESULT_COLOR: Record<string, 'success' | 'danger' | 'warning' | 'default'> = {
  success: 'success',
  fail: 'danger',
  error: 'danger',
  denied: 'warning',
};

function formatTime(ts?: number | string | null): string {
  if (!ts) return '-';
  return new Date(ts).toLocaleString('zh-CN', { hour12: false });
}

/* ------------------------------------------------------------------ */
/*  Audit Logs Tab                                                     */
/* ------------------------------------------------------------------ */
function AuditLogsTab() {
  const [logs, setLogs] = useState<AuditLogItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const pageSize = 20;

  const [filterModule, setFilterModule] = useState('');
  const [filterAction, setFilterAction] = useState('');
  const [filterDateStart, setFilterDateStart] = useState('');
  const [filterDateEnd, setFilterDateEnd] = useState('');

  const clearModal = useDisclosure();

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getAuditLogs({
        page,
        size: pageSize,
        module: filterModule || undefined,
        action: filterAction || undefined,
        startTime: filterDateStart ? new Date(filterDateStart).getTime() : undefined,
        endTime: filterDateEnd ? new Date(filterDateEnd).getTime() : undefined,
      });
      if (res.code === 0 && res.data) {
        setLogs(res.data.records ?? []);
        setTotal(res.data.total ?? 0);
      }
    } catch {
      toast.error('加载审计日志失败');
    } finally {
      setLoading(false);
    }
  }, [page, filterModule, filterAction, filterDateStart, filterDateEnd]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  const handleClear = async () => {
    try {
      await clearAuditLogs(0);
      toast.success('审计日志已清空');
      clearModal.onClose();
      setPage(1);
      fetchLogs();
    } catch {
      toast.error('清空失败');
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-end">
        <Select
          label="模块"
          size="sm"
          className="w-40"
          selectedKeys={new Set([filterModule])}
          onSelectionChange={(keys) => {
            const v = Array.from(keys)[0] as string ?? '';
            setFilterModule(v);
            setPage(1);
          }}
        >
          {MODULES.map(m => <SelectItem key={m.value}>{m.label}</SelectItem>)}
        </Select>

        <Select
          label="操作"
          size="sm"
          className="w-40"
          selectedKeys={new Set([filterAction])}
          onSelectionChange={(keys) => {
            const v = Array.from(keys)[0] as string ?? '';
            setFilterAction(v);
            setPage(1);
          }}
        >
          {ACTIONS.map(a => <SelectItem key={a.value}>{a.label}</SelectItem>)}
        </Select>

        <Input
          type="date"
          label="开始日期"
          size="sm"
          className="w-44"
          value={filterDateStart}
          onChange={e => { setFilterDateStart(e.target.value); setPage(1); }}
        />
        <Input
          type="date"
          label="结束日期"
          size="sm"
          className="w-44"
          value={filterDateEnd}
          onChange={e => { setFilterDateEnd(e.target.value); setPage(1); }}
        />

        <Button size="sm" variant="flat" onPress={fetchLogs}>刷新</Button>
        <Button size="sm" color="danger" variant="flat" onPress={clearModal.onOpen}>清空日志</Button>
      </div>

      {/* Table */}
      <Table aria-label="审计日志" isStriped>
        <TableHeader>
          <TableColumn>时间</TableColumn>
          <TableColumn>用户</TableColumn>
          <TableColumn>操作</TableColumn>
          <TableColumn>模块</TableColumn>
          <TableColumn>目标</TableColumn>
          <TableColumn>结果</TableColumn>
          <TableColumn>IP</TableColumn>
        </TableHeader>
        <TableBody
          isLoading={loading}
          loadingContent={<Spinner />}
          emptyContent="暂无审计日志"
        >
          {logs.map((log, idx) => (
            <TableRow key={log.id ?? idx}>
              <TableCell className="whitespace-nowrap text-sm">{formatTime(log.createdTime)}</TableCell>
              <TableCell>{log.username ?? '-'}</TableCell>
              <TableCell>{log.action}</TableCell>
              <TableCell>
                <Chip size="sm" variant="flat">{log.module}</Chip>
              </TableCell>
              <TableCell className="max-w-[200px] truncate" title={log.targetName ?? undefined}>{log.targetName ?? '-'}</TableCell>
              <TableCell>
                <Chip size="sm" color={RESULT_COLOR[log.result ?? ''] ?? 'default'} variant="flat">
                  {log.result ?? '-'}
                </Chip>
              </TableCell>
              <TableCell className="text-sm text-default-500">{log.ip ?? '-'}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {/* Pagination */}
      <div className="flex justify-between items-center">
        <span className="text-sm text-default-400">共 {total} 条</span>
        <div className="flex gap-2">
          <Button size="sm" variant="flat" isDisabled={page <= 1} onPress={() => setPage(p => p - 1)}>上一页</Button>
          <span className="text-sm leading-8">{page} / {totalPages}</span>
          <Button size="sm" variant="flat" isDisabled={page >= totalPages} onPress={() => setPage(p => p + 1)}>下一页</Button>
        </div>
      </div>

      {/* Clear confirm modal */}
      <Modal isOpen={clearModal.isOpen} onOpenChange={clearModal.onOpenChange}>
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader>确认清空</ModalHeader>
              <ModalBody>
                <p>确定要清空所有审计日志吗？此操作不可撤销。</p>
              </ModalBody>
              <ModalFooter>
                <Button variant="flat" onPress={onClose}>取消</Button>
                <Button color="danger" onPress={handleClear}>确认清空</Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </div>
  );
}



/* ------------------------------------------------------------------ */
/*  Stats Tab                                                          */
/* ------------------------------------------------------------------ */
function StatsTab() {
  const [stats, setStats] = useState<AuditStats | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getAuditStats();
      if (res.code === 0) {
        setStats(res.data ?? null);
      }
    } catch {
      toast.error('加载统计数据失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  if (loading) return <div className="flex justify-center py-12"><Spinner /></div>;
  if (!stats) return <div className="text-center text-default-400 py-12">暂无统计数据</div>;

  const modules = stats.moduleDistribution ?? [];
  const maxCount = Math.max(1, ...modules.map(m => m.count));

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardBody className="text-center">
            <p className="text-3xl font-bold text-primary">{stats.todayCount ?? 0}</p>
            <p className="text-sm text-default-500 mt-1">今日操作</p>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="text-center">
            <p className="text-3xl font-bold text-secondary">{stats.weekCount ?? 0}</p>
            <p className="text-sm text-default-500 mt-1">本周操作</p>
          </CardBody>
        </Card>
      </div>

      {/* Module distribution bar chart */}
      <Card>
        <CardHeader className="font-semibold">模块操作分布</CardHeader>
        <CardBody>
          {modules.length === 0 ? (
            <p className="text-default-400 text-sm">暂无数据</p>
          ) : (
            <div className="space-y-3">
              {[...modules]
                .sort((a, b) => b.count - a.count)
                .map(({ module: mod, count }) => {
                  const pct = Math.round((count / maxCount) * 100);
                  const label = MODULES.find(m => m.value === mod)?.label ?? mod;
                  return (
                    <div key={mod} className="flex items-center gap-3">
                      <span className="w-24 text-sm text-right text-default-600 shrink-0">{label}</span>
                      <div className="flex-1 h-6 bg-default-100 rounded-md overflow-hidden">
                        <div
                          className="h-full bg-primary rounded-md transition-all duration-500"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="w-12 text-sm text-default-500 shrink-0">{count}</span>
                    </div>
                  );
                })}
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Page                                                          */
/* ------------------------------------------------------------------ */
export default function AuditPage() {
  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">审计与到期</h1>
        <div className="flex gap-2">
          <Button size="sm" variant="flat" as="a" href="/alert">告警规则</Button>
          <Button size="sm" variant="flat" as="a" href="/notification">通知中心</Button>
        </div>
      </div>
      <Tabs aria-label="审计页面标签" variant="underlined" size="lg">
        <Tab key="logs" title="审计日志">
          <div className="pt-4">
            <AuditLogsTab />
          </div>
        </Tab>
        <Tab key="stats" title="统计">
          <div className="pt-4">
            <StatsTab />
          </div>
        </Tab>
      </Tabs>
    </div>
  );
}
