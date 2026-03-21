import { useEffect, useState, useCallback, useMemo } from 'react';
import { Card, CardBody, CardHeader } from "@heroui/card";
import { Chip } from "@heroui/chip";
import { Input } from "@heroui/input";
import { Button } from "@heroui/button";
import { Spinner } from "@heroui/spinner";
import { Select, SelectItem } from "@heroui/select";
import { Tabs, Tab } from "@heroui/tabs";
import {
  Modal, ModalContent, ModalHeader, ModalBody, ModalFooter
} from "@heroui/modal";
import {
  Table, TableHeader, TableColumn, TableBody, TableRow, TableCell
} from "@heroui/table";
import {
  ReactFlow, Background, Controls, MiniMap,
  useNodesState, useEdgesState,
  Position, MarkerType,
  type Node as RFNode, type Edge as RFEdge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';

import {
  getServerGroups, createServerGroup, updateServerGroup, deleteServerGroup,
  getGroupMembers, addGroupMember, removeGroupMember,
  getTopologyData, getGroupDashboard, getAssetList,
  ServerGroupItem, ServerGroupMemberItem, TopologyData,
} from '@/api';

// ─── Constants ───────────────────────────────────────────────────────

const NODE_COLORS: Record<string, string> = {
  entry: '#3b82f6',
  relay: '#22c55e',
  landing: '#94a3b8',
};

const NODE_LABELS: Record<string, string> = {
  entry: '入口',
  relay: '中转',
  landing: '落地',
};

// ─── Topology React Flow ─────────────────────────────────────────────

function TopologyFlow({ data }: { data: TopologyData | null }) {
  const navigate = useNavigate();

  const { initialNodes, initialEdges } = useMemo(() => {
    if (!data || !data.nodes?.length) return { initialNodes: [] as RFNode[], initialEdges: [] as RFEdge[] };

    const columns: Record<string, typeof data.nodes> = { entry: [], relay: [], landing: [] };
    for (const n of data.nodes) {
      const col = columns[n.type] ?? columns.landing;
      col.push(n);
    }

    const colOrder = ['entry', 'relay', 'landing'];
    const COL_GAP = 320, ROW_GAP = 100;

    const rfNodes: RFNode[] = [];
    colOrder.forEach((col, ci) => {
      const list = columns[col] || [];
      list.forEach((n, ri) => {
        const color = NODE_COLORS[n.type] ?? NODE_COLORS.landing;
        rfNodes.push({
          id: n.id,
          position: { x: ci * COL_GAP, y: ri * ROW_GAP },
          data: { label: n.name, ip: n.ip, type: n.type },
          sourcePosition: Position.Right,
          targetPosition: Position.Left,
          style: {
            background: 'white',
            border: `2px solid ${color}`,
            borderRadius: '12px',
            padding: '8px 14px',
            fontSize: '12px',
            minWidth: '170px',
            cursor: 'pointer',
          },
        });
      });
    });

    const rfEdges: RFEdge[] = (data.edges || []).map((edge, i) => ({
      id: `e-${i}`,
      source: edge.from,
      target: edge.to,
      label: edge.label || undefined,
      style: { stroke: '#a1a1aa', strokeWidth: 1.5 },
      markerEnd: { type: MarkerType.ArrowClosed, color: '#a1a1aa' },
      animated: true,
      labelStyle: { fontSize: 10, fill: '#71717a' },
    }));

    return { initialNodes: rfNodes, initialEdges: rfEdges };
  }, [data]);

  const [nodes, , onNodesChange] = useNodesState(initialNodes);
  const [edges, , onEdgesChange] = useEdgesState(initialEdges);

  if (!data || !data.nodes?.length) {
    return (
      <div className="flex items-center justify-center h-64 text-default-400">
        暂无拓扑数据。请确保资产已配置角色（入口/中转/落地）并创建了隧道。
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-divider/60 overflow-hidden" style={{ height: '65vh' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={(_, node) => {
          const d = node.data as { ip?: string };
          if (d.ip) navigate(`/assets?search=${encodeURIComponent(d.ip)}`);
        }}
        fitView
        attributionPosition="bottom-left"
      >
        <Background gap={20} size={1} />
        <Controls />
        <MiniMap
          nodeColor={(node) => {
            const d = node.data as { type?: string };
            return NODE_COLORS[d.type || 'landing'] || '#94a3b8';
          }}
          maskColor="rgb(240, 240, 240, 0.6)"
        />
      </ReactFlow>
    </div>
  );
}

// ─── Group Dashboard Stats ───────────────────────────────────────────

interface GroupDashboardData {
  total: number;
  online: number;
  offline: number;
  totalCost: number;
}

function GroupDashboardCard({ data }: { data: GroupDashboardData | null }) {
  if (!data) return null;
  const stats = [
    { label: '总数', value: data.total, color: 'default' as const },
    { label: '在线', value: data.online, color: 'success' as const },
    { label: '离线', value: data.offline, color: 'danger' as const },
    { label: '总费用', value: `¥${data.totalCost?.toFixed(2) ?? '0.00'}`, color: 'warning' as const },
  ];
  return (
    <div className="grid grid-cols-4 gap-3 mb-4">
      {stats.map(s => (
        <Card key={s.label} shadow="sm">
          <CardBody className="text-center py-3">
            <p className="text-xs text-default-500">{s.label}</p>
            <p className="text-lg font-semibold">
              <Chip size="sm" color={s.color} variant="flat">{s.value}</Chip>
            </p>
          </CardBody>
        </Card>
      ))}
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────

export default function TopologyPage() {
  const [activeTab, setActiveTab] = useState<string>('topology');

  // ── Topology state ──
  const [topoData, setTopoData] = useState<TopologyData | null>(null);
  const [topoLoading, setTopoLoading] = useState(false);

  // ── Groups state ──
  const [groups, setGroups] = useState<ServerGroupItem[]>([]);
  const [groupsLoading, setGroupsLoading] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<ServerGroupItem | null>(null);
  const [members, setMembers] = useState<ServerGroupMemberItem[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [dashboard, setDashboard] = useState<GroupDashboardData | null>(null);

  // ── Group CRUD modal ──
  const [groupModalOpen, setGroupModalOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<ServerGroupItem | null>(null);
  const [groupForm, setGroupForm] = useState({ name: '', description: '' });
  const [groupSaving, setGroupSaving] = useState(false);

  // ── Add member modal ──
  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const [allAssets, setAllAssets] = useState<{ id: number; name: string; primaryIp?: string | null }[]>([]);
  const [selectedAssetId, setSelectedAssetId] = useState<string>('');
  const [addingMember, setAddingMember] = useState(false);

  // ── Delete confirm ──
  const [deleteTarget, setDeleteTarget] = useState<ServerGroupItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  // ── Loaders ──

  const loadTopology = useCallback(async () => {
    setTopoLoading(true);
    try {
      const res = await getTopologyData();
      if (res.code === 0) {
        setTopoData(res.data);
      } else {
        toast.error(res.msg || '加载拓扑数据失败');
      }
    } catch {
      toast.error('加载拓扑数据失败');
    } finally {
      setTopoLoading(false);
    }
  }, []);

  const loadGroups = useCallback(async () => {
    setGroupsLoading(true);
    try {
      const res = await getServerGroups();
      if (res.code === 0) {
        setGroups(res.data ?? []);
      } else {
        toast.error(res.msg || '加载分组列表失败');
      }
    } catch {
      toast.error('加载分组列表失败');
    } finally {
      setGroupsLoading(false);
    }
  }, []);

  const loadMembers = useCallback(async (groupId: number) => {
    setMembersLoading(true);
    try {
      const res = await getGroupMembers(groupId);
      if (res.code === 0) {
        setMembers(res.data ?? []);
      } else {
        toast.error(res.msg || '加载分组成员失败');
      }
    } catch {
      toast.error('加载分组成员失败');
    } finally {
      setMembersLoading(false);
    }
  }, []);

  const loadDashboard = useCallback(async (groupId: number) => {
    try {
      const res = await getGroupDashboard(groupId);
      if (res.code === 0 && res.data) {
        setDashboard({
          total: res.data.totalCount,
          online: res.data.onlineCount,
          offline: res.data.offlineCount,
          totalCost: res.data.totalMonthlyCost,
        });
      }
    } catch { toast.error('加载拓扑数据失败'); }
  }, []);

  // ── Effects ──

  useEffect(() => {
    if (activeTab === 'topology') {
      loadTopology();
    } else {
      loadGroups();
    }
  }, [activeTab, loadTopology, loadGroups]);

  useEffect(() => {
    if (selectedGroup) {
      loadMembers(selectedGroup.id);
      loadDashboard(selectedGroup.id);
    } else {
      setMembers([]);
      setDashboard(null);
    }
  }, [selectedGroup, loadMembers, loadDashboard]);

  // ── Handlers ──

  const openCreateGroup = () => {
    setEditingGroup(null);
    setGroupForm({ name: '', description: '' });
    setGroupModalOpen(true);
  };

  const openEditGroup = (g: ServerGroupItem) => {
    setEditingGroup(g);
    setGroupForm({ name: g.name, description: g.description ?? '' });
    setGroupModalOpen(true);
  };

  const handleSaveGroup = async () => {
    if (!groupForm.name.trim()) {
      toast.error('请输入分组名称');
      return;
    }
    setGroupSaving(true);
    try {
      const payload = { name: groupForm.name.trim(), description: groupForm.description.trim() };
      const res = editingGroup
        ? await updateServerGroup({ id: editingGroup.id, ...payload })
        : await createServerGroup(payload);
      if (res.code === 0) {
        toast.success(editingGroup ? '分组已更新' : '分组已创建');
        setGroupModalOpen(false);
        loadGroups();
        if (editingGroup && selectedGroup?.id === editingGroup.id) {
          setSelectedGroup({ ...selectedGroup, ...payload } as ServerGroupItem);
        }
      } else {
        toast.error(res.msg || '保存分组失败');
      }
    } catch {
      toast.error('保存分组失败');
    } finally {
      setGroupSaving(false);
    }
  };

  const handleDeleteGroup = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await deleteServerGroup(deleteTarget.id);
      if (res.code === 0) {
        toast.success('分组已删除');
        setDeleteTarget(null);
        if (selectedGroup?.id === deleteTarget.id) setSelectedGroup(null);
        loadGroups();
      } else {
        toast.error(res.msg || '删除分组失败');
      }
    } catch {
      toast.error('删除分组失败');
    } finally {
      setDeleting(false);
    }
  };

  const openAddMember = async () => {
    setAddMemberOpen(true);
    setSelectedAssetId('');
    try {
      const res = await getAssetList();
      if (res.code === 0) {
        setAllAssets(res.data ?? []);
      }
    } catch { toast.error('加载资产列表失败'); }
  };

  const handleAddMember = async () => {
    if (!selectedGroup || !selectedAssetId) return;
    setAddingMember(true);
    try {
      const res = await addGroupMember(selectedGroup.id, Number(selectedAssetId));
      if (res.code === 0) {
        toast.success('成员已添加');
        setAddMemberOpen(false);
        loadMembers(selectedGroup.id);
        loadDashboard(selectedGroup.id);
      } else {
        toast.error(res.msg || '添加成员失败');
      }
    } catch {
      toast.error('添加成员失败');
    } finally {
      setAddingMember(false);
    }
  };

  const handleRemoveMember = async (memberId: number) => {
    if (!selectedGroup) return;
    if (!confirm('确定要从分组中移除该成员？')) return;
    try {
      const res = await removeGroupMember(memberId);
      if (res.code === 0) {
        toast.success('成员已移除');
        loadMembers(selectedGroup.id);
        loadDashboard(selectedGroup.id);
      } else {
        toast.error(res.msg || '移除成员失败');
      }
    } catch {
      toast.error('移除成员失败');
    }
  };

  // ── Available assets (exclude already in group) ──
  const availableAssets = useMemo(() => {
    const memberAssetIds = new Set(members.map(m => m.assetId));
    return allAssets.filter(a => !memberAssetIds.has(a.id));
  }, [allAssets, members]);

  // ─── Render ────────────────────────────────────────────────────────

  return (
    <div className="p-4 max-w-[1400px] mx-auto">
      <div className="mb-4">
        <h1 className="text-xl font-bold">拓扑与分组</h1>
      </div>

      <Tabs
        selectedKey={activeTab}
        onSelectionChange={(key) => setActiveTab(String(key))}
        variant="underlined"
        classNames={{ tabList: 'mb-4' }}
      >
        {/* ──────── Tab 1: 拓扑视图 ──────── */}
        <Tab key="topology" title="拓扑视图">
          <Card shadow="sm">
            <CardHeader className="flex justify-between items-center">
              <span className="font-semibold">网络拓扑</span>
              <Button size="sm" variant="flat" onPress={loadTopology} isLoading={topoLoading}>
                刷新
              </Button>
            </CardHeader>
            <CardBody>
              {topoLoading && !topoData ? (
                <div className="flex justify-center py-12"><Spinner /></div>
              ) : (
                <>
                  {/* Legend */}
                  <div className="flex gap-4 mb-4">
                    {Object.entries(NODE_LABELS).map(([type, label]) => (
                      <div key={type} className="flex items-center gap-1.5">
                        <span
                          className="inline-block w-3 h-3 rounded-sm"
                          style={{ backgroundColor: NODE_COLORS[type] }}
                        />
                        <span className="text-xs text-default-600">{label}</span>
                      </div>
                    ))}
                  </div>
                  <TopologyFlow data={topoData} />
                </>
              )}
            </CardBody>
          </Card>
        </Tab>

        {/* ──────── Tab 2: 服务器分组 ──────── */}
        <Tab key="groups" title="服务器分组">
          <div className="grid grid-cols-12 gap-4">
            {/* Left: group list */}
            <div className="col-span-4">
              <Card shadow="sm">
                <CardHeader className="flex justify-between items-center">
                  <span className="font-semibold">分组列表</span>
                  <Button size="sm" color="primary" variant="flat" onPress={openCreateGroup}>
                    新建分组
                  </Button>
                </CardHeader>
                <CardBody>
                  {groupsLoading ? (
                    <div className="flex justify-center py-8"><Spinner /></div>
                  ) : groups.length === 0 ? (
                    <p className="text-center text-default-400 py-8">暂无分组</p>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {groups.map(g => (
                        <div
                          key={g.id}
                          className={`p-3 rounded-lg cursor-pointer border transition-colors ${
                            selectedGroup?.id === g.id
                              ? 'border-primary bg-primary/5'
                              : 'border-default-200 hover:bg-default-100'
                          }`}
                          onClick={() => setSelectedGroup(g)}
                        >
                          <div className="flex justify-between items-center">
                            <span className="font-medium text-sm">{g.name}</span>
                            <div className="flex gap-1">
                              <Button
                                size="sm" variant="light" isIconOnly
                                onPress={() => openEditGroup(g)}
                              >
                                <span className="text-xs">编辑</span>
                              </Button>
                              <Button
                                size="sm" variant="light" color="danger" isIconOnly
                                onPress={() => setDeleteTarget(g)}
                              >
                                <span className="text-xs">删除</span>
                              </Button>
                            </div>
                          </div>
                          {g.description && (
                            <p className="text-xs text-default-400 mt-1 truncate">{g.description}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </CardBody>
              </Card>
            </div>

            {/* Right: group detail */}
            <div className="col-span-8">
              {selectedGroup ? (
                <Card shadow="sm">
                  <CardHeader className="flex justify-between items-center">
                    <span className="font-semibold">{selectedGroup.name} - 成员管理</span>
                    <Button size="sm" color="primary" variant="flat" onPress={openAddMember}>
                      添加成员
                    </Button>
                  </CardHeader>
                  <CardBody>
                    <GroupDashboardCard data={dashboard} />

                    {membersLoading ? (
                      <div className="flex justify-center py-8"><Spinner /></div>
                    ) : members.length === 0 ? (
                      <p className="text-center text-default-400 py-8">暂无成员，点击上方按钮添加</p>
                    ) : (
                      <Table aria-label="分组成员" removeWrapper>
                        <TableHeader>
                          <TableColumn>名称</TableColumn>
                          <TableColumn>IP</TableColumn>
                          <TableColumn width={80}>操作</TableColumn>
                        </TableHeader>
                        <TableBody emptyContent="暂无分组成员">
                          {members.map(m => (
                            <TableRow key={m.id}>
                              <TableCell>{m.assetName ?? `资产#${m.assetId}`}</TableCell>
                              <TableCell className="text-default-500 text-sm">{m.primaryIp ?? '-'}</TableCell>
                              <TableCell>
                                <Button
                                  size="sm" variant="light" color="danger"
                                  onPress={() => handleRemoveMember(m.id)}
                                >
                                  移除
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </CardBody>
                </Card>
              ) : (
                <Card shadow="sm">
                  <CardBody>
                    <p className="text-center text-default-400 py-12">请从左侧选择一个分组查看详情</p>
                  </CardBody>
                </Card>
              )}
            </div>
          </div>
        </Tab>
      </Tabs>

      {/* ──── Group Create/Edit Modal ──── */}
      <Modal isOpen={groupModalOpen} onClose={() => setGroupModalOpen(false)} isDismissable={!groupSaving}>
        <ModalContent>
          <ModalHeader>{editingGroup ? '编辑分组' : '新建分组'}</ModalHeader>
          <ModalBody>
            <Input
              label="分组名称"
              placeholder="请输入分组名称"
              value={groupForm.name}
              onValueChange={(v) => setGroupForm(f => ({ ...f, name: v }))}
              isRequired
            />
            <Input
              label="描述"
              placeholder="可选描述"
              value={groupForm.description}
              onValueChange={(v) => setGroupForm(f => ({ ...f, description: v }))}
            />
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={() => setGroupModalOpen(false)}>取消</Button>
            <Button color="primary" onPress={handleSaveGroup} isLoading={groupSaving}>
              {editingGroup ? '保存' : '创建'}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* ──── Delete Confirm Modal ──── */}
      <Modal isOpen={!!deleteTarget} onClose={() => setDeleteTarget(null)}>
        <ModalContent>
          <ModalHeader>确认删除</ModalHeader>
          <ModalBody>
            确定要删除分组 <strong>{deleteTarget?.name}</strong> 吗？此操作不可恢复。
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={() => setDeleteTarget(null)}>取消</Button>
            <Button color="danger" onPress={handleDeleteGroup} isLoading={deleting}>删除</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* ──── Add Member Modal ──── */}
      <Modal isOpen={addMemberOpen} onClose={() => setAddMemberOpen(false)}>
        <ModalContent>
          <ModalHeader>添加成员到 {selectedGroup?.name}</ModalHeader>
          <ModalBody>
            <Select
              label="选择资产"
              placeholder="请选择要添加的资产"
              selectedKeys={selectedAssetId ? [selectedAssetId] : []}
              onSelectionChange={(keys) => {
                const val = Array.from(keys)[0];
                setSelectedAssetId(val ? String(val) : '');
              }}
            >
              {availableAssets.map(a => (
                <SelectItem key={String(a.id)}>
                  {a.name}{a.primaryIp ? ` (${a.primaryIp})` : ''}
                </SelectItem>
              ))}
            </Select>
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={() => setAddMemberOpen(false)}>取消</Button>
            <Button
              color="primary"
              onPress={handleAddMember}
              isLoading={addingMember}
              isDisabled={!selectedAssetId}
            >
              添加
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
}
