import 'server-only';

import { createHash } from 'node:crypto';
import { getOptionalAuth } from '@/lib/auth/cached';
import { getClientIP } from '@/lib/rate-limit';
import type { LinkActor } from './types';

/**
 * A resolved Jovie session (cookie or bearer session that Better Auth accepts)
 * is the creator principal. The directory listing stays noauth: a missing or
 * foreign bearer does not reject the call. Anonymous callers are keyed by a
 * hash of the IP, never the raw address.
 *
 * The link stays unclaimed either way. claimUrl is the artist's later path,
 * the same posture as `profile create`. It does not create a login.
 */
export async function resolveLinkActor(request: Request): Promise<LinkActor> {
  try {
    const session = await getOptionalAuth();
    if (session.userId) {
      return { userId: session.userId, anonymousSubjectHash: null };
    }
  } catch {
    // Session lookup can throw outside a request scope. Stay anonymous.
  }
  const subject = createHash('sha256')
    .update(`jovie-link:${getClientIP(request)}`)
    .digest('hex');
  return { userId: null, anonymousSubjectHash: subject };
}
