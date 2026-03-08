import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { Card, CardBody } from "@heroui/card";
import { Chip } from "@heroui/chip";
import { Input } from "@heroui/input";
import { Progress } from "@heroui/progress";
import { Spinner } from "@heroui/spinner";
import { Divider } from "@heroui/divider";
import { Button } from "@heroui/button";
import {
  Modal, ModalContent, ModalHeader, ModalBody, useDisclosure
} from "@heroui/modal";

import {
  MonitorNodeSnapshot,
  getMonitorDashboard,
} from '@/api';
import { isAdmin } from '@/utils/auth';
import { useNavigate } from 'react-router-dom';

// ===================== Helpers =====================

function formatBytes(bytes?: number | null): string {
  if (bytes == null || bytes === 0) return '-';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}

function formatSpeed(bytesPerSec?: number | null): string {
  if (bytesPerSec == null || bytesPerSec === 0) return '-';
  const bits = bytesPerSec * 8;
  if (bits < 1000) return bits.toFixed(0) + ' bps';
  if (bits < 1_000_000) return (bits / 1000).toFixed(1) + ' Kbps';
  if (bits < 1_000_000_000) return (bits / 1_000_000).toFixed(1) + ' Mbps';
  return (bits / 1_000_000_000).toFixed(2) + ' Gbps';
}

function formatUptime(seconds?: number | null): string {
  if (seconds == null || seconds === 0) return '-';
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  if (d > 0) return `${d}d ${h}h`;
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function barColor(v: number): 'success' | 'warning' | 'danger' {
  return v > 90 ? 'danger' : v > 75 ? 'warning' : 'success';
}

function barColorClass(v: number): string {
  return v > 90 ? 'bg-danger' : v > 75 ? 'bg-warning' : 'bg-success';
}

function memPercent(used?: number | null, total?: number | null): number {
  if (!used || !total || total === 0) return 0;
  return (used / total) * 100;
}

// ===================== Component =====================

export default function ServerDashboardPage() {
  const navigate = useNavigate();
  const admin = isAdmin();
  const [nodes, setNodes] = useState<MonitorNodeSnapshot[]>([]);
  const [summary, setSummary] = useState({ total: 0, online: 0, offline: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'online' | 'offline'>('all');
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { isOpen: isDetailOpen, onOpen: onDetailOpen, onClose: onDetailClose } = useDisclosure();
  const [selectedNode, setSelectedNode] = useState<MonitorNodeSnapshot | null>(null);

  const fetchData = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true);
    try {
      const res = await getMonitorDashboard();
      if (res.code === 0 && res.data) {
        const data = res.data as any;
        setNodes(data.nodes || []);
        setSummary({ total: data.total || 0, online: data.online || 0, offline: data.offline || 0 });
        setLastUpdate(new Date());
      }
    } catch { /* ignore */ }
    finally { if (showLoading) setLoading(false); }
  }, []);

  useEffect(() => {
    fetchData(true);
    // 10s polling for real-time feel
    pollRef.current = setInterval(() => fetchData(false), 10_000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [fetchData]);

  const openDetail = (node: MonitorNodeSnapshot) => {
    setSelectedNode(node);
    onDetailOpen();
  };

  const filteredNodes = useMemo(() => {
    let list = nodes;
    if (statusFilter === 'online') list = list.filter(n => n.online === 1);
    else if (statusFilter === 'offline') list = list.filter(n => n.online !== 1);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(n =>
        (n.name || '').toLowerCase().includes(q) ||
        (n.ip || '').toLowerCase().includes(q) ||
        (n.region || '').toLowerCase().includes(q) ||
        (n.assetName || '').toLowerCase().includes(q) ||
        (n.instanceName || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [nodes, search, statusFilter]);

  if (!admin) {
    return (
      <Card className="border border-danger/20 bg-danger-50/60">
        <CardBody className="p-6"><h1 className="text-xl font-semibold text-danger">Admin Only</h1></CardBody>
      </Card>
    );
  }

  return (
    <div className="w-full max-w-[1800px] mx-auto space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Server Dashboard</h1>
          <p className="mt-0.5 text-sm text-default-500">
            Real-time server monitoring
            {lastUpdate && (
              <span className="ml-2 text-default-400">
                Updated {lastUpdate.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="flat" onPress={() => navigate('/assets')}>Assets</Button>
          <Button size="sm" variant="flat" onPress={() => navigate('/probe')}>Config</Button>
        </div>
      </div>

      {/* Summary Bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={() => setStatusFilter('all')}
          className={`rounded-xl border px-4 py-2.5 transition-all cursor-pointer ${
            statusFilter === 'all' ? 'border-primary bg-primary-50 dark:bg-primary/10' : 'border-divider/60 bg-content1 hover:border-primary/40'
          }`}
        >
          <p className="text-[10px] font-bold tracking-widest text-default-400 uppercase">Total</p>
          <p className="text-2xl font-bold font-mono">{summary.total}</p>
        </button>
        <button
          onClick={() => setStatusFilter(statusFilter === 'online' ? 'all' : 'online')}
          className={`rounded-xl border px-4 py-2.5 transition-all cursor-pointer ${
            statusFilter === 'online' ? 'border-success bg-success-50 dark:bg-success/10' : 'border-success/20 bg-success-50/30 dark:bg-success-50/10 hover:border-success/40'
          }`}
        >
          <p className="text-[10px] font-bold tracking-widest text-success uppercase">Online</p>
          <p className="text-2xl font-bold font-mono text-success">{summary.online}</p>
        </button>
        <button
          onClick={() => setStatusFilter(statusFilter === 'offline' ? 'all' : 'offline')}
          className={`rounded-xl border px-4 py-2.5 transition-all cursor-pointer ${
            statusFilter === 'offline' ? 'border-danger bg-danger-50 dark:bg-danger/10' : summary.offline > 0 ? 'border-danger/20 bg-danger-50/30 dark:bg-danger-50/10 hover:border-danger/40' : 'border-divider/60 bg-content1'
          }`}
        >
          <p className={`text-[10px] font-bold tracking-widest uppercase ${summary.offline > 0 ? 'text-danger' : 'text-default-400'}`}>Offline</p>
          <p className={`text-2xl font-bold font-mono ${summary.offline > 0 ? 'text-danger' : 'text-default-300'}`}>{summary.offline}</p>
        </button>

        <div className="flex-1 min-w-[200px] ml-auto max-w-xs">
          <Input size="sm" placeholder="Search server..." value={search} onValueChange={setSearch}
            isClearable onClear={() => setSearch('')} />
        </div>
      </div>

      {/* Loading */}
      {loading ? (
        <div className="flex h-64 items-center justify-center"><Spinner size="lg" /></div>
      ) : filteredNodes.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-divider/60 p-12 text-center">
          <h3 className="text-base font-semibold text-default-600">
            {nodes.length === 0 ? 'No servers found' : 'No matching results'}
          </h3>
          <p className="mt-2 text-sm text-default-400">
            {nodes.length === 0 ? 'Add probe instances and sync to see servers here.' : 'Try adjusting search or filter.'}
          </p>
        </div>
      ) : (
        /* Server Card Grid */
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filteredNodes.map((node) => {
            const m = node.latestMetric;
            const isOnline = node.online === 1;
            const cpu = m?.cpuUsage || 0;
            const mem = memPercent(m?.memUsed, m?.memTotal);
            const disk = memPercent(m?.diskUsed, m?.diskTotal);

            return (
              <button
                type="button"
                key={`${node.instanceId}-${node.id}`}
                onClick={() => openDetail(node)}
                className={`rounded-xl border p-3 text-left transition-all hover:shadow-md cursor-pointer ${
                  isOnline
                    ? 'border-divider/60 bg-content1 hover:border-primary/40'
                    : 'border-danger/20 bg-danger-50/20 dark:bg-danger-50/5 hover:border-danger/40'
                }`}
              >
                {/* Header */}
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className={`inline-block h-2.5 w-2.5 rounded-full flex-shrink-0 ${
                        isOnline ? 'bg-success animate-pulse' : 'bg-danger'
                      }`} />
                      <span className="truncate font-semibold text-sm">{node.name || node.remoteNodeUuid?.slice(0, 8)}</span>
                    </div>
                    <p className="mt-0.5 truncate text-[11px] text-default-400 font-mono pl-4">
                      {node.ip || '-'}
                      {node.region ? ` / ${node.region}` : ''}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-0.5 flex-shrink-0">
                    {node.instanceName && (
                      <span className="text-[9px] text-default-400 font-mono truncate max-w-[80px]">{node.instanceName}</span>
                    )}
                    {node.assetName && (
                      <Chip size="sm" variant="flat" color="primary" className="h-5">{node.assetName}</Chip>
                    )}
                  </div>
                </div>

                {/* Metrics - compact resource bars */}
                {isOnline && m ? (
                  <div className="space-y-1.5">
                    {/* CPU */}
                    <div className="flex items-center gap-1.5">
                      <span className="w-7 text-[10px] font-bold tracking-wider text-default-400 flex-shrink-0">CPU</span>
                      <div className="flex-1 h-1.5 bg-default-200 dark:bg-default-100 rounded-sm overflow-hidden">
                        <div className={`h-full transition-all duration-700 ease-out rounded-sm ${barColorClass(cpu)}`}
                          style={{ width: `${Math.min(cpu, 100)}%` }} />
                      </div>
                      <span className={`w-9 text-right text-[11px] font-mono font-medium ${cpu > 90 ? 'text-danger' : cpu > 75 ? 'text-warning' : 'text-default-600'}`}>
                        {cpu.toFixed(0)}%
                      </span>
                    </div>
                    {/* MEM */}
                    <div className="flex items-center gap-1.5">
                      <span className="w-7 text-[10px] font-bold tracking-wider text-default-400 flex-shrink-0">MEM</span>
                      <div className="flex-1 h-1.5 bg-default-200 dark:bg-default-100 rounded-sm overflow-hidden">
                        <div className={`h-full transition-all duration-700 ease-out rounded-sm ${barColorClass(mem)}`}
                          style={{ width: `${Math.min(mem, 100)}%` }} />
                      </div>
                      <span className={`w-9 text-right text-[11px] font-mono font-medium ${mem > 90 ? 'text-danger' : mem > 75 ? 'text-warning' : 'text-default-600'}`}>
                        {mem.toFixed(0)}%
                      </span>
                    </div>
                    {/* DISK */}
                    <div className="flex items-center gap-1.5">
                      <span className="w-7 text-[10px] font-bold tracking-wider text-default-400 flex-shrink-0">DISK</span>
                      <div className="flex-1 h-1.5 bg-default-200 dark:bg-default-100 rounded-sm overflow-hidden">
                        <div className={`h-full transition-all duration-700 ease-out rounded-sm ${barColorClass(disk)}`}
                          style={{ width: `${Math.min(disk, 100)}%` }} />
                      </div>
                      <span className={`w-9 text-right text-[11px] font-mono font-medium ${disk > 90 ? 'text-danger' : disk > 75 ? 'text-warning' : 'text-default-600'}`}>
                        {disk.toFixed(0)}%
                      </span>
                    </div>

                    {/* Network + Uptime footer */}
                    <div className="flex items-center justify-between pt-1 border-t border-divider/40 text-[10px] text-default-400 font-mono">
                      <span>
                        <span className="text-success">&#x2193;</span> {formatSpeed(m.netIn)}
                        <span className="mx-1.5 text-default-200">|</span>
                        <span className="text-primary">&#x2191;</span> {formatSpeed(m.netOut)}
                      </span>
                      <span>{formatUptime(m.uptime)}</span>
                    </div>
                  </div>
                ) : (
                  <div className="py-3 text-center">
                    <span className="text-[11px] text-danger font-mono font-bold tracking-wider">OFFLINE</span>
                    {node.os && <p className="text-[10px] text-default-400 mt-1">{node.os}</p>}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Node Detail Modal */}
      <Modal isOpen={isDetailOpen} onClose={onDetailClose} size="3xl" scrollBehavior="inside">
        <ModalContent>
          {selectedNode && (() => {
            const m = selectedNode.latestMetric;
            const isOnline = selectedNode.online === 1;
            const cpu = m?.cpuUsage || 0;
            const mem = memPercent(m?.memUsed, m?.memTotal);
            const swap = memPercent(m?.swapUsed, m?.swapTotal);
            const disk = memPercent(m?.diskUsed, m?.diskTotal);

            return (
              <>
                <ModalHeader className="flex items-center gap-3 pb-2">
                  <span className={`inline-block h-3 w-3 rounded-full ${isOnline ? 'bg-success animate-pulse' : 'bg-danger'}`} />
                  <div className="min-w-0">
                    <p className="text-lg font-bold">{selectedNode.name || selectedNode.remoteNodeUuid?.slice(0, 8)}</p>
                    <p className="text-xs font-normal text-default-400 font-mono">
                      {selectedNode.ip || '-'}
                      {selectedNode.ipv6 ? ` / ${selectedNode.ipv6}` : ''}
                      {selectedNode.region ? ` / ${selectedNode.region}` : ''}
                    </p>
                  </div>
                </ModalHeader>
                <ModalBody className="space-y-4 pb-6">
                  {/* System Info */}
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    <div className="rounded-xl border border-divider/60 bg-default-50/60 p-3">
                      <p className="text-[10px] font-bold tracking-widest text-default-400 uppercase mb-1.5">System</p>
                      <div className="space-y-1 text-xs">
                        <p className="flex justify-between"><span className="text-default-400">OS</span><span className="font-mono">{selectedNode.os || '-'}</span></p>
                        <p className="flex justify-between"><span className="text-default-400">Kernel</span><span className="font-mono text-[11px] truncate ml-2">{selectedNode.kernelVersion || '-'}</span></p>
                        <p className="flex justify-between"><span className="text-default-400">Arch</span><span className="font-mono">{selectedNode.arch || '-'}</span></p>
                        <p className="flex justify-between"><span className="text-default-400">Virt</span><span className="font-mono">{selectedNode.virtualization || '-'}</span></p>
                        <p className="flex justify-between"><span className="text-default-400">Agent</span><span className="font-mono">v{selectedNode.version || '?'}</span></p>
                      </div>
                    </div>

                    <div className="rounded-xl border border-divider/60 bg-default-50/60 p-3">
                      <p className="text-[10px] font-bold tracking-widest text-default-400 uppercase mb-1.5">Hardware</p>
                      <div className="space-y-1 text-xs">
                        <p className="flex justify-between"><span className="text-default-400">CPU</span><span className="font-mono">{selectedNode.cpuCores || '?'}C</span></p>
                        <p className="flex justify-between"><span className="text-default-400">RAM</span><span className="font-mono">{formatBytes(selectedNode.memTotal)}</span></p>
                        <p className="flex justify-between"><span className="text-default-400">Swap</span><span className="font-mono">{formatBytes(selectedNode.swapTotal)}</span></p>
                        <p className="flex justify-between"><span className="text-default-400">Disk</span><span className="font-mono">{formatBytes(selectedNode.diskTotal)}</span></p>
                        {selectedNode.gpuName && <p className="flex justify-between"><span className="text-default-400">GPU</span><span className="font-mono truncate ml-2">{selectedNode.gpuName}</span></p>}
                      </div>
                    </div>

                    <div className="rounded-xl border border-divider/60 bg-default-50/60 p-3">
                      <p className="text-[10px] font-bold tracking-widest text-default-400 uppercase mb-1.5">Info</p>
                      <div className="space-y-1 text-xs">
                        {selectedNode.cpuName && <p className="truncate text-default-500 font-mono">{selectedNode.cpuName}</p>}
                        {selectedNode.instanceName && <p className="flex justify-between"><span className="text-default-400">Probe</span><span>{selectedNode.instanceName}</span></p>}
                        {selectedNode.assetName && <p className="flex justify-between"><span className="text-default-400">Asset</span><Chip size="sm" variant="flat" color="primary" className="h-5 cursor-pointer" onClick={() => { onDetailClose(); navigate('/assets'); }}>{selectedNode.assetName}</Chip></p>}
                        {selectedNode.price != null && <p className="flex justify-between"><span className="text-default-400">Price</span><span className="font-mono">{selectedNode.price} {selectedNode.currency || ''}</span></p>}
                        {selectedNode.trafficLimit != null && <p className="flex justify-between"><span className="text-default-400">Traffic</span><span className="font-mono">{formatBytes(selectedNode.trafficLimit)}</span></p>}
                      </div>
                    </div>
                  </div>

                  {/* Real-time Metrics */}
                  {isOnline && m ? (
                    <>
                      <Divider />
                      <div>
                        <p className="text-[10px] font-bold tracking-widest text-default-400 uppercase mb-3">Real-time Metrics</p>
                        <div className="space-y-2.5">
                          <div>
                            <div className="flex justify-between text-sm mb-1">
                              <span className="text-default-500">CPU</span>
                              <span className="font-semibold font-mono">{cpu.toFixed(1)}%</span>
                            </div>
                            <Progress value={cpu} color={barColor(cpu)} size="sm" aria-label="CPU" />
                          </div>
                          <div>
                            <div className="flex justify-between text-sm mb-1">
                              <span className="text-default-500">Memory</span>
                              <span className="font-mono text-sm">{mem.toFixed(1)}% <span className="text-xs text-default-400">{formatBytes(m.memUsed)} / {formatBytes(m.memTotal)}</span></span>
                            </div>
                            <Progress value={mem} color={barColor(mem)} size="sm" aria-label="MEM" />
                          </div>
                          {(m.swapTotal ?? 0) > 0 && (
                            <div>
                              <div className="flex justify-between text-sm mb-1">
                                <span className="text-default-500">Swap</span>
                                <span className="font-mono text-sm">{swap.toFixed(1)}% <span className="text-xs text-default-400">{formatBytes(m.swapUsed)} / {formatBytes(m.swapTotal)}</span></span>
                              </div>
                              <Progress value={swap} color={barColor(swap)} size="sm" aria-label="Swap" />
                            </div>
                          )}
                          <div>
                            <div className="flex justify-between text-sm mb-1">
                              <span className="text-default-500">Disk</span>
                              <span className="font-mono text-sm">{disk.toFixed(1)}% <span className="text-xs text-default-400">{formatBytes(m.diskUsed)} / {formatBytes(m.diskTotal)}</span></span>
                            </div>
                            <Progress value={disk} color={barColor(disk)} size="sm" aria-label="Disk" />
                          </div>
                        </div>
                      </div>

                      {/* Detail stats grid */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
                        <div className="rounded-lg bg-default-50 dark:bg-default-100/5 p-2.5 text-center">
                          <p className="text-[9px] text-default-400 uppercase tracking-wider">Net In</p>
                          <p className="text-sm font-semibold font-mono mt-0.5">{formatSpeed(m.netIn)}</p>
                        </div>
                        <div className="rounded-lg bg-default-50 dark:bg-default-100/5 p-2.5 text-center">
                          <p className="text-[9px] text-default-400 uppercase tracking-wider">Net Out</p>
                          <p className="text-sm font-semibold font-mono mt-0.5">{formatSpeed(m.netOut)}</p>
                        </div>
                        <div className="rounded-lg bg-default-50 dark:bg-default-100/5 p-2.5 text-center">
                          <p className="text-[9px] text-default-400 uppercase tracking-wider">Traffic In</p>
                          <p className="text-sm font-semibold font-mono mt-0.5">{formatBytes(m.netTotalDown)}</p>
                        </div>
                        <div className="rounded-lg bg-default-50 dark:bg-default-100/5 p-2.5 text-center">
                          <p className="text-[9px] text-default-400 uppercase tracking-wider">Traffic Out</p>
                          <p className="text-sm font-semibold font-mono mt-0.5">{formatBytes(m.netTotalUp)}</p>
                        </div>
                        <div className="rounded-lg bg-default-50 dark:bg-default-100/5 p-2.5 text-center">
                          <p className="text-[9px] text-default-400 uppercase tracking-wider">Load 1/5/15</p>
                          <p className="text-sm font-semibold font-mono mt-0.5">{m.load1?.toFixed(2) ?? '-'} / {m.load5?.toFixed(2) ?? '-'} / {m.load15?.toFixed(2) ?? '-'}</p>
                        </div>
                        <div className="rounded-lg bg-default-50 dark:bg-default-100/5 p-2.5 text-center">
                          <p className="text-[9px] text-default-400 uppercase tracking-wider">Uptime</p>
                          <p className="text-sm font-semibold font-mono mt-0.5">{formatUptime(m.uptime)}</p>
                        </div>
                        <div className="rounded-lg bg-default-50 dark:bg-default-100/5 p-2.5 text-center">
                          <p className="text-[9px] text-default-400 uppercase tracking-wider">TCP / UDP</p>
                          <p className="text-sm font-semibold font-mono mt-0.5">{m.connections ?? '-'} / {m.connectionsUdp ?? '-'}</p>
                        </div>
                        <div className="rounded-lg bg-default-50 dark:bg-default-100/5 p-2.5 text-center">
                          <p className="text-[9px] text-default-400 uppercase tracking-wider">Processes</p>
                          <p className="text-sm font-semibold font-mono mt-0.5">{m.processCount ?? '-'}</p>
                        </div>
                        {m.gpuUsage != null && m.gpuUsage > 0 && (
                          <div className="rounded-lg bg-default-50 dark:bg-default-100/5 p-2.5 text-center">
                            <p className="text-[9px] text-default-400 uppercase tracking-wider">GPU</p>
                            <p className="text-sm font-semibold font-mono mt-0.5">{m.gpuUsage.toFixed(1)}%</p>
                          </div>
                        )}
                        {m.temperature != null && m.temperature > 0 && (
                          <div className="rounded-lg bg-default-50 dark:bg-default-100/5 p-2.5 text-center">
                            <p className="text-[9px] text-default-400 uppercase tracking-wider">Temp</p>
                            <p className="text-sm font-semibold font-mono mt-0.5">{m.temperature.toFixed(1)} C</p>
                          </div>
                        )}
                      </div>

                      {m.sampledAt && (
                        <p className="text-[10px] text-default-400 text-right font-mono">
                          Sampled: {new Date(m.sampledAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </p>
                      )}
                    </>
                  ) : (
                    <div className="rounded-xl border border-danger/20 bg-danger-50/30 p-4 text-center">
                      <span className="text-danger font-mono font-bold">OFFLINE</span>
                      <p className="text-xs text-default-400 mt-1">This server is currently unreachable.</p>
                    </div>
                  )}
                </ModalBody>
              </>
            );
          })()}
        </ModalContent>
      </Modal>
    </div>
  );
}
