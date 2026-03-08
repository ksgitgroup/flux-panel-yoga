import { ReactNode, useMemo } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { Chip } from "@heroui/chip";
import { siteConfig } from '@/config/site';

interface WorkspaceItem {
  key: string;
  label: string;
  path: string;
  group: string;
  search?: string;
  icon: ReactNode;
}

const navItems: WorkspaceItem[] = [
  {
    key: 'config-basic',
    label: '基础配置',
    path: '/config',
    search: 'section=basic',
    group: '网站配置',
    icon: (
      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h10" />
      </svg>
    ),
  },
  {
    key: 'config-security',
    label: '安全登录',
    path: '/config',
    search: 'section=security',
    group: '网站配置',
    icon: (
      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 11c0 1.105-.895 2-2 2m2-2a2 2 0 114 0m-4 0v3m4-3v3m5-5V7a2 2 0 00-2-2h-1V4a4 4 0 10-8 0v1H9a2 2 0 00-2 2v2m14 0v10a2 2 0 01-2 2H5a2 2 0 01-2-2V9m18 0H3" />
      </svg>
    ),
  },
  {
    key: 'config-diagnosis',
    label: '诊断配置',
    path: '/config',
    search: 'section=diagnosis',
    group: '网站配置',
    icon: (
      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <polyline strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} points="22 12 18 12 15 21 9 3 6 12 2 12" />
      </svg>
    ),
  },
  {
    key: 'config-alerting',
    label: '告警通知',
    path: '/config',
    search: 'section=alerting',
    group: '网站配置',
    icon: (
      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.4-1.4A2 2 0 0118 14.17V11a6 6 0 10-12 0v3.17a2 2 0 01-.6 1.43L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
      </svg>
    ),
  },
  {
    key: 'user',
    label: '用户管理',
    path: '/user',
    group: '系统资源',
    icon: (
      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5V18a4 4 0 00-4-4h-1m-4 6H7m6 0v-2a4 4 0 00-4-4H7m6 6a4 4 0 00-4-4m0 0a4 4 0 100-8 4 4 0 000 8m8 0a4 4 0 100-8 4 4 0 000 8" />
      </svg>
    ),
  },
  {
    key: 'limit',
    label: '限速管理',
    path: '/limit',
    group: '系统资源',
    icon: (
      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    key: 'protocol',
    label: '协议管理',
    path: '/protocol',
    group: '系统资源',
    icon: (
      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7h16M4 12h16M4 17h10" />
      </svg>
    ),
  },
  {
    key: 'tag',
    label: '标签管理',
    path: '/tag',
    group: '系统资源',
    icon: (
      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
      </svg>
    ),
  },
  {
    key: 'probe',
    label: '探针配置',
    path: '/probe',
    group: '外部集成',
    icon: (
      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="10" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6l4 2" />
      </svg>
    ),
  },
  {
    key: 'xui',
    label: 'X-UI 管理',
    path: '/xui',
    group: '外部集成',
    icon: (
      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7h16M7 12h10M10 17h4" />
      </svg>
    ),
  },
  {
    key: 'portal-config',
    label: '导航配置',
    path: '/portal/config',
    group: '外部集成',
    icon: (
      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M12 5l7 7-7 7" />
      </svg>
    ),
  },
];

export function SystemWorkspace({ children }: { children: ReactNode }) {
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const currentSection = searchParams.get('section') || 'basic';

  const groupedNav = useMemo(() => {
    return navItems.reduce<Record<string, WorkspaceItem[]>>((acc, item) => {
      acc[item.group] ||= [];
      acc[item.group].push(item);
      return acc;
    }, {});
  }, []);

  const isActive = (item: WorkspaceItem) => {
    if (location.pathname !== item.path) return false;
    if (!item.search) return true;
    return currentSection === new URLSearchParams(item.search).get('section');
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
      <aside className="space-y-4 lg:sticky lg:top-[84px] lg:self-start">
        <div className="rounded-[24px] border border-divider bg-white/90 p-3 shadow-sm dark:bg-default-100/10">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-2xl bg-primary/10 text-primary">
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h10" />
              </svg>
            </div>
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-[0.22em] text-default-400">System</p>
              <h2 className="truncate text-base font-semibold text-foreground">系统工作台</h2>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Chip size="sm" variant="flat" color="primary">{siteConfig.environment_name}</Chip>
            <Chip size="sm" variant="flat">{siteConfig.build_revision}</Chip>
          </div>
        </div>

        <div className="rounded-[24px] border border-divider bg-white/90 p-3 shadow-sm dark:bg-default-100/10">
          <div className="hidden lg:block space-y-4">
            {Object.entries(groupedNav).map(([group, items]) => (
              <div key={group}>
                <p className="px-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-default-400">{group}</p>
                <div className="mt-2 space-y-1">
                  {items.map((item) => (
                    <Link
                      key={item.key}
                      to={item.search ? `${item.path}?${item.search}` : item.path}
                      className={`flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium transition-all ${
                        isActive(item)
                          ? 'bg-primary text-white shadow-lg shadow-primary/20'
                          : 'text-default-600 hover:bg-default-100 dark:text-default-300 dark:hover:bg-default-100/10'
                      }`}
                    >
                      <span className="flex-shrink-0">{item.icon}</span>
                      <span>{item.label}</span>
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="flex gap-2 overflow-x-auto lg:hidden [scrollbar-width:none]">
            {navItems.map((item) => (
              <Link
                key={item.key}
                to={item.search ? `${item.path}?${item.search}` : item.path}
                className={`inline-flex min-w-max items-center gap-2 rounded-full px-3 py-2 text-xs font-medium transition-all ${
                  isActive(item)
                    ? 'bg-primary text-white shadow-lg shadow-primary/20'
                    : 'bg-default-100 text-default-600 dark:bg-default-100/10 dark:text-default-300'
                }`}
              >
                <span>{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            ))}
          </div>
        </div>
      </aside>

      <section className="min-w-0">
        {children}
      </section>
    </div>
  );
}
