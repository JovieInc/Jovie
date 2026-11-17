import 'server-only';

import { headers } from 'next/headers';
import { auth } from '@/lib/auth/better-auth';
import { withRetry } from '@/lib/db/client/retry';
import { QUERY_TIMEOUTS } from '@/lib/db/query-timeout';

/**
 * Request-scoped Better Auth session read.
 *
 * `auth.api.getSession` costs a cookie decode at best and a session + user
 * Postgres lookup at worst. Layouts, pages, entitlements, the auth gate and
 * server actions each asked for it on their own, so one request paid for it
 * up to five times in sequence (Sentry, POST /app, 2026-09-26).
 *
 * React `cache()` does not memoize inside server action bodies, so the memo
 * is keyed on the request's `headers()` object instead. Next.js returns the
 * same object for every `headers()` call in one request, so this dedupes in
 * render and in actions alike, and the entry is collected with the request.
 *
 * A fresh read (cookie cache disabled) also satisfies later cookie reads in
 * the same request. A cookie read never satisfies a fresh read. Rejected reads
 * are dropped so a retry can run.
 */

export type RequestSessionRead = 'cookie' | 'fresh';

export type RequestSession = Awaited<ReturnType<typeof auth.api.getSession>>;

/**
 * Bounded read replay for the Better Auth session adapter (JOV-12489
 * family, deploy dpl_46VApNMuKbzgYH9iBeDWvkDmhk4b): a transient Neon
 * transport kill ('Connection terminated unexpectedly' — Sentry
 * JOVIE-WEB-ZX 7846802295 / 7846802249) on `auth.api.getSession` surfaced
 * as FAILED_TO_GET_SESSION 500s on every authenticated route.
 *
 * Replay admission is the canonical read policy — same shape as the Ovie
 * privacy-lock reads (#24735 / JOV-12320) and the JOV-12477 count boundary.
 * The read is replay-safe: session lookup is a pure SELECT on
 * ba_sessions/ba_users and the only write on the path is the session
 * updateAge expiry roll, an idempotent UPDATE that a replay recomputes to
 * the same effect. A missing session is not an error (null result), so real
 * auth failures are never replayed or swallowed; statement-timeout errors
 * are not admitted (JOV-5754). Non-transport errors still propagate after
 * one attempt.
 */
const SESSION_READ_RETRY = {
  operation: 'read',
  maxAttempts: 2,
  retryBudgetMs: QUERY_TIMEOUTS.api,
} as const;

const FRESH_SESSION_QUERY = { disableCookieCache: true } as const;

const sessionReadsByRequest = new WeakMap<
  object,
  Map<RequestSessionRead, Promise<RequestSession>>
>();

export async function getRequestSession(
  mode: RequestSessionRead = 'cookie'
): Promise<RequestSession> {
  const headerStore = await headers();
  let reads = sessionReadsByRequest.get(headerStore);
  if (!reads) {
    reads = new Map();
    sessionReadsByRequest.set(headerStore, reads);
  }

  const existing =
    reads.get(mode) ?? (mode === 'cookie' ? reads.get('fresh') : undefined);
  if (existing) return existing;

  const pending = withRetry(
    () =>
      auth.api.getSession({
        headers: headerStore,
        ...(mode === 'fresh' ? { query: FRESH_SESSION_QUERY } : {}),
      }),
    `requestSession(${mode})`,
    SESSION_READ_RETRY
  );
  reads.set(mode, pending);
  pending.catch(() => {
    if (reads.get(mode) === pending) reads.delete(mode);
  });
  return pending;
}
