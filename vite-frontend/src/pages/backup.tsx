import { useEffect, useState, useCallback } from 'react';
import { Card, CardBody } from "@heroui/card";
import { Chip } from "@heroui/chip";
import { Input } from "@heroui/input";
import { Button } from "@heroui/button";
import { Spinner } from "@heroui/spinner";
import { Switch } from "@heroui/switch";
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
  getBackupRecords, exportGostConfig, exportXuiConfig, backupDatabase,
  deleteBackupRecord, getBackupSchedules, createBackupSchedule,
  updateBackupSchedule, deleteBackupSchedule, getNodeList, getXuiList,
  BackupRecordItem, BackupScheduleItem
} from '@/api';

const TYPE_CHIP_MAP: Record<string, { label: string; color: 'primary' | 'secondary' | 'warning' }> = {
  gost_config: { label: 'GOST 配置', color: 'primary' },
  xui_config: { label: 'XUI 配置', color: 'secondary' },
  database: { label: '数据库', color: 'warning' },
};

const STATUS_CHIP_MAP: Record<string, { label: string; color: 'success' | 'danger' | 'default' }> = {
  success: { label: '成功', color: 'success' },
  failed: { label: '失败', color: 'danger' },
  pending: { label: '进行中', color: 'default' },
};

function formatTime(ts?: number | null): string {
  if (!ts) return '-';
  return new Date(ts).toLocaleString('zh-CN');
}

export default function BackupPage() {
  const [tab, setTab] = useState<string>('records');

  // ===== Records State =====
  const [records, setRecords] = useState<BackupRecordItem[]>([]);
  const [recordsLoading, setRecordsLoading] = useState(false);
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [viewData, setViewData] = useState<string>('');
  const viewModal = useDisclosure();

  // ===== Quick Action State =====
  const [nodes, setNodes] = useState<any[]>([]);
  const [xuiInstances, setXuiInstances] = useState<any[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string>('');
  const [selectedInstanceId, setSelectedInstanceId] = useState<string>('');
  const [exporting, setExporting] = useState(false);

  // ===== Schedules State =====
  const [schedules, setSchedules] = useState<BackupScheduleItem[]>([]);
  const [schedulesLoading, setSchedulesLoading] = useState(false);
  const scheduleModal = useDisclosure();
  const [editingSchedule, setEditingSchedule] = useState<BackupScheduleItem | null>(null);
  const [scheduleForm, setScheduleForm] = useState({
    name: '',
    type: 'database',
    cronExpr: '',
    enabled: 1 as number,
  });

  // ===== Load Records =====
  const loadRecords = useCallback(async () => {
    setRecordsLoading(true);
    try {
      const res = await getBackupRecords();
      // 后端返回分页对象 {records, total, ...}，提取 records 数组
      const data = res?.data;
      setRecords(Array.isArray(data) ? data : (data?.records ?? []));
    } catch {
      toast.error('加载备份记录失败');
    } finally {
      setRecordsLoading(false);
    }
  }, []);

  // ===== Load Schedules =====
  const loadSchedules = useCallback(async () => {
    setSchedulesLoading(true);
    try {
      const res = await getBackupSchedules();
      setSchedules(res?.data ?? []);
    } catch {
      toast.error('加载备份计划失败');
    } finally {
      setSchedulesLoading(false);
    }
  }, []);

  // ===== Load Node/Instance lists =====
  const loadOptions = useCallback(async () => {
    try {
      const [nodeRes, instanceRes] = await Promise.all([
        getNodeList().catch(() => null),
        getXuiList().catch(() => null),
      ]);
      setNodes(nodeRes?.data ?? []);
      setXuiInstances(instanceRes?.data ?? []);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    loadRecords();
    loadSchedules();
    loadOptions();
  }, [loadRecords, loadSchedules, loadOptions]);

  // ===== Filtered Records =====
  const filteredRecords = typeFilter === 'all'
    ? records
    : records.filter(r => r.type === typeFilter);

  // ===== Quick Actions =====
  const handleExportGost = async () => {
    if (!selectedNodeId) { toast.error('请选择节点'); return; }
    setExporting(true);
    try {
      await exportGostConfig(Number(selectedNodeId));
      toast.success('GOST 配置导出成功');
      loadRecords();
    } catch {
      toast.error('GOST 配置导出失败');
    } finally {
      setExporting(false);
    }
  };

  const handleExportXui = async () => {
    if (!selectedInstanceId) { toast.error('请选择实例'); return; }
    setExporting(true);
    try {
      await exportXuiConfig(Number(selectedInstanceId));
      toast.success('XUI 配置导出成功');
      loadRecords();
    } catch {
      toast.error('XUI 配置导出失败');
    } finally {
      setExporting(false);
    }
  };

  const handleBackupDatabase = async () => {
    setExporting(true);
    try {
      await backupDatabase();
      toast.success('数据库备份成功');
      loadRecords();
    } catch {
      toast.error('数据库备份失败');
    } finally {
      setExporting(false);
    }
  };

  // ===== Delete Record =====
  const handleDeleteRecord = async (id: number) => {
    if (!confirm('确定删除此备份记录？')) return;
    try {
      await deleteBackupRecord(id);
      toast.success('删除成功');
      loadRecords();
    } catch {
      toast.error('删除失败');
    }
  };

  // ===== View Data =====
  const handleViewData = (record: BackupRecordItem) => {
    try {
      const formatted = JSON.stringify(JSON.parse(record.backupData ?? '{}'), null, 2);
      setViewData(formatted);
    } catch {
      setViewData(record.backupData ?? '');
    }
    viewModal.onOpen();
  };

  // ===== Schedule CRUD =====
  const openCreateSchedule = () => {
    setEditingSchedule(null);
    setScheduleForm({ name: '', type: 'database', cronExpr: '', enabled: 1 });
    scheduleModal.onOpen();
  };

  const openEditSchedule = (s: BackupScheduleItem) => {
    setEditingSchedule(s);
    setScheduleForm({
      name: s.name,
      type: s.type,
      cronExpr: s.cronExpr,
      enabled: s.enabled,
    });
    scheduleModal.onOpen();
  };

  const handleSaveSchedule = async () => {
    if (!scheduleForm.name || !scheduleForm.cronExpr) {
      toast.error('请填写名称和 Cron 表达式');
      return;
    }
    try {
      if (editingSchedule) {
        await updateBackupSchedule({ id: editingSchedule.id, ...scheduleForm });
        toast.success('更新成功');
      } else {
        await createBackupSchedule(scheduleForm);
        toast.success('创建成功');
      }
      scheduleModal.onClose();
      loadSchedules();
    } catch {
      toast.error('保存失败');
    }
  };

  const handleDeleteSchedule = async (id: number) => {
    if (!confirm('确定删除此备份计划？')) return;
    try {
      await deleteBackupSchedule(id);
      toast.success('删除成功');
      loadSchedules();
    } catch {
      toast.error('删除失败');
    }
  };

  const handleToggleSchedule = async (s: BackupScheduleItem) => {
    try {
      await updateBackupSchedule({ ...s, enabled: s.enabled === 1 ? 0 : 1 });
      loadSchedules();
    } catch {
      toast.error('切换失败');
    }
  };

  return (
    <div className="p-4 max-w-7xl mx-auto space-y-4">
      <h1 className="text-2xl font-bold">备份管理</h1>

      <Tabs selectedKey={tab} onSelectionChange={(key) => setTab(key as string)}>
        {/* ===== Tab 1: 备份记录 ===== */}
        <Tab key="records" title="备份记录">
          <Card className="mt-4">
            <CardBody className="space-y-4">
              {/* Quick Actions */}
              <div className="flex flex-wrap gap-3 items-end">
                <Select
                  label="选择节点"
                  size="sm"
                  className="w-48"
                  selectedKeys={selectedNodeId ? [selectedNodeId] : []}
                  onSelectionChange={(keys) => {
                    const val = Array.from(keys)[0];
                    setSelectedNodeId(val ? String(val) : '');
                  }}
                >
                  {nodes.map((n: any) => (
                    <SelectItem key={String(n.id)}>{n.name || n.host}</SelectItem>
                  ))}
                </Select>
                <Button
                  color="primary"
                  size="sm"
                  isLoading={exporting}
                  onPress={handleExportGost}
                >
                  导出GOST配置
                </Button>

                <Select
                  label="选择实例"
                  size="sm"
                  className="w-48"
                  selectedKeys={selectedInstanceId ? [selectedInstanceId] : []}
                  onSelectionChange={(keys) => {
                    const val = Array.from(keys)[0];
                    setSelectedInstanceId(val ? String(val) : '');
                  }}
                >
                  {xuiInstances.map((inst: any) => (
                    <SelectItem key={String(inst.id)}>{inst.name || inst.host}</SelectItem>
                  ))}
                </Select>
                <Button
                  color="secondary"
                  size="sm"
                  isLoading={exporting}
                  onPress={handleExportXui}
                >
                  导出XUI配置
                </Button>

                <Button
                  color="warning"
                  size="sm"
                  isLoading={exporting}
                  onPress={handleBackupDatabase}
                >
                  数据库备份
                </Button>
              </div>

              {/* Type Filter */}
              <div className="flex gap-2 items-center">
                <span className="text-sm text-default-500">类型筛选：</span>
                {[
                  { key: 'all', label: '全部' },
                  { key: 'gost_config', label: 'GOST 配置' },
                  { key: 'xui_config', label: 'XUI 配置' },
                  { key: 'database', label: '数据库' },
                ].map(f => (
                  <Button
                    key={f.key}
                    size="sm"
                    variant={typeFilter === f.key ? 'solid' : 'flat'}
                    color={typeFilter === f.key ? 'primary' : 'default'}
                    onPress={() => setTypeFilter(f.key)}
                  >
                    {f.label}
                  </Button>
                ))}
              </div>

              {/* Records Table */}
              {recordsLoading ? (
                <div className="flex justify-center py-8"><Spinner /></div>
              ) : (
                <Table aria-label="备份记录">
                  <TableHeader>
                    <TableColumn>名称</TableColumn>
                    <TableColumn>类型</TableColumn>
                    <TableColumn>来源</TableColumn>
                    <TableColumn>触发方式</TableColumn>
                    <TableColumn>状态</TableColumn>
                    <TableColumn>时间</TableColumn>
                    <TableColumn>操作</TableColumn>
                  </TableHeader>
                  <TableBody emptyContent="暂无备份记录">
                    {filteredRecords.map(record => (
                      <TableRow key={record.id}>
                        <TableCell>{record.name}</TableCell>
                        <TableCell>
                          <Chip
                            size="sm"
                            color={TYPE_CHIP_MAP[record.type]?.color ?? 'default'}
                            variant="flat"
                          >
                            {TYPE_CHIP_MAP[record.type]?.label ?? record.type}
                          </Chip>
                        </TableCell>
                        <TableCell>{record.sourceName ?? '-'}</TableCell>
                        <TableCell>{record.triggerType === 'manual' ? '手动' : '定时'}</TableCell>
                        <TableCell>
                          <Chip
                            size="sm"
                            color={STATUS_CHIP_MAP[record.backupStatus]?.color ?? 'default'}
                            variant="flat"
                          >
                            {STATUS_CHIP_MAP[record.backupStatus]?.label ?? record.backupStatus}
                          </Chip>
                        </TableCell>
                        <TableCell>{formatTime(record.createdTime)}</TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="flat"
                              onPress={() => handleViewData(record)}
                            >
                              查看数据
                            </Button>
                            <Button
                              size="sm"
                              variant="flat"
                              color="danger"
                              onPress={() => handleDeleteRecord(record.id)}
                            >
                              删除
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardBody>
          </Card>
        </Tab>

        {/* ===== Tab 2: 备份计划 ===== */}
        <Tab key="schedules" title="备份计划">
          <Card className="mt-4">
            <CardBody className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-default-500 text-sm">
                  配置定时备份任务，系统将按计划自动执行备份
                </span>
                <Button color="primary" size="sm" onPress={openCreateSchedule}>
                  新建计划
                </Button>
              </div>

              {schedulesLoading ? (
                <div className="flex justify-center py-8"><Spinner /></div>
              ) : (
                <Table aria-label="备份计划">
                  <TableHeader>
                    <TableColumn>名称</TableColumn>
                    <TableColumn>类型</TableColumn>
                    <TableColumn>Cron 表达式</TableColumn>
                    <TableColumn>状态</TableColumn>
                    <TableColumn>操作</TableColumn>
                  </TableHeader>
                  <TableBody emptyContent="暂无备份计划">
                    {schedules.map(schedule => (
                      <TableRow key={schedule.id}>
                        <TableCell>{schedule.name}</TableCell>
                        <TableCell>
                          <Chip
                            size="sm"
                            color={TYPE_CHIP_MAP[schedule.type]?.color ?? 'default'}
                            variant="flat"
                          >
                            {TYPE_CHIP_MAP[schedule.type]?.label ?? schedule.type}
                          </Chip>
                        </TableCell>
                        <TableCell>
                          <code className="text-sm bg-default-100 px-2 py-0.5 rounded">
                            {schedule.cronExpr}
                          </code>
                        </TableCell>
                        <TableCell>
                          <Switch
                            size="sm"
                            isSelected={schedule.enabled === 1}
                            onValueChange={() => handleToggleSchedule(schedule)}
                          />
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="flat"
                              onPress={() => openEditSchedule(schedule)}
                            >
                              编辑
                            </Button>
                            <Button
                              size="sm"
                              variant="flat"
                              color="danger"
                              onPress={() => handleDeleteSchedule(schedule.id)}
                            >
                              删除
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardBody>
          </Card>
        </Tab>
      </Tabs>

      {/* ===== View Data Modal ===== */}
      <Modal isOpen={viewModal.isOpen} onOpenChange={viewModal.onOpenChange} size="3xl" scrollBehavior="inside">
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader>备份数据</ModalHeader>
              <ModalBody>
                <pre className="bg-default-100 p-4 rounded-lg text-sm overflow-auto max-h-[60vh] whitespace-pre-wrap">
                  {viewData}
                </pre>
              </ModalBody>
              <ModalFooter>
                <Button variant="flat" onPress={onClose}>关闭</Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>

      {/* ===== Schedule Form Modal ===== */}
      <Modal isOpen={scheduleModal.isOpen} onOpenChange={scheduleModal.onOpenChange} size="lg">
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader>{editingSchedule ? '编辑备份计划' : '新建备份计划'}</ModalHeader>
              <ModalBody className="space-y-4">
                <Input
                  label="计划名称"
                  value={scheduleForm.name}
                  onValueChange={(v) => setScheduleForm(prev => ({ ...prev, name: v }))}
                />
                <Select
                  label="备份类型"
                  selectedKeys={[scheduleForm.type]}
                  onSelectionChange={(keys) => {
                    const val = Array.from(keys)[0];
                    if (val) setScheduleForm(prev => ({ ...prev, type: String(val) }));
                  }}
                >
                  <SelectItem key="gost_config">GOST 配置</SelectItem>
                  <SelectItem key="xui_config">XUI 配置</SelectItem>
                  <SelectItem key="database">数据库</SelectItem>
                </Select>
                <Input
                  label="Cron 表达式"
                  placeholder="例如: 0 2 * * * (每天凌晨2点)"
                  value={scheduleForm.cronExpr}
                  onValueChange={(v) => setScheduleForm(prev => ({ ...prev, cronExpr: v }))}
                />
                <div className="flex items-center gap-2">
                  <Switch
                    isSelected={scheduleForm.enabled === 1}
                    onValueChange={(v) => setScheduleForm(prev => ({ ...prev, enabled: v ? 1 : 0 }))}
                  />
                  <span className="text-sm">{scheduleForm.enabled === 1 ? '已启用' : '已禁用'}</span>
                </div>
              </ModalBody>
              <ModalFooter>
                <Button variant="flat" onPress={onClose}>取消</Button>
                <Button color="primary" onPress={handleSaveSchedule}>保存</Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </div>
  );
}
