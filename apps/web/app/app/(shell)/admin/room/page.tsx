import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { AdminPage } from '@/components/features/admin/layout/AdminPage';
import { AgentRoom } from '@/components/features/agent-room/AgentRoom';
import { requireCurrentAdminPageAccess } from '@/lib/admin/page-access';
import { getAppFlagValue } from '@/lib/flags/server';
import { readOvieFleetRoom } from '@/lib/ovie/fleet-room.server';
import { NOINDEX_ROBOTS } from '@/lib/seo/noindex-metadata';

export const metadata: Metadata = {
  title: 'Room | Ovie',
  robots: NOINDEX_ROBOTS,
};

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UNAVAILABLE_COPY = {
  'redis-unavailable':
    'Activity is unavailable here: this environment has no room store. The roster still shows.',
  'store-read-failed':
    'Activity could not be read just now. Refresh to retry; the roster still shows.',
} as const;

/**
 * Ovie fleet room: every agent with live presence, and the fleet's messages
 * from Linear, newest first. Read-only in this slice. Data comes from the room
 * store only (docs/operations/AGENT_ROOM.md); rendering calls no provider.
 */
export default async function AdminRoomPage() {
  const actorId = await requireCurrentAdminPageAccess();
  const enabled = await getAppFlagValue('OVIE_FLEET_ROOM', { userId: actorId });
  if (!enabled) notFound();

  const room = await readOvieFleetRoom();
  return (
    <AdminPage
      title='Room'
      description='The fleet and what it is saying. Messages come from Linear issue threads, where agents talk.'
      testId='admin-room-page'
      viewTestId='admin-room-view'
    >
      <AgentRoom
        view={room.view}
        unavailableReason={
          room.status === 'unavailable' ? UNAVAILABLE_COPY[room.reason] : null
        }
      />
    </AdminPage>
  );
}
