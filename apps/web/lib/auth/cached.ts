import 'server-only';

import { auth, currentUser } from '@clerk/nextjs/server';
import { cache } from 'react';
import {
  buildDevTestAuthCurrentUser,
  getCachedDevTestAuthSession,
} from '@/lib/auth/dev-test-auth.server';
import { attachSentryContext } from '@/lib/sentry/set-user-context';

type CachedCurrentUser = Awaited<ReturnType<typeof currentUser>>;

interface NullAuthResult {
  userId: null;
  sessionId: null;
  orgId: null;
}

const NULL_AUTH_RESULT: NullAuthResult = {
  userId: null,
  sessionId: null,
  orgId: null,
};

function isMissingAuthRequestContext(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  return (
    message.includes("can't detect usage of clerkmiddleware") ||
    message.includes('clerkmiddleware') ||
    message.includes('outside a request scope') ||
    message.includes('only supported in app router') ||
    message.includes('only supported in a route handler') ||
    message.includes('only supported in a server component')
  );
}

async function resolveCachedAuth() {
  const bypassSession = await getCachedDevTestAuthSession();
  if (bypassSession) {
    const result = {
      userId: bypassSession.clerkUserId,
      sessionId: 'sess_test_bypass',
      orgId: undefined,
    };
    await attachSentryContext(result.userId);
    return result;
  }

  const result = await auth();
  await attachSentryContext(result.userId);
  return result;
}

/**
 * Cached version of Clerk's auth() function.
 *
 * This wrapper uses React's cache() to deduplicate auth() calls within a single
 * server request. When multiple server components call getCachedAuth() during
 * the same request lifecycle, only one actual call to Clerk's auth() is made.
 *
 * Note: Next.js automatically deduplicates fetch() calls, but Clerk's auth()
 * is not a fetch call - it reads from request headers. This wrapper ensures
 * auth() is only executed once per request, reducing latency by 20-50ms per
 * deduplicated call.
 *
 * @example
 * // In any server component or layout:
 * const { userId } = await getCachedAuth();
 *
 * @returns The same AuthObject that Clerk's auth() returns
 */
export const getCachedAuth = cache(async () => {
  return resolveCachedAuth();
});

/**
 * Cached auth helper for public/server-shared code paths.
 * Returns a signed-out state when Clerk is invoked without request context.
 */
export const getOptionalAuth = cache(async () => {
  try {
    return await resolveCachedAuth();
  } catch (error) {
    if (isMissingAuthRequestContext(error)) {
      return NULL_AUTH_RESULT;
    }
    throw error;
  }
});

/**
 * Cached version of Clerk's currentUser() function.
 *
 * This wrapper uses React's cache() to deduplicate currentUser() calls within
 * a single server request. When multiple server components call getCachedCurrentUser()
 * during the same request lifecycle, only one actual call to Clerk's currentUser()
 * is made.
 *
 * Use this when you need the full User object from Clerk, not just the userId.
 * For cases where you only need the userId, prefer getCachedAuth() as it's lighter.
 *
 * @example
 * // In any server component:
 * const user = await getCachedCurrentUser();
 * if (user) {
 *   console.log(user.emailAddresses[0]?.emailAddress);
 * }
 *
 * @returns The same User object (or null) that Clerk's currentUser() returns
 */
export const getCachedCurrentUser = cache(async () => {
  const bypassSession = await getCachedDevTestAuthSession();
  if (bypassSession) {
    return buildDevTestAuthCurrentUser(
      bypassSession
    ) as unknown as NonNullable<CachedCurrentUser>;
  }

  return currentUser();
});
