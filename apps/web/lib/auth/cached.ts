import 'server-only';

import { auth, currentUser } from '@clerk/nextjs/server';
import { headers } from 'next/headers';
import { cache } from 'react';
import {
  isTestAuthBypassEnabled,
  resolveTestBypassUserId,
} from '@/lib/auth/test-mode';
import { env } from '@/lib/env-server';

type CachedCurrentUser = Awaited<ReturnType<typeof currentUser>>;

function getBypassUserEmail(): string {
  const configuredEmail = env.E2E_CLERK_USER_USERNAME?.trim();
  return configuredEmail && configuredEmail.length > 0
    ? configuredEmail
    : 'e2e@jov.ie';
}

function getBypassUsername(email: string): string {
  return email.split('@').at(0)?.trim() || 'e2e';
}

function buildBypassCurrentUser(
  userId: string
): NonNullable<CachedCurrentUser> {
  const email = getBypassUserEmail();
  const username = getBypassUsername(email);

  const bypassUser = {
    id: userId,
    username,
    firstName: 'E2E',
    lastName: 'Test',
    fullName: 'E2E Test',
    imageUrl: '',
    primaryEmailAddress: {
      emailAddress: email,
      verification: {
        status: 'verified',
      },
    },
    emailAddresses: [
      {
        emailAddress: email,
        verification: {
          status: 'verified',
        },
      },
    ],
    externalAccounts: [],
    privateMetadata: {},
  };

  return bypassUser as unknown as NonNullable<CachedCurrentUser>;
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
  if (isTestAuthBypassEnabled()) {
    try {
      const headerStore = await headers();
      const testUserId = resolveTestBypassUserId(headerStore);
      if (testUserId) {
        return {
          userId: testUserId,
          sessionId: 'sess_test_bypass',
          orgId: null,
        };
      }
    } catch {
      // Ignore missing request context in test-only paths.
    }
  }

  return auth();
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
  if (isTestAuthBypassEnabled()) {
    try {
      const headerStore = await headers();
      const testUserId = resolveTestBypassUserId(headerStore);
      if (testUserId) {
        return buildBypassCurrentUser(testUserId);
      }
    } catch {
      // Ignore missing request context in test-only paths.
    }
  }

  return currentUser();
});
