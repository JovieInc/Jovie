import 'server-only';

import type { PresenceRemovalPrincipal } from '@/components/features/presence/types';
import { getCachedAuth } from '@/lib/auth/cached';
import { getRequestSession } from '@/lib/auth/request-session';

export async function loadPresenceRemovalPrincipal(
  routeActorId: string
): Promise<PresenceRemovalPrincipal | null> {
  const [actor, session] = await Promise.all([
    getCachedAuth(),
    getRequestSession(),
  ]);
  if (
    actor.userId !== routeActorId ||
    !session?.user.id ||
    !session.session.id ||
    session.session.userId !== session.user.id
  )
    return null;
  return {
    appActorId: routeActorId,
    authUserId: session.user.id,
    sessionId: session.session.id,
    impersonationSubject: actor.actorUserId ? actor.userId : null,
  };
}
