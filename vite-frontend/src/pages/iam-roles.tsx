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
  IamPermissionView,
  IamRoleDetail,
  IamRoleView,
  createIamRole,
  deleteIamRole,
  getIamPermissions,
  getIamRoleDetail,
  getIamRoleList,
  updateIamRole,
} from '@/api';

interface RoleForm {
  id?: number;
  code: string;
  name: string;
  description: string;
  roleScope: string;
  sortOrder: string;
  enabled: string;
  permissionIds: string[];
  builtin: number;
}

const roleScopeOptions = [
  { value: 'system', label: '系统角色' },
  { value: 'department', label: '部门角色' },
  { value: 'custom', label: '自定义角色' },
];

const moduleLabels: Record<string, string> = {
  dashboard: '首页看板',
  asset: '服务器资产',
  xui: 'X-UI / 代理面板',
  forward: '转发管理',
  tunnel: '隧道管理',
  monitor: '诊断看板',
  probe: '探针配置',
  alert: '告警中心',
  portal: '导航入口',
  server_dashboard: '服务器看板',
  site_config: '站点配置',
  protocol: '协议管理',
  tag: '标签管理',
  speed_limit: '限速规则',
  biz_user: '业务用户',
  iam_user: '组织用户',
  iam_role: '角色权限',
};

const emptyRoleForm = (): RoleForm => ({
  code: '',
  name: '',
  description: '',
  roleScope: 'custom',
  sortOrder: '100',
  enabled: '1',
  permissionIds: [],
  builtin: 0,
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
  builtin: detail.role.builtin || 0,
});

export default function IamRolesPage() {
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [roles, setRoles] = useState<IamRoleView[]>([]);
  const [permissions, setPermissions] = useState<IamPermissionView[]>([]);
  const [keyword, setKeyword] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [isEdit, setIsEdit] = useState(false);
  const [form, setForm] = useState<RoleForm>(emptyRoleForm());
  const [roleToDelete, setRoleToDelete] = useState<IamRoleView | null>(null);

  useEffect(() => {
    void bootstrap();
  }, []);

  const bootstrap = async () => {
    setLoading(true);
    try {
      const [rolesRes, permissionsRes] = await Promise.all([getIamRoleList(), getIamPermissions()]);
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

  const resetForm = () => {
    setForm(emptyRoleForm());
    setIsEdit(false);
    setDetailLoading(false);
  };

  const handleOpenCreate = () => {
    resetForm();
    setModalOpen(true);
  };

  const handleOpenEdit = async (role: IamRoleView) => {
    setIsEdit(true);
    setDetailLoading(true);
    setModalOpen(true);

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
            <Button color="primary" onPress={handleOpenCreate}>
              新建角色
            </Button>
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
                <th className="px-4 py-3 font-medium">范围</th>
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
                        {role.builtin === 1 && (
                          <Chip size="sm" color="warning" variant="flat">内置</Chip>
                        )}
                      </div>
                      <div className="font-mono text-xs uppercase tracking-[0.18em] text-default-400">{role.code}</div>
                      <div className="text-xs text-default-500">{role.description || '暂无角色说明'}</div>
                    </div>
                  </td>
                  <td className="px-4 py-4 align-top">
                    <Chip size="sm" variant="flat">
                      {roleScopeOptions.find((item) => item.value === role.roleScope)?.label || (role.roleScope || 'custom')}
                    </Chip>
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
                      <Button size="sm" variant="flat" color="primary" onPress={() => handleOpenEdit(role)}>
                        编辑
                      </Button>
                      <Button
                        size="sm"
                        variant="flat"
                        color="danger"
                        onPress={() => handleOpenDelete(role)}
                        isDisabled={role.builtin === 1}
                      >
                        删除
                      </Button>
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

                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="text-sm font-semibold">权限绑定</h3>
                          <p className="text-xs text-default-500">权限清单按模块分组，可按组全选或逐项收敛。</p>
                        </div>
                        <Chip size="sm" color="primary" variant="flat">
                          已选 {form.permissionIds.length} 项
                        </Chip>
                      </div>

                      <div className="space-y-4">
                        {groupedPermissions.map(([moduleKey, items]) => {
                          const selectedCount = items.filter((item) => form.permissionIds.includes(item.id.toString())).length;
                          return (
                            <div key={moduleKey} className="rounded-[22px] border border-divider p-4">
                              <div className="mb-3 flex items-center justify-between gap-3">
                                <div>
                                  <div className="font-semibold">{getModuleLabel(moduleKey)}</div>
                                  <div className="text-xs text-default-500">
                                    已选 {selectedCount} / {items.length}
                                  </div>
                                </div>
                                <Button
                                  size="sm"
                                  variant="flat"
                                  onPress={() => togglePermissionGroup(items)}
                                >
                                  {selectedCount === items.length ? '清空本组' : '全选本组'}
                                </Button>
                              </div>
                              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                                {items.map((permission) => {
                                  const selected = form.permissionIds.includes(permission.id.toString());
                                  return (
                                    <button
                                      key={permission.id}
                                      type="button"
                                      onClick={() => togglePermission(permission.id.toString())}
                                      className={`rounded-2xl border px-4 py-3 text-left transition-all ${
                                        selected
                                          ? 'border-primary bg-primary/8 shadow-sm'
                                          : 'border-divider hover:border-primary/40 hover:bg-default-100/70'
                                      }`}
                                    >
                                      <div className="flex items-center justify-between gap-3">
                                        <span className="font-medium">{permission.name}</span>
                                        <Chip size="sm" color={selected ? 'primary' : 'default'} variant="flat">
                                          {selected ? '已选' : '未选'}
                                        </Chip>
                                      </div>
                                      <div className="mt-1 font-mono text-[11px] text-default-400">{permission.code}</div>
                                      <div className="mt-2 text-xs text-default-500">
                                        {permission.description || '暂无说明'}
                                      </div>
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
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
