import { useEffect, useMemo, useState } from 'react';
import { Button } from "@heroui/button";
import { Card, CardBody } from "@heroui/card";
import { Chip } from "@heroui/chip";
import { Input, Textarea } from "@heroui/input";
import { Select, SelectItem } from "@heroui/select";
import { Modal, ModalBody, ModalContent, ModalFooter, ModalHeader } from "@heroui/modal";
import { Spinner } from "@heroui/spinner";
import toast from 'react-hot-toast';

import {
  AssetHost,
  IamPermissionView,
  IamRoleDetail,
  IamRoleView,
  IamUserView,
  assignIamUserRoles,
  createIamRole,
  deleteIamRole,
  getAssetList,
  getIamPermissions,
  getIamRoleDetail,
  getIamRoleList,
  getIamUserList,
  updateIamRole,
} from '@/api';
import { hasPermission, getRoleCodes } from '@/utils/auth';

interface RoleForm {
  id?: number;
  code: string;
  name: string;
  description: string;
  roleScope: string;
  sortOrder: string;
  enabled: string;
  permissionIds: string[];
  assetScope: string;
  assetIds: string[];
  builtin: number;
  userIds: number[];
}

const roleScopeOptions = [
  { value: 'system', label: '系统角色' },
  { value: 'department', label: '部门角色' },
  { value: 'custom', label: '自定义角色' },
];

const moduleLabels: Record<string, string> = {
  dashboard: '首页看板',
  server_dashboard: '服务器看板',
  asset: '服务器资产',
  monitor: '监控探针',
  probe: '探针配置',
  alert: '告警中心',
  xui: 'X-UI / 代理',
  forward: '转发管理',
  tunnel: '隧道管理',
  node: '节点配置',
  portal: '导航入口',
  onepanel: '1Panel',
  topology: '网络拓扑',
  backup: '备份管理',
  ip_quality: 'IP质量',
  notification: '通知管理',
  traffic_analysis: '流量分析',
  audit: '审计日志',
  site_config: '站点配置',
  protocol: '协议管理',
  tag: '标签管理',
  speed_limit: '限速规则',
  biz_user: '业务用户',
  iam_user: '组织用户',
  iam_role: '角色权限',
  cost_analysis: '成本分析',
};

// 权限操作类型简称映射（不含已废弃的 write）
const actionLabels: Record<string, string> = {
  read: '查看',
  create: '新增',
  update: '编辑',
  delete: '删除',
  sync: '同步',
};

const emptyRoleForm = (): RoleForm => ({
  code: '',
  name: '',
  description: '',
  roleScope: 'custom',
  sortOrder: '100',
  enabled: '1',
  permissionIds: [],
  assetScope: 'ALL',
  assetIds: [],
  builtin: 0,
  userIds: [],
});

const formatDateTime = (timestamp?: number | null) => {
  if (!timestamp) return '-';
  return new Date(timestamp).toLocaleString();
};

const getModuleLabel = (moduleKey: string) => moduleLabels[moduleKey] || moduleKey.replace(/_/g, ' ').toUpperCase();

const toRoleForm = (detail: IamRoleDetail): RoleForm => ({
  id: detail.role.id,
  code: detail.role.code || '',
  name: detail.role.name || '',
  description: detail.role.description || '',
  roleScope: detail.role.roleScope || 'custom',
  sortOrder: detail.role.sortOrder?.toString() || '100',
  enabled: detail.role.enabled === 0 ? '0' : '1',
  permissionIds: (detail.permissionIds || []).map((id) => id.toString()),
  assetScope: detail.role.assetScope || 'ALL',
  assetIds: (detail.assetIds || []).map((id) => id.toString()),
  builtin: detail.role.builtin || 0,
  userIds: detail.userIds || [],
});

/** 安全解析标签字段（兼容 JSON 数组和逗号分隔两种格式） */
function parseTags(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
  } catch { /* fallback to comma split */ }
  return raw.split(',').map(t => t.trim()).filter(Boolean);
}

/** 从资产列表中提取唯一的筛选标签值 */
function extractFilterOptions(assets: AssetHost[]) {
  const tags = new Set<string>();
  const regions = new Set<string>();
  const osCategories = new Set<string>();
  const providers = new Set<string>();

  for (const a of assets) {
    parseTags(a.tags).forEach(t => tags.add(t));
    if (a.region) regions.add(a.region);
    if (a.osCategory) osCategories.add(a.osCategory);
    if (a.provider) providers.add(a.provider);
  }

  return {
    tags: [...tags].sort(),
    regions: [...regions].sort(),
    osCategories: [...osCategories].sort(),
    providers: [...providers].sort(),
  };
}

interface AssetFilters {
  tags: string[];
  regions: string[];
  osCategories: string[];
  providers: string[];
}

const emptyFilters = (): AssetFilters => ({ tags: [], regions: [], osCategories: [], providers: [] });

export default function IamRolesPage() {
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [roles, setRoles] = useState<IamRoleView[]>([]);
  const [permissions, setPermissions] = useState<IamPermissionView[]>([]);
  const [assets, setAssets] = useState<AssetHost[]>([]);
  const [allUsers, setAllUsers] = useState<IamUserView[]>([]);
  const [keyword, setKeyword] = useState('');
  const [assetKeyword, setAssetKeyword] = useState('');
  const [assetFilters, setAssetFilters] = useState<AssetFilters>(emptyFilters());
  const [userKeyword, setUserKeyword] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [isEdit, setIsEdit] = useState(false);
  const [form, setForm] = useState<RoleForm>(emptyRoleForm());
  const [roleToDelete, setRoleToDelete] = useState<IamRoleView | null>(null);
  const canWrite = hasPermission('iam_role.write') || hasPermission('iam_role.update');
  const isOwner = getRoleCodes().includes('OWNER');

  useEffect(() => {
    void bootstrap();
  }, []);

  const bootstrap = async () => {
    setLoading(true);
    try {
      const [rolesRes, permissionsRes, assetsRes, usersRes] = await Promise.all([
        getIamRoleList(),
        getIamPermissions(),
        getAssetList(),
        getIamUserList(),
      ]);
      if (rolesRes.code !== 0) {
        toast.error(rolesRes.msg || '加载角色列表失败');
      } else {
        setRoles(rolesRes.data || []);
      }
      if (permissionsRes.code !== 0) {
        toast.error(permissionsRes.msg || '加载权限清单失败');
      } else {
        setPermissions(permissionsRes.data || []);
      }
      if (assetsRes.code === 0) {
        setAssets(assetsRes.data || []);
      }
      if (usersRes.code === 0) {
        setAllUsers(usersRes.data || []);
      }
    } catch (error) {
      toast.error('加载角色权限模块失败');
    } finally {
      setLoading(false);
    }
  };

  const loadRoles = async () => {
    const response = await getIamRoleList();
    if (response.code === 0) {
      setRoles(response.data || []);
      return true;
    }
    toast.error(response.msg || '加载角色列表失败');
    return false;
  };

  const filteredRoles = useMemo(() => {
    const needle = keyword.trim().toLowerCase();
    if (!needle) {
      return roles;
    }
    return roles.filter((role) =>
      [role.code, role.name, role.description, role.roleScope]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(needle))
    );
  }, [keyword, roles]);

  const filterOptions = useMemo(() => extractFilterOptions(assets), [assets]);

  const filteredAssets = useMemo(() => {
    let list = assets;

    // 关键字筛选
    const needle = assetKeyword.trim().toLowerCase();
    if (needle) {
      list = list.filter((a) =>
        [a.name, a.label, a.primaryIp, a.region, a.provider]
          .filter(Boolean)
          .some((v) => v!.toLowerCase().includes(needle))
      );
    }

    // 标签筛选
    if (assetFilters.tags.length > 0) {
      list = list.filter((a) => {
        const assetTags = parseTags(a.tags);
        if (assetTags.length === 0) return false;
        return assetFilters.tags.some(t => assetTags.includes(t));
      });
    }

    // 地区筛选
    if (assetFilters.regions.length > 0) {
      list = list.filter((a) => a.region && assetFilters.regions.includes(a.region));
    }

    // OS 筛选
    if (assetFilters.osCategories.length > 0) {
      list = list.filter((a) => a.osCategory && assetFilters.osCategories.includes(a.osCategory));
    }

    // 供应商筛选
    if (assetFilters.providers.length > 0) {
      list = list.filter((a) => a.provider && assetFilters.providers.includes(a.provider));
    }

    return list;
  }, [assetKeyword, assetFilters, assets]);

  const groupedPermissions = useMemo(() => {
    const groups = permissions.reduce<Record<string, IamPermissionView[]>>((acc, permission) => {
      const key = permission.moduleKey || 'misc';
      acc[key] ||= [];
      acc[key].push(permission);
      return acc;
    }, {});

    return Object.entries(groups).sort(([a], [b]) => getModuleLabel(a).localeCompare(getModuleLabel(b), 'zh-CN'));
  }, [permissions]);

  const stats = useMemo(() => {
    const enabledRoles = roles.filter((role) => role.enabled === 1).length;
    const builtinRoles = roles.filter((role) => role.builtin === 1).length;
    const selectedPermissions = form.permissionIds.length;
    return { enabledRoles, builtinRoles, selectedPermissions };
  }, [form.permissionIds.length, roles]);

  // 角色关联的用户（编辑模式）
  const assignedUsers = useMemo(() =>
    allUsers.filter(u => form.userIds.includes(u.id)),
    [allUsers, form.userIds]
  );

  const unassignedUsers = useMemo(() => {
    const needle = userKeyword.trim().toLowerCase();
    return allUsers.filter(u => {
      if (form.userIds.includes(u.id)) return false;
      if (!needle) return true;
      return [u.displayName, u.email, u.localUsername]
        .filter(Boolean)
        .some(v => v!.toLowerCase().includes(needle));
    });
  }, [allUsers, form.userIds, userKeyword]);

  const resetForm = () => {
    setForm(emptyRoleForm());
    setIsEdit(false);
    setDetailLoading(false);
    setAssetKeyword('');
    setAssetFilters(emptyFilters());
    setUserKeyword('');
  };

  const handleOpenCreate = () => {
    resetForm();
    setModalOpen(true);
  };

  const handleOpenEdit = async (role: IamRoleView) => {
    setIsEdit(true);
    setDetailLoading(true);
    setModalOpen(true);
    setAssetKeyword('');
    setAssetFilters(emptyFilters());
    setUserKeyword('');

    try {
      const response = await getIamRoleDetail(role.id);
      if (response.code !== 0 || !response.data) {
        toast.error(response.msg || '加载角色详情失败');
        setModalOpen(false);
        resetForm();
        return;
      }
      setForm(toRoleForm(response.data));
    } catch (error) {
      toast.error('加载角色详情失败');
      setModalOpen(false);
      resetForm();
    } finally {
      setDetailLoading(false);
    }
  };

  const handleOpenDelete = (role: IamRoleView) => {
    if (role.builtin === 1) {
      toast.error('系统内置角色不允许删除');
      return;
    }
    setRoleToDelete(role);
    setDeleteModalOpen(true);
  };

  const validateForm = () => {
    if (!form.code.trim()) {
      toast.error('角色编码不能为空');
      return false;
    }
    if (!form.name.trim()) {
      toast.error('角色名称不能为空');
      return false;
    }
    return true;
  };

  const handleSubmit = async () => {
    if (!validateForm()) {
      return;
    }

    setSubmitLoading(true);
    try {
      const payload: Record<string, unknown> = {
        code: form.code.trim(),
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        roleScope: form.roleScope,
        sortOrder: form.sortOrder ? Number(form.sortOrder) : undefined,
        enabled: form.enabled === '1' ? 1 : 0,
        permissionIds: form.permissionIds.map((id) => Number(id)),
        assetScope: form.assetScope,
        assetIds: form.assetScope === 'SELECTED' ? form.assetIds.map((id) => Number(id)) : [],
      };
      if (isEdit && form.id) {
        payload.id = form.id;
      }

      const response = isEdit ? await updateIamRole(payload) : await createIamRole(payload);
      if (response.code === 0) {
        toast.success(isEdit ? '角色已更新' : '角色已创建');
        setModalOpen(false);
        resetForm();
        await loadRoles();
      } else {
        toast.error(response.msg || (isEdit ? '更新角色失败' : '创建角色失败'));
      }
    } catch (error) {
      toast.error(isEdit ? '更新角色失败' : '创建角色失败');
    } finally {
      setSubmitLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!roleToDelete) {
      return;
    }

    setDeleteLoading(true);
    try {
      const response = await deleteIamRole(roleToDelete.id);
      if (response.code === 0) {
        toast.success('角色已删除');
        setDeleteModalOpen(false);
        setRoleToDelete(null);
        await loadRoles();
      } else {
        toast.error(response.msg || '删除角色失败');
      }
    } catch (error) {
      toast.error('删除角色失败');
    } finally {
      setDeleteLoading(false);
    }
  };

  const togglePermission = (permissionId: string) => {
    setForm((prev) => {
      const exists = prev.permissionIds.includes(permissionId);
      return {
        ...prev,
        permissionIds: exists
          ? prev.permissionIds.filter((item) => item !== permissionId)
          : [...prev.permissionIds, permissionId],
      };
    });
  };

  const togglePermissionGroup = (items: IamPermissionView[]) => {
    const ids = items.map((item) => item.id.toString());
    const selectedCount = ids.filter((id) => form.permissionIds.includes(id)).length;
    const shouldSelectAll = selectedCount !== ids.length;

    setForm((prev) => {
      const current = new Set(prev.permissionIds);
      ids.forEach((id) => {
        if (shouldSelectAll) {
          current.add(id);
        } else {
          current.delete(id);
        }
      });
      return { ...prev, permissionIds: Array.from(current) };
    });
  };

  const toggleAsset = (assetId: string) => {
    setForm((prev) => {
      const exists = prev.assetIds.includes(assetId);
      return {
        ...prev,
        assetIds: exists
          ? prev.assetIds.filter((id) => id !== assetId)
          : [...prev.assetIds, assetId],
      };
    });
  };

  const toggleAllFilteredAssets = () => {
    const filteredIds = filteredAssets.map((a) => a.id.toString());
    const allSelected = filteredIds.every((id) => form.assetIds.includes(id));
    setForm((prev) => {
      const current = new Set(prev.assetIds);
      filteredIds.forEach((id) => {
        if (allSelected) {
          current.delete(id);
        } else {
          current.add(id);
        }
      });
      return { ...prev, assetIds: Array.from(current) };
    });
  };

  const toggleFilterValue = (category: keyof AssetFilters, value: string) => {
    setAssetFilters(prev => {
      const current = prev[category];
      const exists = current.includes(value);
      return {
        ...prev,
        [category]: exists ? current.filter(v => v !== value) : [...current, value],
      };
    });
  };

  const hasActiveFilters = assetFilters.tags.length > 0
    || assetFilters.regions.length > 0
    || assetFilters.osCategories.length > 0
    || assetFilters.providers.length > 0;

  /** 添加用户到当前角色 */
  const handleAddUser = async (userId: number) => {
    if (!form.id) {
      // 新建模式：仅在本地记录
      setForm(prev => ({ ...prev, userIds: [...prev.userIds, userId] }));
      return;
    }
    // 编辑模式：立即调用后端 API
    const user = allUsers.find(u => u.id === userId);
    const newRoleIds = [...(user?.roleIds || []), form.id];
    try {
      const res = await assignIamUserRoles(userId, newRoleIds);
      if (res.code === 0) {
        setForm(prev => ({ ...prev, userIds: [...prev.userIds, userId] }));
        // 刷新用户列表以获得最新 roleIds
        const usersRes = await getIamUserList();
        if (usersRes.code === 0) setAllUsers(usersRes.data || []);
        toast.success('用户已添加到角色');
      } else {
        toast.error(res.msg || '添加用户失败');
      }
    } catch {
      toast.error('添加用户失败');
    }
  };

  /** 从当前角色移除用户 */
  const handleRemoveUser = async (userId: number) => {
    if (!form.id) {
      setForm(prev => ({ ...prev, userIds: prev.userIds.filter(id => id !== userId) }));
      return;
    }
    const user = allUsers.find(u => u.id === userId);
    const newRoleIds = (user?.roleIds || []).filter(rid => rid !== form.id);
    try {
      const res = await assignIamUserRoles(userId, newRoleIds);
      if (res.code === 0) {
        setForm(prev => ({ ...prev, userIds: prev.userIds.filter(id => id !== userId) }));
        const usersRes = await getIamUserList();
        if (usersRes.code === 0) setAllUsers(usersRes.data || []);
        toast.success('用户已从角色移除');
      } else {
        toast.error(res.msg || '移除用户失败');
      }
    } catch {
      toast.error('移除用户失败');
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-[28px] border border-divider bg-white/90 p-5 shadow-sm dark:bg-default-100/10">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold">角色权限</h1>
              <Chip size="sm" color="primary" variant="flat">企业 IAM</Chip>
            </div>
            <p className="mt-2 text-sm text-default-500">
              这一层只管理企业内部操作员的角色与权限，不接管现有业务用户和旧登录链路。
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Input
              placeholder="搜索角色编码、名称或说明"
              value={keyword}
              onValueChange={setKeyword}
              className="sm:w-80"
            />
            {canWrite && (
              <Button color="primary" onPress={handleOpenCreate}>
                新建角色
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="border border-divider shadow-sm">
          <CardBody className="gap-2">
            <p className="text-sm text-default-500">角色总数</p>
            <p className="text-3xl font-semibold">{roles.length}</p>
            <p className="text-xs text-default-400">内置角色 {stats.builtinRoles} 个</p>
          </CardBody>
        </Card>
        <Card className="border border-divider shadow-sm">
          <CardBody className="gap-2">
            <p className="text-sm text-default-500">启用角色</p>
            <p className="text-3xl font-semibold">{stats.enabledRoles}</p>
            <p className="text-xs text-default-400">支持按角色维度封装企业职责</p>
          </CardBody>
        </Card>
        <Card className="border border-divider shadow-sm">
          <CardBody className="gap-2">
            <p className="text-sm text-default-500">权限清单</p>
            <p className="text-3xl font-semibold">{permissions.length}</p>
            <p className="text-xs text-default-400">当前编辑已选 {stats.selectedPermissions} 项</p>
          </CardBody>
        </Card>
      </div>

      <div className="overflow-hidden rounded-[28px] border border-divider bg-white/90 shadow-sm dark:bg-default-100/10">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-default-100/70 text-left text-default-600 dark:bg-default-100/10">
              <tr>
                <th className="px-4 py-3 font-medium">角色</th>
                <th className="px-4 py-3 font-medium">资产范围</th>
                <th className="px-4 py-3 font-medium">权限</th>
                <th className="px-4 py-3 font-medium">用户数</th>
                <th className="px-4 py-3 font-medium">状态</th>
                <th className="px-4 py-3 font-medium">更新时间</th>
                <th className="px-4 py-3 font-medium text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {filteredRoles.map((role) => (
                <tr key={role.id} className="border-t border-divider/70">
                  <td className="px-4 py-4 align-top">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-foreground">{role.name}</span>
                        {role.code === 'OWNER' ? (
                          <Chip size="sm" color="danger" variant="flat">创建者</Chip>
                        ) : role.builtin === 1 ? (
                          <Chip size="sm" color="warning" variant="flat">内置</Chip>
                        ) : null}
                      </div>
                      <div className="font-mono text-xs uppercase tracking-[0.18em] text-default-400">{role.code}</div>
                      <div className="text-xs text-default-500">{role.description || '暂无角色说明'}</div>
                    </div>
                  </td>
                  <td className="px-4 py-4 align-top">
                    {role.assetScope === 'SELECTED' ? (
                      <div>
                        <Chip size="sm" color="warning" variant="flat">指定资产</Chip>
                        <div className="text-xs text-default-400 mt-1">{role.assetCount || 0} 台</div>
                      </div>
                    ) : (
                      <Chip size="sm" color="success" variant="flat">全部资产</Chip>
                    )}
                  </td>
                  <td className="px-4 py-4 align-top">
                    <div className="font-semibold">{role.permissionCount}</div>
                    <div className="text-xs text-default-500">已关联权限项</div>
                  </td>
                  <td className="px-4 py-4 align-top">
                    <div className="font-semibold">{role.userCount}</div>
                    <div className="text-xs text-default-500">组织成员</div>
                  </td>
                  <td className="px-4 py-4 align-top">
                    <Chip size="sm" color={role.enabled === 1 ? 'success' : 'default'} variant="flat">
                      {role.enabled === 1 ? '启用' : '停用'}
                    </Chip>
                  </td>
                  <td className="px-4 py-4 align-top text-default-500">{formatDateTime(role.updatedTime)}</td>
                  <td className="px-4 py-4 align-top">
                    <div className="flex justify-end gap-2">
                      {role.code === 'OWNER' ? (
                        <Chip size="sm" variant="flat" color="default">不可修改</Chip>
                      ) : canWrite ? (
                        <>
                          <Button size="sm" variant="flat" color="primary" onPress={() => handleOpenEdit(role)}>
                            编辑
                          </Button>
                          <Button
                            size="sm"
                            variant="flat"
                            color="danger"
                            onPress={() => handleOpenDelete(role)}
                            isDisabled={role.builtin === 1 && !isOwner}
                          >
                            删除
                          </Button>
                        </>
                      ) : (
                        <Chip size="sm" variant="flat" color="default">只读</Chip>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {filteredRoles.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-default-500">
                    暂无符合条件的角色记录
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal
        isOpen={modalOpen}
        onOpenChange={setModalOpen}
        size="5xl"
        scrollBehavior="inside"
      >
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader className="flex flex-col gap-1">
                {isEdit ? '编辑角色' : '新建角色'}
              </ModalHeader>
              <ModalBody>
                {detailLoading ? (
                  <div className="flex h-64 items-center justify-center">
                    <Spinner size="lg" />
                  </div>
                ) : (
                  <div className="space-y-5">
                    <div className="grid gap-4 md:grid-cols-2">
                      <Input
                        label="角色编码"
                        placeholder="例如 DEV_ADMIN"
                        value={form.code}
                        onValueChange={(value) => setForm((prev) => ({ ...prev, code: value.toUpperCase() }))}
                        isDisabled={form.builtin === 1}
                        description={form.builtin === 1 ? '系统内置角色不允许修改编码' : '建议使用大写英文与下划线'}
                      />
                      <Input
                        label="角色名称"
                        placeholder="例如 开发管理员"
                        value={form.name}
                        onValueChange={(value) => setForm((prev) => ({ ...prev, name: value }))}
                      />
                      <Select
                        label="角色范围"
                        selectedKeys={[form.roleScope]}
                        onSelectionChange={(keys) => {
                          const value = Array.from(keys)[0] as string;
                          if (value) {
                            setForm((prev) => ({ ...prev, roleScope: value }));
                          }
                        }}
                      >
                        {roleScopeOptions.map((item) => (
                          <SelectItem key={item.value}>{item.label}</SelectItem>
                        ))}
                      </Select>
                      <div className="grid gap-4 md:grid-cols-2">
                        <Input
                          type="number"
                          label="排序权重"
                          value={form.sortOrder}
                          onValueChange={(value) => setForm((prev) => ({ ...prev, sortOrder: value }))}
                        />
                        <Select
                          label="状态"
                          selectedKeys={[form.enabled]}
                          onSelectionChange={(keys) => {
                            const value = Array.from(keys)[0] as string;
                            if (value) {
                              setForm((prev) => ({ ...prev, enabled: value }));
                            }
                          }}
                        >
                          <SelectItem key="1">启用</SelectItem>
                          <SelectItem key="0">停用</SelectItem>
                        </Select>
                      </div>
                    </div>

                    <Textarea
                      label="角色说明"
                      placeholder="描述这个角色的职责边界"
                      value={form.description}
                      onValueChange={(value) => setForm((prev) => ({ ...prev, description: value }))}
                      minRows={2}
                    />

                    {/* 权限绑定 */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="text-sm font-semibold">权限绑定</h3>
                          <p className="text-xs text-default-500">按模块勾选权限，点击模块名可全选/清空该组。</p>
                        </div>
                        <Chip size="sm" color="primary" variant="flat">
                          已选 {form.permissionIds.length} 项
                        </Chip>
                      </div>

                      <div className="rounded-xl border border-divider overflow-hidden">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="bg-default-100/60 dark:bg-default-50/30">
                              <th className="px-3 py-2 text-left font-medium text-default-600 w-[140px]">模块</th>
                              {(() => {
                                const allActions = new Set<string>();
                                groupedPermissions.forEach(([, items]) => {
                                  items.forEach(p => {
                                    const action = p.code.split('.').pop() || '';
                                    if (action !== 'write') allActions.add(action);
                                  });
                                });
                                const orderedActions = ['read', 'create', 'update', 'delete', 'sync']
                                  .filter(a => allActions.has(a));
                                return orderedActions.map(action => {
                                  // 收集该列所有模块的权限 ID
                                  const columnPermIds: string[] = [];
                                  groupedPermissions.forEach(([, items]) => {
                                    const p = items.find(i => i.code.split('.').pop() === action);
                                    if (p) columnPermIds.push(p.id.toString());
                                  });
                                  const selectedInColumn = columnPermIds.filter(id => form.permissionIds.includes(id)).length;
                                  const allSelected = selectedInColumn === columnPermIds.length && columnPermIds.length > 0;
                                  return (
                                    <th key={action} className="px-2 py-2 text-center font-medium text-default-600 w-[56px]">
                                      <button
                                        type="button"
                                        className="hover:text-primary transition-colors"
                                        title={allSelected ? `取消全部「${actionLabels[action] || action}」` : `全选「${actionLabels[action] || action}」`}
                                        onClick={() => {
                                          setForm(prev => {
                                            const current = new Set(prev.permissionIds);
                                            if (allSelected) {
                                              columnPermIds.forEach(id => current.delete(id));
                                            } else {
                                              columnPermIds.forEach(id => current.add(id));
                                            }
                                            return { ...prev, permissionIds: [...current] };
                                          });
                                        }}
                                      >
                                        <div>{actionLabels[action] || action}</div>
                                        <div className={`text-[10px] ${allSelected ? 'text-primary' : 'text-default-400'}`}>
                                          {selectedInColumn}/{columnPermIds.length}
                                        </div>
                                      </button>
                                    </th>
                                  );
                                });
                              })()}
                            </tr>
                          </thead>
                          <tbody>
                            {groupedPermissions.map(([moduleKey, items], idx) => {
                              const selectedCount = items.filter(p => form.permissionIds.includes(p.id.toString())).length;
                              const allActions = ['read', 'create', 'update', 'delete', 'sync'];
                              const permByAction: Record<string, IamPermissionView | undefined> = {};
                              items.forEach(p => {
                                const action = p.code.split('.').pop() || '';
                                if (action !== 'write') permByAction[action] = p;
                              });
                              const globalActions = new Set<string>();
                              groupedPermissions.forEach(([, its]) => {
                                its.forEach(p => {
                                  const a = p.code.split('.').pop() || '';
                                  if (a !== 'write') globalActions.add(a);
                                });
                              });
                              const visibleActions = allActions.filter(a => globalActions.has(a));

                              return (
                                <tr
                                  key={moduleKey}
                                  className={idx % 2 === 0 ? '' : 'bg-default-50/40 dark:bg-default-50/20'}
                                >
                                  <td className="px-3 py-1.5">
                                    <button
                                      type="button"
                                      className="text-left hover:text-primary transition-colors"
                                      title={selectedCount === items.length ? '清空本组' : '全选本组'}
                                      onClick={() => togglePermissionGroup(items)}
                                    >
                                      <div className="font-medium text-xs leading-tight">{getModuleLabel(moduleKey)}</div>
                                      <div className="text-[10px] text-default-400">{selectedCount}/{items.length}</div>
                                    </button>
                                  </td>
                                  {visibleActions.map(action => {
                                    const perm = permByAction[action];
                                    if (!perm) {
                                      return <td key={action} className="px-2 py-1.5 text-center text-default-300">-</td>;
                                    }
                                    const selected = form.permissionIds.includes(perm.id.toString());
                                    return (
                                      <td key={action} className="px-2 py-1.5 text-center">
                                        <button
                                          type="button"
                                          onClick={() => togglePermission(perm.id.toString())}
                                          className={`inline-flex items-center justify-center w-7 h-7 rounded-lg border transition-all ${
                                            selected
                                              ? 'border-primary bg-primary text-white shadow-sm'
                                              : 'border-default-300 hover:border-primary/60 text-default-400 hover:text-primary'
                                          }`}
                                          title={perm.description || perm.code}
                                        >
                                          {selected ? '✓' : ''}
                                        </button>
                                      </td>
                                    );
                                  })}
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* 资产范围 */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="text-sm font-semibold">资产范围</h3>
                          <p className="text-xs text-default-500">控制该角色可以查看和操作哪些服务器资产。</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant={form.assetScope === 'ALL' ? 'solid' : 'flat'}
                            color={form.assetScope === 'ALL' ? 'success' : 'default'}
                            onPress={() => setForm((prev) => ({ ...prev, assetScope: 'ALL' }))}
                          >
                            全部资产
                          </Button>
                          <Button
                            size="sm"
                            variant={form.assetScope === 'SELECTED' ? 'solid' : 'flat'}
                            color={form.assetScope === 'SELECTED' ? 'warning' : 'default'}
                            onPress={() => setForm((prev) => ({ ...prev, assetScope: 'SELECTED' }))}
                          >
                            指定资产
                          </Button>
                          {form.assetScope === 'SELECTED' && (
                            <Chip size="sm" color="warning" variant="flat">
                              已选 {form.assetIds.length} / {assets.length}
                            </Chip>
                          )}
                        </div>
                      </div>

                      {form.assetScope === 'SELECTED' && (
                        <div className="rounded-xl border border-divider overflow-hidden">
                          {/* 搜索栏 */}
                          <div className="flex items-center gap-2 px-3 py-2 bg-default-100/60 dark:bg-default-50/30 border-b border-divider">
                            <Input
                              size="sm"
                              placeholder="搜索服务器名称、IP、地区..."
                              value={assetKeyword}
                              onValueChange={setAssetKeyword}
                              className="flex-1"
                            />
                            {hasActiveFilters && (
                              <Button size="sm" variant="flat" color="danger" onPress={() => setAssetFilters(emptyFilters())}>
                                清除筛选
                              </Button>
                            )}
                          </div>

                          {/* 快速筛选 chips */}
                          <div className="px-3 py-2 border-b border-divider space-y-1.5 bg-default-50/40 dark:bg-default-50/20">
                            {filterOptions.tags.length > 0 && (
                              <div className="flex flex-wrap items-center gap-1">
                                <span className="text-[10px] text-default-400 w-12 shrink-0">标签</span>
                                {filterOptions.tags.map(tag => (
                                  <Chip
                                    key={`tag-${tag}`}
                                    size="sm"
                                    variant={assetFilters.tags.includes(tag) ? 'solid' : 'flat'}
                                    color={assetFilters.tags.includes(tag) ? 'primary' : 'default'}
                                    className="cursor-pointer text-[11px]"
                                    onClick={() => toggleFilterValue('tags', tag)}
                                  >
                                    {tag}
                                  </Chip>
                                ))}
                              </div>
                            )}
                            {filterOptions.regions.length > 0 && (
                              <div className="flex flex-wrap items-center gap-1">
                                <span className="text-[10px] text-default-400 w-12 shrink-0">地区</span>
                                {filterOptions.regions.map(r => (
                                  <Chip
                                    key={`region-${r}`}
                                    size="sm"
                                    variant={assetFilters.regions.includes(r) ? 'solid' : 'flat'}
                                    color={assetFilters.regions.includes(r) ? 'secondary' : 'default'}
                                    className="cursor-pointer text-[11px]"
                                    onClick={() => toggleFilterValue('regions', r)}
                                  >
                                    {r}
                                  </Chip>
                                ))}
                              </div>
                            )}
                            {filterOptions.osCategories.length > 0 && (
                              <div className="flex flex-wrap items-center gap-1">
                                <span className="text-[10px] text-default-400 w-12 shrink-0">系统</span>
                                {filterOptions.osCategories.map(os => (
                                  <Chip
                                    key={`os-${os}`}
                                    size="sm"
                                    variant={assetFilters.osCategories.includes(os) ? 'solid' : 'flat'}
                                    color={assetFilters.osCategories.includes(os) ? 'success' : 'default'}
                                    className="cursor-pointer text-[11px]"
                                    onClick={() => toggleFilterValue('osCategories', os)}
                                  >
                                    {os}
                                  </Chip>
                                ))}
                              </div>
                            )}
                            {filterOptions.providers.length > 0 && (
                              <div className="flex flex-wrap items-center gap-1">
                                <span className="text-[10px] text-default-400 w-12 shrink-0">厂商</span>
                                {filterOptions.providers.map(p => (
                                  <Chip
                                    key={`provider-${p}`}
                                    size="sm"
                                    variant={assetFilters.providers.includes(p) ? 'solid' : 'flat'}
                                    color={assetFilters.providers.includes(p) ? 'warning' : 'default'}
                                    className="cursor-pointer text-[11px]"
                                    onClick={() => toggleFilterValue('providers', p)}
                                  >
                                    {p}
                                  </Chip>
                                ))}
                              </div>
                            )}
                          </div>

                          {/* 资产列表 */}
                          <div className="max-h-[280px] overflow-y-auto">
                            {filteredAssets.length === 0 ? (
                              <div className="px-4 py-8 text-center text-default-400 text-sm">暂无匹配资产</div>
                            ) : (
                              <table className="w-full text-sm">
                                <thead>
                                  <tr className="bg-default-50/60 dark:bg-default-50/20 border-b border-divider/50">
                                    <th className="px-3 py-1.5 w-8">
                                      <button
                                        type="button"
                                        onClick={toggleAllFilteredAssets}
                                        className={`inline-flex items-center justify-center w-5 h-5 rounded border transition-all ${
                                          filteredAssets.length > 0 && filteredAssets.every((a) => form.assetIds.includes(a.id.toString()))
                                            ? 'border-primary bg-primary text-white'
                                            : 'border-default-300 hover:border-primary/60'
                                        }`}
                                      >
                                        {filteredAssets.length > 0 && filteredAssets.every((a) => form.assetIds.includes(a.id.toString())) && <span className="text-xs">✓</span>}
                                      </button>
                                    </th>
                                    <th className="py-1.5 text-left text-[10px] font-medium text-default-400">
                                      {filteredAssets.length > 0 && filteredAssets.every((a) => form.assetIds.includes(a.id.toString()))
                                        ? `取消全选 (${filteredAssets.length})`
                                        : `全选 (${filteredAssets.length})`}
                                    </th>
                                    <th className="px-2 py-1.5 text-[10px] font-medium text-default-400">IP</th>
                                    <th className="px-2 py-1.5 text-[10px] font-medium text-default-400">地区</th>
                                    <th className="px-2 py-1.5 text-[10px] font-medium text-default-400">厂商</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {filteredAssets.map((asset, idx) => {
                                    const selected = form.assetIds.includes(asset.id.toString());
                                    return (
                                      <tr
                                        key={asset.id}
                                        className={`cursor-pointer transition-colors hover:bg-primary-50/50 ${
                                          idx % 2 !== 0 ? 'bg-default-50/40 dark:bg-default-50/20' : ''
                                        } ${selected ? 'bg-primary-50/30' : ''}`}
                                        onClick={() => toggleAsset(asset.id.toString())}
                                      >
                                        <td className="px-3 py-2 w-8">
                                          <div className={`inline-flex items-center justify-center w-5 h-5 rounded border transition-all ${
                                            selected
                                              ? 'border-primary bg-primary text-white'
                                              : 'border-default-300'
                                          }`}>
                                            {selected && <span className="text-xs">✓</span>}
                                          </div>
                                        </td>
                                        <td className="py-2">
                                          <div className="font-medium text-xs">{asset.name}</div>
                                          {asset.label && <div className="text-[10px] text-default-400">{asset.label}</div>}
                                        </td>
                                        <td className="px-2 py-2 text-xs text-default-500">{asset.primaryIp || '-'}</td>
                                        <td className="px-2 py-2 text-xs text-default-400">{asset.region || '-'}</td>
                                        <td className="px-2 py-2 text-xs text-default-400">{asset.provider || '-'}</td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            )}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* 关联用户 */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="text-sm font-semibold">关联用户</h3>
                          <p className="text-xs text-default-500">查看和管理哪些组织成员拥有此角色。</p>
                        </div>
                        <Chip size="sm" color="secondary" variant="flat">
                          {assignedUsers.length} 人
                        </Chip>
                      </div>

                      {/* 已关联的用户列表 */}
                      {assignedUsers.length > 0 && (
                        <div className="rounded-xl border border-divider overflow-hidden">
                          <div className="px-3 py-2 bg-default-100/60 dark:bg-default-50/30 border-b border-divider">
                            <span className="text-xs font-medium text-default-600">已关联成员</span>
                          </div>
                          <div className="max-h-[180px] overflow-y-auto">
                            {assignedUsers.map((user, idx) => (
                              <div
                                key={user.id}
                                className={`flex items-center justify-between px-3 py-2 ${
                                  idx % 2 !== 0 ? 'bg-default-50/40 dark:bg-default-50/20' : ''
                                }`}
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <div className="w-7 h-7 rounded-full bg-secondary/20 flex items-center justify-center text-xs font-medium text-secondary shrink-0">
                                    {(user.displayName || '?')[0]}
                                  </div>
                                  <div className="min-w-0">
                                    <div className="text-xs font-medium truncate">{user.displayName}</div>
                                    <div className="text-[10px] text-default-400 truncate">{user.email || user.localUsername || '-'}</div>
                                  </div>
                                  <Chip size="sm" variant="flat" color={user.authSource === 'dingtalk' ? 'primary' : 'default'} className="text-[10px]">
                                    {user.authSource === 'dingtalk' ? '钉钉' : '本地'}
                                  </Chip>
                                </div>
                                <Button
                                  size="sm"
                                  variant="light"
                                  color="danger"
                                  onPress={() => handleRemoveUser(user.id)}
                                >
                                  移除
                                </Button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* 添加用户 */}
                      <div className="rounded-xl border border-divider overflow-hidden">
                        <div className="flex items-center gap-2 px-3 py-2 bg-default-100/60 dark:bg-default-50/30 border-b border-divider">
                          <Input
                            size="sm"
                            placeholder="搜索用户名、邮箱..."
                            value={userKeyword}
                            onValueChange={setUserKeyword}
                            className="flex-1"
                          />
                        </div>
                        <div className="max-h-[180px] overflow-y-auto">
                          {unassignedUsers.length === 0 ? (
                            <div className="px-4 py-6 text-center text-default-400 text-xs">
                              {userKeyword ? '无匹配用户' : '所有用户均已关联此角色'}
                            </div>
                          ) : (
                            unassignedUsers.map((user, idx) => (
                              <div
                                key={user.id}
                                className={`flex items-center justify-between px-3 py-2 ${
                                  idx % 2 !== 0 ? 'bg-default-50/40 dark:bg-default-50/20' : ''
                                }`}
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <div className="w-7 h-7 rounded-full bg-default-200 flex items-center justify-center text-xs font-medium text-default-500 shrink-0">
                                    {(user.displayName || '?')[0]}
                                  </div>
                                  <div className="min-w-0">
                                    <div className="text-xs font-medium truncate">{user.displayName}</div>
                                    <div className="text-[10px] text-default-400 truncate">{user.email || user.localUsername || '-'}</div>
                                  </div>
                                  {user.roleNames.length > 0 && (
                                    <div className="flex gap-1">
                                      {user.roleNames.slice(0, 2).map(rn => (
                                        <Chip key={rn} size="sm" variant="flat" className="text-[10px]">{rn}</Chip>
                                      ))}
                                      {user.roleNames.length > 2 && (
                                        <Chip size="sm" variant="flat" className="text-[10px]">+{user.roleNames.length - 2}</Chip>
                                      )}
                                    </div>
                                  )}
                                </div>
                                <Button
                                  size="sm"
                                  variant="flat"
                                  color="primary"
                                  onPress={() => handleAddUser(user.id)}
                                >
                                  添加
                                </Button>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </ModalBody>
              <ModalFooter>
                <Button
                  variant="light"
                  onPress={() => {
                    onClose();
                    resetForm();
                  }}
                >
                  取消
                </Button>
                <Button color="primary" onPress={handleSubmit} isLoading={submitLoading || detailLoading}>
                  保存角色
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>

      <Modal isOpen={deleteModalOpen} onOpenChange={setDeleteModalOpen}>
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader>删除角色</ModalHeader>
              <ModalBody>
                <p className="text-sm text-default-600">
                  将删除角色 <span className="font-semibold text-foreground">{roleToDelete?.name}</span>。
                  已关联用户的角色无法删除。
                </p>
              </ModalBody>
              <ModalFooter>
                <Button variant="light" onPress={onClose}>取消</Button>
                <Button color="danger" onPress={handleDelete} isLoading={deleteLoading}>
                  确认删除
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </div>
  );
}
