import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from "@heroui/button";
import { Card, CardBody, CardHeader } from "@heroui/card";
import { Chip } from "@heroui/chip";
import { Input } from "@heroui/input";
import { Spinner } from "@heroui/spinner";
import toast from 'react-hot-toast';

import { getPortalLinks, PortalLink } from '@/api';
import { hasPermission } from '@/utils/auth';

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

const getLinkDescription = (item: PortalLink) => {
  if (item.description) {
    return item.description;
  }
  if (isInternalLink(item.href)) {
    return `站内路由 ${item.href}`;
  }
  try {
    const url = new URL(item.href);
    return url.hostname;
  } catch {
    return item.href;
  }
};

export default function PortalPage() {
  const navigate = useNavigate();
  const canViewPortal = hasPermission('portal.read');
  const canManagePortal = hasPermission('portal.write');
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<PortalLink[]>([]);
  const [searchKeyword, setSearchKeyword] = useState('');

  useEffect(() => {
    if (!canViewPortal) {
      toast.error('权限不足，无法访问自定义导航');
      navigate('/dashboard', { replace: true });
      return;
    }
    void loadPortalLinks();
  }, [canViewPortal, navigate]);

  const loadPortalLinks = async () => {
    setLoading(true);
    try {
      const response = await getPortalLinks();
      if (response.code !== 0) {
        toast.error(response.msg || '加载导航入口失败');
        return;
      }
      setItems(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      toast.error('加载导航入口失败');
    } finally {
      setLoading(false);
    }
  };

  const visibleItems = useMemo(() => {
    const keyword = normalizeKeyword(searchKeyword);
    const enabledItems = sortPortalLinks(items.filter((item) => item.enabled !== false));
    if (!keyword) {
      return enabledItems;
    }
    return enabledItems.filter((item) => {
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

  const groupedItems = useMemo(() => {
    const groups = new Map<string, PortalLink[]>();
    visibleItems.forEach((item) => {
      const groupName = item.groupName || '常用入口';
      if (!groups.has(groupName)) {
        groups.set(groupName, []);
      }
      groups.get(groupName)?.push(item);
    });
    return Array.from(groups.entries());
  }, [visibleItems]);

  const openPortalLink = (item: PortalLink) => {
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

  if (!canViewPortal) {
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
      <Card className="border border-divider/80 bg-[linear-gradient(135deg,rgba(14,165,233,0.08),rgba(59,130,246,0.04)_45%,rgba(255,255,255,0.92))] shadow-sm">
        <CardBody className="gap-5 p-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Chip size="sm" variant="flat" color="primary">Portal</Chip>
              <Chip size="sm" variant="flat">{items.filter((item) => item.enabled !== false).length} 个可用入口</Chip>
              <Chip size="sm" variant="flat">{new Set(items.filter((item) => item.enabled !== false).map((item) => item.groupName || '常用入口')).size} 个分组</Chip>
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">自定义导航</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-default-600">
                这里承载你自用的探针、节点面板、服务器后台和站内运维入口。当前版本先聚焦轻量书签导航，后面再逐步扩展到状态联动和统一入口面板。
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {canManagePortal ? (
              <Button as={Link} to="/portal/config" color="primary">
                管理导航入口
              </Button>
            ) : null}
            <Button variant="flat" onPress={() => void loadPortalLinks()}>
              刷新
            </Button>
          </div>
        </CardBody>
      </Card>

      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto]">
        <Input
          value={searchKeyword}
          onValueChange={setSearchKeyword}
          placeholder="按分组、名称、环境、地址筛选入口"
        />
        <Card className="border border-divider/80 shadow-sm">
          <CardBody className="flex flex-row items-center gap-3 px-4 py-3">
            <div className="rounded-2xl bg-primary/10 px-3 py-2 text-center">
              <div className="text-xs uppercase tracking-[0.18em] text-default-400">Open Mode</div>
              <div className="mt-1 text-sm font-semibold text-foreground">默认新窗口</div>
            </div>
            <p className="max-w-xs text-xs leading-5 text-default-500">
              支持站内路由和外部 URL。外部地址默认使用新标签打开，避免丢失当前 Flux 会话。
            </p>
          </CardBody>
        </Card>
      </div>

      {groupedItems.length === 0 ? (
        <Card className="border border-dashed border-divider/80 shadow-sm">
          <CardBody className="space-y-3 p-8 text-center">
            <h2 className="text-lg font-semibold text-foreground">还没有可展示的导航入口</h2>
            <p className="text-sm text-default-500">
              {canManagePortal
                ? '先到导航配置页新增几个常用入口，例如探针、x-ui 面板和服务器后台。'
                : '当前没有对你开放的导航入口，请联系管理员配置。'}
            </p>
            {canManagePortal ? (
              <div>
                <Button as={Link} to="/portal/config" color="primary">
                  去配置导航
                </Button>
              </div>
            ) : null}
          </CardBody>
        </Card>
      ) : (
        groupedItems.map(([groupName, groupItems]) => (
          <Card key={groupName} className="border border-divider/80 shadow-sm">
            <CardHeader className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">{groupName}</h2>
                <p className="text-sm text-default-500">{groupItems.length} 个入口</p>
              </div>
              <Chip size="sm" variant="flat" color="primary">{groupName}</Chip>
            </CardHeader>
            <CardBody className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {groupItems.map((item) => (
                <button
                  type="button"
                  key={item.id}
                  onClick={() => openPortalLink(item)}
                  className="rounded-[28px] border border-divider/80 bg-white/90 p-4 text-left transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/10 dark:bg-default-100/10"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div className="grid h-12 w-12 place-items-center rounded-2xl bg-primary/10 text-sm font-black tracking-[0.12em] text-primary">
                        {(item.abbr || item.title.slice(0, 2)).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="truncate text-base font-semibold text-foreground">{item.title}</h3>
                          {item.environment ? (
                            <Chip size="sm" variant="flat" color="secondary">{item.environment}</Chip>
                          ) : null}
                        </div>
                        <p className="mt-1 line-clamp-2 text-sm leading-6 text-default-500">{getLinkDescription(item)}</p>
                      </div>
                    </div>

                    <svg className="mt-1 h-4 w-4 flex-shrink-0 text-default-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 17L17 7M17 7H9M17 7v8" />
                    </svg>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <Chip size="sm" variant="flat">{isInternalLink(item.href) ? '站内入口' : '外部链接'}</Chip>
                    <Chip size="sm" variant="flat" color={item.target === 'same_tab' ? 'warning' : 'success'}>
                      {item.target === 'same_tab' ? '当前页打开' : '新窗口打开'}
                    </Chip>
                  </div>

                  <p className="mt-3 truncate text-xs text-default-400">{item.href}</p>
                </button>
              ))}
            </CardBody>
          </Card>
        ))
      )}
    </div>
  );
}
