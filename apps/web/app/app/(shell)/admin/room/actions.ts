'use server';

import { revalidatePath } from 'next/cache';
import type { AgentRoomComposerState } from '@/components/features/agent-room/AgentRoomComposer';
import { APP_ROUTES } from '@/constants/routes';
import { isAdmin as checkAdminRole } from '@/lib/admin/roles';
import { getCachedAuth } from '@/lib/auth/cached';
import { captureError } from '@/lib/error-tracking';
import { getAppFlagValue } from '@/lib/flags/server';
import { sendFleetRoomMessage } from '@/lib/ovie/fleet-room-send.server';
import { assertOviePrivacyUnlocked } from '@/lib/ovie/privacy-lock/server';

const SEND_COPY = {
  'unknown-agent': 'Pick an agent to message.',
  empty: 'Type a message first.',
  'too-long': 'Keep the message under 2,000 characters.',
  'linear-unconfigured': 'Linear did not take the message. Try again.',
  'thread-missing': "That agent's Linear thread could not be found.",
  'post-failed': 'Linear did not take the message. Try again.',
} as const;

/** Composer action: admins only, behind OVIE_FLEET_ROOM, MFA-fresh session. */
export async function sendFleetRoomMessageAction(
  _previous: AgentRoomComposerState,
  formData: FormData
): Promise<AgentRoomComposerState> {
  const { userId } = await getCachedAuth({ session: 'fresh' });
  if (!userId || !(await checkAdminRole(userId))) {
    return { status: 'error', message: 'Only Ovie operators can send here.' };
  }
  await assertOviePrivacyUnlocked();
  if (!(await getAppFlagValue('OVIE_FLEET_ROOM', { userId }))) {
    return { status: 'error', message: 'The fleet room is off.' };
  }
  const agentId = String(formData.get('agentId') ?? '');
  const text = String(formData.get('text') ?? '');
  try {
    const result = await sendFleetRoomMessage({ agentId, text });
    if (result.status !== 'sent') {
      return { status: 'error', message: SEND_COPY[result.reason] };
    }
    revalidatePath(APP_ROUTES.ADMIN_ROOM);
    return { status: 'sent', message: `Posted in ${result.thread}.` };
  } catch (error) {
    await captureError('Fleet room send failed', error, {
      route: APP_ROUTES.ADMIN_ROOM,
    });
    return { status: 'error', message: SEND_COPY['post-failed'] };
  }
}
