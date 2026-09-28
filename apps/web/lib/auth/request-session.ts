import 'server-only';

import { headers } from 'next/headers';
import { auth } from '@/lib/auth/better-auth';

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

  const pending = auth.api.getSession({
    headers: headerStore,
    ...(mode === 'fresh' ? { query: FRESH_SESSION_QUERY } : {}),
  });
  reads.set(mode, pending);
  pending.catch(() => {
    if (reads.get(mode) === pending) reads.delete(mode);
  });
  return pending;
}
