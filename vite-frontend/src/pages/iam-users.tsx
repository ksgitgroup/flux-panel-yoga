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
  IamRoleView,
  IamUserView,
  createIamUser,
  deleteIamUser,
  getIamRoleList,
  getIamUserList,
  updateIamUser,
} from '@/api';

interface IamUserForm {
  id?: number;
  displayName: string;
  email: string;
  authSource: string;
  localUsername: string;
  password: string;
  mobile: string;
  jobTitle: string;
  dingtalkUserId: string;
  departmentPath: string;
  orgActive: string;
  enabled: string;
  remark: string;
  roleIds: string[];
}

const emptyUserForm = (): IamUserForm => ({
  displayName: '',
  email: '',
  authSource: 'dingtalk',
  localUsername: '',
  password: '',
  mobile: '',
  jobTitle: '',
  dingtalkUserId: '',
  departmentPath: '',
  orgActive: '1',
  enabled: '1',
  remark: '',
  roleIds: [],
});

const formatDateTime = (timestamp?: number | null) => {
  if (!timestamp) return '-';
  return new Date(timestamp).toLocaleString();
};

const toUserForm = (user: IamUserView): IamUserForm => ({
  id: user.id,
  displayName: user.displayName || '',
  email: user.email || '',
  authSource: user.authSource || 'dingtalk',
  localUsername: user.localUsername || '',
  password: '',
  mobile: user.mobile || '',
  jobTitle: user.jobTitle || '',
  dingtalkUserId: user.dingtalkUserId || '',
  departmentPath: user.departmentPath || '',
  orgActive: user.orgActive === 0 ? '0' : '1',
  enabled: user.enabled === 0 ? '0' : '1',
  remark: user.remark || '',
  roleIds: (user.roleIds || []).map((id) => id.toString()),
});

export default function IamUsersPage() {
  const [loading, setLoading] = useState(true);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [users, setUsers] = useState<IamUserView[]>([]);
  const [roles, setRoles] = useState<IamRoleView[]>([]);
  const [keyword, setKeyword] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [isEdit, setIsEdit] = useState(false);
  const [form, setForm] = useState<IamUserForm>(emptyUserForm());
  const [userToDelete, setUserToDelete] = useState<IamUserView | null>(null);

  useEffect(() => {
    void bootstrap();
  }, []);

  const bootstrap = async () => {
    setLoading(true);
    try {
      const [usersRes, rolesRes] = await Promise.all([getIamUserList(), getIamRoleList()]);
      if (usersRes.code !== 0) {
        toast.error(usersRes.msg || '加载组织用户失败');
      } else {
        setUsers(usersRes.data || []);
      }
      if (rolesRes.code !== 0) {
        toast.error(rolesRes.msg || '加载角色清单失败');
      } else {
        setRoles(rolesRes.data || []);
      }
    } catch (error) {
      toast.error('加载组织用户模块失败');
    } finally {
      setLoading(false);
    }
  };

  const loadUsers = async () => {
    const response = await getIamUserList();
    if (response.code === 0) {
      setUsers(response.data || []);
      return true;
    }
    toast.error(response.msg || '加载组织用户失败');
    return false;
  };

  const filteredUsers = useMemo(() => {
    const needle = keyword.trim().toLowerCase();
    if (!needle) {
      return users;
    }

    return users.filter((user) =>
      [
        user.displayName,
        user.email,
        user.localUsername,
        user.dingtalkUserId,
        user.departmentPath,
        ...(user.roleNames || []),
      ]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(needle))
    );
  }, [keyword, users]);

  const stats = useMemo(() => {
    const enabledCount = users.filter((user) => user.enabled === 1).length;
    const orgActiveCount = users.filter((user) => user.orgActive === 1).length;
    const dingtalkCount = users.filter((user) => user.authSource === 'dingtalk').length;
    return { enabledCount, orgActiveCount, dingtalkCount };
  }, [users]);

  const handleOpenCreate = () => {
    setIsEdit(false);
    setForm(emptyUserForm());
    setModalOpen(true);
  };

  const handleOpenEdit = (user: IamUserView) => {
    setIsEdit(true);
    setForm(toUserForm(user));
    setModalOpen(true);
  };

  const handleOpenDelete = (user: IamUserView) => {
    setUserToDelete(user);
    setDeleteModalOpen(true);
  };

  const validateForm = () => {
    if (!form.displayName.trim()) {
      toast.error('姓名不能为空');
      return false;
    }
    if (!form.email.trim()) {
      toast.error('企业邮箱不能为空');
      return false;
    }
    if (form.authSource === 'local' && !form.localUsername.trim()) {
      toast.error('本地认证用户必须填写登录名');
      return false;
    }
    if (form.authSource === 'local' && !isEdit && !form.password.trim()) {
      toast.error('本地认证用户必须设置密码');
      return false;
    }
    if (form.authSource === 'dingtalk' && !form.dingtalkUserId.trim()) {
      toast.error('钉钉认证用户必须填写 DingTalk UserId');
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
        displayName: form.displayName.trim(),
        email: form.email.trim(),
        authSource: form.authSource,
        localUsername: form.authSource === 'local' ? form.localUsername.trim() || undefined : undefined,
        mobile: form.mobile.trim() || undefined,
        jobTitle: form.jobTitle.trim() || undefined,
        dingtalkUserId: form.authSource === 'dingtalk' ? form.dingtalkUserId.trim() || undefined : undefined,
        departmentPath: form.departmentPath.trim() || undefined,
        orgActive: form.orgActive === '1' ? 1 : 0,
        enabled: form.enabled === '1' ? 1 : 0,
        remark: form.remark.trim() || undefined,
        roleIds: form.roleIds.map((id) => Number(id)),
      };

      if (form.password.trim()) {
        payload.password = form.password.trim();
      }
      if (isEdit && form.id) {
        payload.id = form.id;
      }

      const response = isEdit ? await updateIamUser(payload) : await createIamUser(payload);
      if (response.code === 0) {
        toast.success(isEdit ? '组织用户已更新' : '组织用户已创建');
        setModalOpen(false);
        setForm(emptyUserForm());
        await loadUsers();
      } else {
        toast.error(response.msg || (isEdit ? '更新组织用户失败' : '创建组织用户失败'));
      }
    } catch (error) {
      toast.error(isEdit ? '更新组织用户失败' : '创建组织用户失败');
    } finally {
      setSubmitLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!userToDelete) {
      return;
    }

    setDeleteLoading(true);
    try {
      const response = await deleteIamUser(userToDelete.id);
      if (response.code === 0) {
        toast.success('组织用户已删除');
        setDeleteModalOpen(false);
        setUserToDelete(null);
        await loadUsers();
      } else {
        toast.error(response.msg || '删除组织用户失败');
      }
    } catch (error) {
      toast.error('删除组织用户失败');
    } finally {
      setDeleteLoading(false);
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
              <h1 className="text-2xl font-bold">组织用户</h1>
              <Chip size="sm" color="primary" variant="flat">DingTalk Ready</Chip>
            </div>
            <p className="mt-2 text-sm text-default-500">
              这一层服务于企业内部操作员。首版先维护用户与角色绑定，后续再平滑接入钉钉登录。
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Input
              placeholder="搜索姓名、邮箱、钉钉 ID 或角色"
              value={keyword}
              onValueChange={setKeyword}
              className="sm:w-80"
            />
            <Button color="primary" onPress={handleOpenCreate}>
              新建组织用户
            </Button>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="border border-divider shadow-sm">
          <CardBody className="gap-2">
            <p className="text-sm text-default-500">组织用户总数</p>
            <p className="text-3xl font-semibold">{users.length}</p>
            <p className="text-xs text-default-400">仅用于后台企业操作员，不替代业务用户</p>
          </CardBody>
        </Card>
        <Card className="border border-divider shadow-sm">
          <CardBody className="gap-2">
            <p className="text-sm text-default-500">已启用</p>
            <p className="text-3xl font-semibold">{stats.enabledCount}</p>
            <p className="text-xs text-default-400">组织内活跃 {stats.orgActiveCount} 人</p>
          </CardBody>
        </Card>
        <Card className="border border-divider shadow-sm">
          <CardBody className="gap-2">
            <p className="text-sm text-default-500">钉钉认证占比</p>
            <p className="text-3xl font-semibold">{stats.dingtalkCount}</p>
            <p className="text-xs text-default-400">保留少量本地账号作为应急入口</p>
          </CardBody>
        </Card>
      </div>

      <div className="overflow-hidden rounded-[28px] border border-divider bg-white/90 shadow-sm dark:bg-default-100/10">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-default-100/70 text-left text-default-600 dark:bg-default-100/10">
              <tr>
                <th className="px-4 py-3 font-medium">成员</th>
                <th className="px-4 py-3 font-medium">认证</th>
                <th className="px-4 py-3 font-medium">角色</th>
                <th className="px-4 py-3 font-medium">组织状态</th>
                <th className="px-4 py-3 font-medium">最后登录</th>
                <th className="px-4 py-3 font-medium text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((user) => (
                <tr key={user.id} className="border-t border-divider/70">
                  <td className="px-4 py-4 align-top">
                    <div className="space-y-1">
                      <div className="font-semibold text-foreground">{user.displayName}</div>
                      <div className="text-xs text-default-500">{user.email}</div>
                      <div className="text-xs text-default-400">
                        {user.jobTitle || '未填写岗位'} {user.departmentPath ? `· ${user.departmentPath}` : ''}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-4 align-top">
                    <div className="space-y-2">
                      <Chip size="sm" color={user.authSource === 'dingtalk' ? 'primary' : 'warning'} variant="flat">
                        {user.authSource === 'dingtalk' ? '钉钉认证' : '本地认证'}
                      </Chip>
                      <div className="text-xs text-default-500">
                        {user.authSource === 'dingtalk'
                          ? (user.dingtalkUserId || '未绑定 DingTalk UserId')
                          : (user.localUsername || '未设置登录名')}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-4 align-top">
                    <div className="flex max-w-xs flex-wrap gap-2">
                      {(user.roleNames || []).length > 0 ? (
                        user.roleNames.map((roleName) => (
                          <Chip key={`${user.id}-${roleName}`} size="sm" variant="flat">
                            {roleName}
                          </Chip>
                        ))
                      ) : (
                        <span className="text-xs text-default-400">未绑定角色</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-4 align-top">
                    <div className="flex flex-wrap gap-2">
                      <Chip size="sm" color={user.enabled === 1 ? 'success' : 'default'} variant="flat">
                        {user.enabled === 1 ? '已启用' : '已停用'}
                      </Chip>
                      <Chip size="sm" color={user.orgActive === 1 ? 'primary' : 'warning'} variant="flat">
                        {user.orgActive === 1 ? '组织内' : '已脱离组织'}
                      </Chip>
                    </div>
                  </td>
                  <td className="px-4 py-4 align-top text-default-500">
                    <div>{formatDateTime(user.lastLoginAt)}</div>
                    <div className="mt-1 text-xs text-default-400">
                      最近同步 {formatDateTime(user.lastOrgSyncAt)}
                    </div>
                  </td>
                  <td className="px-4 py-4 align-top">
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="flat" color="primary" onPress={() => handleOpenEdit(user)}>
                        编辑
                      </Button>
                      <Button size="sm" variant="flat" color="danger" onPress={() => handleOpenDelete(user)}>
                        删除
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredUsers.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-default-500">
                    暂无符合条件的组织用户
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal isOpen={modalOpen} onOpenChange={setModalOpen} size="4xl" scrollBehavior="inside">
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader className="flex flex-col gap-1">
                {isEdit ? '编辑组织用户' : '新建组织用户'}
              </ModalHeader>
              <ModalBody>
                <div className="space-y-5">
                  <div className="grid gap-4 md:grid-cols-2">
                    <Input
                      label="姓名"
                      placeholder="请输入成员姓名"
                      value={form.displayName}
                      onValueChange={(value) => setForm((prev) => ({ ...prev, displayName: value }))}
                    />
                    <Input
                      label="企业邮箱"
                      placeholder="name@company.com"
                      value={form.email}
                      onValueChange={(value) => setForm((prev) => ({ ...prev, email: value }))}
                    />
                    <Select
                      label="认证来源"
                      selectedKeys={[form.authSource]}
                      onSelectionChange={(keys) => {
                        const value = Array.from(keys)[0] as string;
                        if (value) {
                          setForm((prev) => ({
                            ...prev,
                            authSource: value,
                            localUsername: value === 'local' ? prev.localUsername : '',
                            password: value === 'local' ? prev.password : '',
                            dingtalkUserId: value === 'dingtalk' ? prev.dingtalkUserId : '',
                          }));
                        }
                      }}
                    >
                      <SelectItem key="dingtalk">钉钉认证</SelectItem>
                      <SelectItem key="local">本地认证</SelectItem>
                    </Select>
                    <Input
                      label="岗位"
                      placeholder="例如 后端开发 / 行政 HR"
                      value={form.jobTitle}
                      onValueChange={(value) => setForm((prev) => ({ ...prev, jobTitle: value }))}
                    />
                    {form.authSource === 'local' ? (
                      <>
                        <Input
                          label="本地登录名"
                          placeholder="请输入登录用户名"
                          value={form.localUsername}
                          onValueChange={(value) => setForm((prev) => ({ ...prev, localUsername: value }))}
                        />
                        <Input
                          label={isEdit ? '重置密码' : '登录密码'}
                          type="password"
                          placeholder={isEdit ? '留空则保持原密码' : '请输入登录密码'}
                          value={form.password}
                          onValueChange={(value) => setForm((prev) => ({ ...prev, password: value }))}
                        />
                      </>
                    ) : (
                      <>
                        <Input
                          label="DingTalk UserId"
                          placeholder="用于后续钉钉 SSO 绑定"
                          value={form.dingtalkUserId}
                          onValueChange={(value) => setForm((prev) => ({ ...prev, dingtalkUserId: value }))}
                        />
                        <Input
                          label="部门路径"
                          placeholder="例如 技术中心 / 基础平台组"
                          value={form.departmentPath}
                          onValueChange={(value) => setForm((prev) => ({ ...prev, departmentPath: value }))}
                        />
                      </>
                    )}
                    <Input
                      label="手机号"
                      placeholder="可选，用于组织同步补充"
                      value={form.mobile}
                      onValueChange={(value) => setForm((prev) => ({ ...prev, mobile: value }))}
                    />
                    <Select
                      label="角色"
                      selectionMode="multiple"
                      selectedKeys={new Set(form.roleIds)}
                      onSelectionChange={(keys) => {
                        const values = keys === 'all'
                          ? roles.map((role) => role.id.toString())
                          : Array.from(keys).map((key) => key.toString());
                        setForm((prev) => ({ ...prev, roleIds: values }));
                      }}
                    >
                      {roles.map((role) => (
                        <SelectItem key={role.id.toString()} textValue={role.name}>
                          <div className="flex items-center justify-between gap-3">
                            <span>{role.name}</span>
                            <span className="font-mono text-[11px] text-default-400">{role.code}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </Select>
                    <Select
                      label="账号状态"
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
                    <Select
                      label="组织状态"
                      selectedKeys={[form.orgActive]}
                      onSelectionChange={(keys) => {
                        const value = Array.from(keys)[0] as string;
                        if (value) {
                          setForm((prev) => ({ ...prev, orgActive: value }));
                        }
                      }}
                    >
                      <SelectItem key="1">组织内有效</SelectItem>
                      <SelectItem key="0">已退出组织</SelectItem>
                    </Select>
                  </div>

                  <Textarea
                    label="备注"
                    placeholder="补充说明该成员的职责边界或使用限制"
                    value={form.remark}
                    onValueChange={(value) => setForm((prev) => ({ ...prev, remark: value }))}
                    minRows={2}
                  />
                </div>
              </ModalBody>
              <ModalFooter>
                <Button
                  variant="light"
                  onPress={() => {
                    onClose();
                    setForm(emptyUserForm());
                    setIsEdit(false);
                  }}
                >
                  取消
                </Button>
                <Button color="primary" onPress={handleSubmit} isLoading={submitLoading}>
                  保存组织用户
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
              <ModalHeader>删除组织用户</ModalHeader>
              <ModalBody>
                <p className="text-sm text-default-600">
                  将删除组织用户 <span className="font-semibold text-foreground">{userToDelete?.displayName}</span>。
                  这不会影响旧版业务用户模块，但会移除该成员的企业 IAM 绑定。
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
