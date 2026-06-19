import type { Metadata } from 'next';
import { AdminPage } from '@/components/features/admin/layout/AdminPage';
import { AdminSystemMap } from '@/components/features/admin/system-map/AdminSystemMap';
import { NOINDEX_ROBOTS } from '@/lib/seo/noindex-metadata';

export const metadata: Metadata = {
  title: 'System Map | Admin',
  robots: NOINDEX_ROBOTS,
};

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export type SystemMapTab = 'skills' | 'connectors' | 'tools' | 'memory';

const SYSTEM_MAP_TABS = [
  { value: 'skills' as const, label: 'Skills' },
  { value: 'connectors' as const, label: 'Connectors' },
  { value: 'tools' as const, label: 'Tools' },
  { value: 'memory' as const, label: 'Memory' },
];

function resolveTab(value: string | undefined): SystemMapTab {
  const valid: SystemMapTab[] = ['skills', 'connectors', 'tools', 'memory'];
  return valid.includes(value as SystemMapTab)
    ? (value as SystemMapTab)
    : 'skills';
}

interface Props {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function AdminSystemPage({ searchParams }: Props) {
  const params = await searchParams;
  const rawTab = Array.isArray(params.tab) ? params.tab[0] : params.tab;
  const activeTab = resolveTab(rawTab);

  return (
    <AdminPage
      title='System Map'
      description='Read-only overview of skills, connectors, tools, and memory — separation of concerns for the platform.'
      testId='admin-system-page'
      viewTestId='admin-system-content'
      tabs={{
        param: 'tab',
        value: activeTab,
        options: SYSTEM_MAP_TABS,
      }}
    >
      <AdminSystemMap activeTab={activeTab} />
    </AdminPage>
  );
}
