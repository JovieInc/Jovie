import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { AdminPage } from '@/components/features/admin/layout/AdminPage';
import { AgentRoom } from '@/components/features/agent-room/AgentRoom';
import { AgentRoomComposer } from '@/components/features/agent-room/AgentRoomComposer';
import { requireCurrentAdminPageAccess } from '@/lib/admin/page-access';
import { getAppFlagValue } from '@/lib/flags/server';
import { OVIE_FLEET_ROSTER } from '@/lib/ovie/fleet-room';
import { readOvieFleetRoom } from '@/lib/ovie/fleet-room.server';
import {
  FLEET_ROOM_MESSAGE_MAX_CHARS,
  fleetRoomCanSend,
} from '@/lib/ovie/fleet-room-send.server';
import { NOINDEX_ROBOTS } from '@/lib/seo/noindex-metadata';
import { sendFleetRoomMessageAction } from './actions';

export const metadata: Metadata = {
  title: 'Room | Ovie',
  robots: NOINDEX_ROBOTS,
};

export const runtime = 'nodejs';

/** Agents with a Linear home thread can be messaged; Linear agent apps cannot. */
const MESSAGEABLE_AGENTS = OVIE_FLEET_ROSTER.agents
  .filter(agent => agent.kind === 'agent' && agent.homeThread)
  .map(agent => ({ id: agent.id, name: agent.name }));

// Without a room store the feed is empty and the roster still renders; only a
// failed read gets a line, because a refresh can fix it.
const READ_FAILED_COPY =
  'Activity could not be read just now. Refresh to retry; the roster still shows.';

/**
 * Ovie fleet room: every agent with live presence, and the fleet's messages
 * from Linear, newest first. The composer, shown only where Linear is configured, posts one
 * prefixed comment on the chosen agent's Linear thread. Data comes from the room
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
          room.status === 'unavailable' && room.reason === 'store-read-failed'
            ? READ_FAILED_COPY
            : null
        }
        composer={
          fleetRoomCanSend() ? (
            <AgentRoomComposer
              agents={MESSAGEABLE_AGENTS}
              action={sendFleetRoomMessageAction}
              maxChars={FLEET_ROOM_MESSAGE_MAX_CHARS}
            />
          ) : null
        }
      />
    </AdminPage>
  );
}
