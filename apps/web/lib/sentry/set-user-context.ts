import 'server-only';

import * as Sentry from '@sentry/nextjs';
import { headers } from 'next/headers';
import { maskUserIdForLog } from '@/lib/auth/mask-user-id';
import { REQUEST_ID_HEADER } from '@/lib/monitoring/middleware';

/**
 * Attach request-scoped context to the current Sentry scope so any error
 * captured during this request carries the masked user id + request id.
 *
 * Masks the Clerk user id with the same scheme as admin/audit logs so Sentry
 * and server logs line up without leaking raw Clerk ids into Sentry.
 *
 * Safe to fire-and-forget: wraps all work in try/catch and never throws into
 * the auth path.
 */
export async function attachSentryContext(
  userId: string | null | undefined
): Promise<void> {
  try {
    if (userId) {
      Sentry.setUser({ id: maskUserIdForLog(userId) });
    }

    const headerStore = await headers();
    const requestId = headerStore.get(REQUEST_ID_HEADER);
    if (requestId) {
      Sentry.setTag('request_id', requestId);
    }
  } catch {
    // Never throw into the auth path. Missing context is acceptable;
    // broken auth because of a Sentry import is not.
  }
}
