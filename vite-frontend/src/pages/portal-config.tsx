import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from "@heroui/button";
import { Card, CardBody, CardHeader } from "@heroui/card";
import { Chip } from "@heroui/chip";
import { Input, Textarea } from "@heroui/input";
import { Modal, ModalBody, ModalContent, ModalFooter, ModalHeader, useDisclosure } from "@heroui/modal";
import { Select, SelectItem } from "@heroui/select";
import { Spinner } from "@heroui/spinner";
import { Switch } from "@heroui/switch";
import toast from 'react-hot-toast';

import { getPortalLinks, PortalLink, savePortalLinks } from '@/api';
import { isAdmin } from '@/utils/auth';

interface PortalLinkForm {
  id?: string;
  groupName: string;
  title: string;
  href: string;
  description: string;
  abbr: string;
  environment: string;
  target: string;
  sortOrder: string;
  enabled: boolean;
}

const TARGET_OPTIONS = [
  { key: 'new_tab', label: '新窗口', description: '外部面板和探针建议新开标签页，避免中断当前 Flux 会话。' },
  { key: 'same_tab', label: '当前页', description: '适合站内路由或需要完整替换当前页面的入口。' },
];

const emptyForm = (): PortalLinkForm => ({
  groupName: '常用入口',
  title: '',
  href: '',
  description: '',
  abbr: '',
  environment: '',
  target: 'new_tab',
  sortOrder: '10',
  enabled: true,
});

const normalizeKeyword = (value?: string | null) => (value || '').trim().toLowerCase();
const isInternalLink = (href: string) => href.startsWith('/');

const sortPortalLinks = (items: PortalLink[]) =>
  [...items].sort((a, b) => {
    const groupCompare = (a.groupName || '').localeCompare(b.groupName || '', 'zh-CN');
    if (groupCompare !== 0) return groupCompare;
    const orderCompare = Number(a.sortOrder || 0) - Number(b.sortOrder || 0);
    if (orderCompare !== 0) return orderCompare;
    return (a.title || '').localeCompare(b.title || '', 'zh-CN');
  });

const buildTemporaryId = () => `portal_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

export default function PortalConfigPage() {
  const navigate = useNavigate();
  const admin = isAdmin();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [items, setItems] = useState<PortalLink[]>([]);
  const [originalItems, setOriginalItems] = useState<PortalLink[]>([]);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [form, setForm] = useState<PortalLinkForm>(emptyForm());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [editingId, setEditingId] = useState<string | null>(null);

  const {
    isOpen: isFormOpen,
    onOpen: onFormOpen,
    onClose: onFormClose,
  } = useDisclosure();

  useEffect(() => {
    if (!admin) {
      toast.error('权限不足，只有管理员可以访问导航配置');
      navigate('/dashboard', { replace: true });
      return;
    }
    void loadPortalLinks();
  }, [admin, navigate]);

  const loadPortalLinks = async () => {
    setLoading(true);
    try {
      const response = await getPortalLinks();
      if (response.code !== 0) {
        toast.error(response.msg || '加载导航配置失败');
        return;
      }
      const nextItems = sortPortalLinks(Array.isArray(response.data) ? response.data : []);
      setItems(nextItems);
      setOriginalItems(nextItems);
    } catch (error) {
      toast.error('加载导航配置失败');
    } finally {
      setLoading(false);
    }
  };

  const hasChanges = useMemo(
    () => JSON.stringify(items) !== JSON.stringify(originalItems),
    [items, originalItems]
  );

  const filteredItems = useMemo(() => {
    const keyword = normalizeKeyword(searchKeyword);
    if (!keyword) {
      return items;
    }
    return items.filter((item) => {
      const haystacks = [
        item.groupName,
        item.title,
        item.description,
        item.href,
        item.environment,
        item.abbr,
      ];
      return haystacks.some((value) => normalizeKeyword(value).includes(keyword));
    });
  }, [items, searchKeyword]);

  const summary = useMemo(() => ({
    total: items.length,
    enabled: items.filter((item) => item.enabled !== false).length,
    groups: new Set(items.map((item) => item.groupName || '常用入口')).size,
  }), [items]);

  const openCreateModal = () => {
    setEditingId(null);
    setErrors({});
    setForm({
      ...emptyForm(),
      sortOrder: String((items.length + 1) * 10),
    });
    onFormOpen();
  };

  const openEditModal = (item: PortalLink) => {
    setEditingId(item.id);
    setErrors({});
    setForm({
      id: item.id,
      groupName: item.groupName || '常用入口',
      title: item.title,
      href: item.href,
      description: item.description || '',
      abbr: item.abbr || '',
      environment: item.environment || '',
      target: item.target || 'new_tab',
      sortOrder: String(item.sortOrder || 10),
      enabled: item.enabled !== false,
    });
    onFormOpen();
  };

  const validateForm = () => {
    const nextErrors: Record<string, string> = {};
    if (!form.groupName.trim()) nextErrors.groupName = '分组名称不能为空';
    if (!form.title.trim()) nextErrors.title = '入口名称不能为空';
    if (!form.href.trim()) {
      nextErrors.href = '链接地址不能为空';
    } else if (!form.href.startsWith('/') && !/^https?:\/\//i.test(form.href.trim())) {
      nextErrors.href = '仅支持 http/https 或站内相对路径';
    }
    const sortOrder = Number(form.sortOrder);
    if (!Number.isFinite(sortOrder) || sortOrder < 0) {
      nextErrors.sortOrder = '排序值必须是大于等于 0 的数字';
    }
    if (form.abbr.trim().length > 4) {
      nextErrors.abbr = '缩写最多 4 个字符';
    }
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleLocalSave = () => {
    if (!validateForm()) return;

    const nextItem: PortalLink = {
      id: form.id || buildTemporaryId(),
      groupName: form.groupName.trim(),
      title: form.title.trim(),
      href: form.href.trim(),
      description: form.description.trim() || undefined,
      abbr: form.abbr.trim() || undefined,
      environment: form.environment.trim() || undefined,
      target: form.target,
      sortOrder: Number(form.sortOrder),
      enabled: form.enabled,
    };

    const nextItems = editingId
      ? items.map((item) => (item.id === editingId ? nextItem : item))
      : [...items, nextItem];

    setItems(sortPortalLinks(nextItems));
    onFormClose();
  };

  const handleDelete = (item: PortalLink) => {
    const shouldDelete = window.confirm(`确认删除导航入口“${item.title}”吗？`);
    if (!shouldDelete) {
      return;
    }
    setItems((current) => current.filter((entry) => entry.id !== item.id));
  };

  const handlePersist = async () => {
    setSaving(true);
    try {
      const response = await savePortalLinks(items);
      if (response.code !== 0) {
        toast.error(response.msg || '保存导航配置失败');
        return;
      }
      const savedItems = sortPortalLinks(Array.isArray(response.data) ? response.data : []);
      setItems(savedItems);
      setOriginalItems(savedItems);
      toast.success('导航配置已保存');
    } catch (error) {
      toast.error('保存导航配置失败');
    } finally {
      setSaving(false);
    }
  };

  const previewLink = (item: PortalLink) => {
    if (isInternalLink(item.href)) {
      if (item.target === 'same_tab') {
        navigate(item.href);
        return;
      }
      window.open(item.href, '_blank', 'noopener,noreferrer');
      return;
    }
    if (item.target === 'same_tab') {
      window.location.assign(item.href);
      return;
    }
    window.open(item.href, '_blank', 'noopener,noreferrer');
  };

  if (!admin) {
    return null;
  }

  if (loading) {
    return (
      <div className="flex min-h-[320px] items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="border border-divider/80 shadow-sm">
        <CardBody className="gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Chip size="sm" variant="flat" color="primary">Portal Config</Chip>
              <Chip size="sm" variant="flat">{summary.total} 个入口</Chip>
              <Chip size="sm" variant="flat" color="success">{summary.enabled} 个启用</Chip>
              <Chip size="sm" variant="flat">{summary.groups} 个分组</Chip>
            </div>
            <h1 className="mt-3 text-2xl font-bold">导航配置</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-default-500">
              这里维护 Flux 自定义导航面板的入口列表。当前版本对齐 Homepage 的轻量书签思路，先支持分组、缩写、描述、环境标记、跳转方式和启用状态。
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button as={Link} to="/portal" variant="flat">
              查看导航面板
            </Button>
            <Button variant="flat" onPress={() => void loadPortalLinks()}>
              重新加载
            </Button>
            <Button color="primary" onPress={openCreateModal}>
              新增入口
            </Button>
            <Button color="success" isLoading={saving} onPress={handlePersist} isDisabled={!hasChanges}>
              保存配置
            </Button>
          </div>
        </CardBody>
      </Card>

      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto]">
        <Input
          value={searchKeyword}
          onValueChange={setSearchKeyword}
          placeholder="按分组、名称、环境、URL 搜索"
        />
        {hasChanges ? (
          <Card className="border border-warning/30 bg-warning-50/70 shadow-sm">
            <CardBody className="px-4 py-3 text-sm text-warning-700">
              检测到未保存变更，保存后才会同步到导航面板。
            </CardBody>
          </Card>
        ) : (
          <Card className="border border-divider/80 shadow-sm">
            <CardBody className="px-4 py-3 text-sm text-default-500">
              当前配置已与后台同步。
            </CardBody>
          </Card>
        )}
      </div>

      {filteredItems.length === 0 ? (
        <Card className="border border-dashed border-divider/80 shadow-sm">
          <CardBody className="space-y-3 p-8 text-center">
            <h2 className="text-lg font-semibold text-foreground">暂无导航入口</h2>
            <p className="text-sm text-default-500">
              先新增几个最常用的探针、x-ui 面板或服务器管理入口。
            </p>
            <div>
              <Button color="primary" onPress={openCreateModal}>新增入口</Button>
            </div>
          </CardBody>
        </Card>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {filteredItems.map((item) => (
            <Card key={item.id} className="border border-divider/80 shadow-sm">
              <CardHeader className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="grid h-11 w-11 place-items-center rounded-2xl bg-primary/10 text-sm font-black tracking-[0.12em] text-primary">
                    {(item.abbr || item.title.slice(0, 2)).toUpperCase()}
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-base font-semibold">{item.title}</h2>
                      <Chip size="sm" variant="flat">{item.groupName}</Chip>
                      {item.environment ? (
                        <Chip size="sm" variant="flat" color="secondary">{item.environment}</Chip>
                      ) : null}
                    </div>
                    <p className="mt-1 text-sm text-default-500">{item.description || '未填写描述'}</p>
                  </div>
                </div>
                <Chip size="sm" color={item.enabled !== false ? 'success' : 'default'} variant="flat">
                  {item.enabled !== false ? '已启用' : '已停用'}
                </Chip>
              </CardHeader>
              <CardBody className="space-y-4 pt-0">
                <div className="space-y-2 text-sm text-default-500">
                  <p className="break-all"><span className="text-default-700">地址：</span>{item.href}</p>
                  <p><span className="text-default-700">打开方式：</span>{item.target === 'same_tab' ? '当前页' : '新窗口'}</p>
                  <p><span className="text-default-700">排序权重：</span>{item.sortOrder || 0}</p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="flat" color="primary" onPress={() => previewLink(item)}>
                    预览
                  </Button>
                  <Button size="sm" variant="flat" onPress={() => openEditModal(item)}>
                    编辑
                  </Button>
                  <Button size="sm" variant="flat" color="danger" onPress={() => handleDelete(item)}>
                    删除
                  </Button>
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      <Modal isOpen={isFormOpen} onOpenChange={(open) => !open && onFormClose()} size="3xl" scrollBehavior="inside">
        <ModalContent>
          <ModalHeader>{editingId ? '编辑导航入口' : '新增导航入口'}</ModalHeader>
          <ModalBody>
            <div className="rounded-3xl border border-primary/20 bg-primary-50/60 p-4 text-sm text-primary-700">
              <p className="font-medium">录入说明</p>
              <p className="mt-2">
                外部 URL 仅支持 <code>http://</code> 和 <code>https://</code>；站内跳转请填写以 <code>/</code> 开头的相对路径，例如 <code>/xui</code> 或 <code>/monitor</code>。
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Input
                label="分组名称"
                placeholder="例如 监控 / 面板 / 服务器"
                value={form.groupName}
                onValueChange={(value) => setForm((prev) => ({ ...prev, groupName: value }))}
                isInvalid={!!errors.groupName}
                errorMessage={errors.groupName}
                isRequired
              />
              <Input
                label="入口名称"
                placeholder="例如 DEV Pika Probe"
                value={form.title}
                onValueChange={(value) => setForm((prev) => ({ ...prev, title: value }))}
                isInvalid={!!errors.title}
                errorMessage={errors.title}
                isRequired
              />
              <Input
                label="链接地址"
                placeholder="https://example.com 或 /monitor"
                value={form.href}
                onValueChange={(value) => setForm((prev) => ({ ...prev, href: value }))}
                isInvalid={!!errors.href}
                errorMessage={errors.href}
                isRequired
              />
              <Input
                label="缩写"
                placeholder="例如 PK / XU"
                value={form.abbr}
                onValueChange={(value) => setForm((prev) => ({ ...prev, abbr: value }))}
                isInvalid={!!errors.abbr}
                errorMessage={errors.abbr}
              />
              <Input
                label="环境标记"
                placeholder="例如 DEV / PROD / HK"
                value={form.environment}
                onValueChange={(value) => setForm((prev) => ({ ...prev, environment: value }))}
              />
              <Input
                label="排序权重"
                type="number"
                value={form.sortOrder}
                onValueChange={(value) => setForm((prev) => ({ ...prev, sortOrder: value }))}
                isInvalid={!!errors.sortOrder}
                errorMessage={errors.sortOrder}
              />
            </div>

            <Select
              label="打开方式"
              selectedKeys={[form.target]}
              onSelectionChange={(keys) => setForm((prev) => ({ ...prev, target: Array.from(keys)[0] as string }))}
            >
              {TARGET_OPTIONS.map((option) => (
                <SelectItem key={option.key} description={option.description}>
                  {option.label}
                </SelectItem>
              ))}
            </Select>

            <Switch
              isSelected={form.enabled}
              onValueChange={(value) => setForm((prev) => ({ ...prev, enabled: value }))}
            >
              立即在导航面板中启用
            </Switch>

            <Textarea
              label="描述"
              placeholder="例如 查看香港节点探针状态和链路抖动"
              value={form.description}
              onValueChange={(value) => setForm((prev) => ({ ...prev, description: value }))}
              minRows={3}
            />
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={onFormClose}>取消</Button>
            <Button color="primary" onPress={handleLocalSave}>
              {editingId ? '保存到列表' : '加入列表'}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
}
