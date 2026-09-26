import 'server-only';

import { getCachedAuth } from '@/lib/auth/cached';
import { UnauthorizedSessionError } from '@/lib/auth/session';

/**
 * Financial-owner boundary (JOV-4609).
 *
 * The financial owner is ALWAYS the authenticated user's `users.id`. It is
 * never derived from `creator_id`, workspace membership, collaborator roles,
 * or any shared creator resource — creator-profile access must never imply
 * financial access.
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const FINANCE_OWNER_ERRORS = {
  INVALID_OWNER_ID: 'Invalid financial owner id',
} as const;

/**
 * Resolve the financial owner for the current request.
 *
 * Throws `UnauthorizedSessionError` for unauthenticated callers. The result
 * is the caller's own `users.id`; there is no parameter because no caller is
 * ever allowed to act on behalf of another owner.
 */
export async function requireFinancialOwnerId(): Promise<string> {
  const { userId } = await getCachedAuth();
  if (!userId || !UUID_RE.test(userId)) {
    throw new UnauthorizedSessionError();
  }
  return userId;
}

/**
 * Validate an owner id supplied by a background job or webhook payload.
 *
 * Jobs MUST carry the owner's `users.id` in their payload and re-open an
 * owner-scoped session (`applyRlsSessionUser`) — the finance tables have no
 * system bypass, so an unscoped or `system_*` session reads nothing. This
 * guard rejects anything that is not a `users.id` UUID so a creator id,
 * clerk id, or guessed value fails closed before any query runs.
 */
export function assertFinancialOwnerId(ownerUserId: unknown): string {
  if (typeof ownerUserId !== 'string' || !UUID_RE.test(ownerUserId)) {
    throw new TypeError(FINANCE_OWNER_ERRORS.INVALID_OWNER_ID);
  }
  return ownerUserId;
}
