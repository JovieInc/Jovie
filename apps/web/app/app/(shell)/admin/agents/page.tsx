import type { Metadata } from 'next';
import { OvieFleetAgentsWorkspace } from '@/components/features/admin/fleet-agents/OvieFleetAgentsWorkspace';
import { AdminPage } from '@/components/features/admin/layout/AdminPage';
import { requireCurrentAdminPageAccess } from '@/lib/admin/page-access';
import {
  fleetAgentPresenceMap,
  fleetAgentRowsFromRoster,
} from '@/lib/ovie/fleet-agents';
import { readOvieFleetRoom } from '@/lib/ovie/fleet-room.server';
import { NOINDEX_ROBOTS } from '@/lib/seo/noindex-metadata';

export const metadata: Metadata = {
  title: 'Agents | Ovie',
  robots: NOINDEX_ROBOTS,
};

export const runtime = 'nodejs';

export default async function AdminAgentsPage() {
  await requireCurrentAdminPageAccess();

  const room = await readOvieFleetRoom();
  const presenceById = fleetAgentPresenceMap(room.view.agents);
  const rows = fleetAgentRowsFromRoster(undefined, presenceById);

  return (
    <AdminPage
      layout='workspace'
      views='operations'
      title='Agents'
      description='Fleet agents, onboarding status, and readiness — one row per roster member.'
      testId='admin-agents-page'
      viewTestId='admin-agents-view'
    >
      <OvieFleetAgentsWorkspace rows={rows} />
    </AdminPage>
  );
}
