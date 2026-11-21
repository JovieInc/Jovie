import type { Metadata } from 'next';
import { AdminPage } from '@/components/features/admin/layout/AdminPage';
import { AdminQueryTabsSelect } from '@/components/features/admin/layout/AdminQueryTabsSelect';
import { AdminSystemMap } from '@/components/features/admin/system-map/AdminSystemMap';
import { AgentRoster } from '@/components/features/agent-room/AgentRoster';
import { requireCurrentAdminPageAccess } from '@/lib/admin/page-access';
import { readOvieFleetRoom } from '@/lib/ovie/fleet-room.server';
import { NOINDEX_ROBOTS } from '@/lib/seo/noindex-metadata';

export const metadata: Metadata = {
  title: 'Agents | Ovie',
  robots: NOINDEX_ROBOTS,
};

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export type SystemMapTab = 'skills' | 'connectors' | 'tools' | 'memory';

/** The roster is the default Agents experience; tabs open the system map. */
type AgentsTab = 'roster' | SystemMapTab;

const AGENTS_TABS = [
  { value: 'roster' as const, label: 'Roster' },
  { value: 'skills' as const, label: 'Skills' },
  { value: 'connectors' as const, label: 'Connectors' },
  { value: 'tools' as const, label: 'Tools' },
  { value: 'memory' as const, label: 'Memory' },
];

const AGENTS_TAB_VALUES: readonly AgentsTab[] = [
  'roster',
  'skills',
  'connectors',
  'tools',
  'memory',
];

function resolveTab(value: string | undefined): AgentsTab {
  return AGENTS_TAB_VALUES.includes(value as AgentsTab)
    ? (value as AgentsTab)
    : 'roster';
}

interface Props {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function AdminSystemPage({ searchParams }: Props) {
  await requireCurrentAdminPageAccess();

  const params = await searchParams;
  const rawTab = Array.isArray(params.tab) ? params.tab[0] : params.tab;
  const activeTab = resolveTab(rawTab);
  const room = await readOvieFleetRoom();

  return (
    <AdminPage
      views='operations'
      title='Agents'
      description='Who is on the fleet, plus a read-only overview of skills, connectors, tools, and memory — separation of concerns for the platform.'
      testId='admin-system-page'
      viewTestId='admin-system-content'
      actions={
        <AdminQueryTabsSelect
          param='tab'
          value={activeTab}
          options={AGENTS_TABS}
        />
      }
    >
      {activeTab === 'roster' ? (
        <AgentRoster agents={room.view.agents} />
      ) : (
        <AdminSystemMap activeTab={activeTab} />
      )}
    </AdminPage>
  );
}
