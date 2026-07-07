import 'server-only';

import { headers } from 'next/headers';
import { cache } from 'react';
import { getAppUserByBetterAuthId } from '@/lib/auth/app-user';
import { auth } from '@/lib/auth/better-auth';
import {
  buildDevTestAuthCurrentUser,
  getCachedDevTestAuthSession,
} from '@/lib/auth/dev-test-auth.server';
import type { JovieUser } from '@/lib/auth/jovie-user';
import { toJovieUser } from '@/lib/auth/jovie-user';
import { attachSentryContext } from '@/lib/sentry/set-user-context';

/**
 * Cached server-identity source (Clerk → Better Auth migration, build-safe
 * commit ⑤). Reads Better Auth sessions via `auth.api.getSession({ headers })`
 * and maps the BA user id to the app `users` row through
 * `getAppUserByBetterAuthId` (single indexed query, memoized per request).
 *
 * Export names are preserved — `getCachedAuth`, `getCachedSessionTokenAuth`,
 * `getOptionalAuth`, `getCachedCurrentUser` — so the ~45 server consumers
 * don't churn (plan decision 4). The returned shape is shape-compatible
 * with the Clerk-era contract: `{ userId, sessionId, orgId }` where
 * `userId` is now the app `users.id` UUID (was Clerk's `user_*` id).
 *
 * Clerk stays the live auth path until the proxy flip (commit ⑥) and the
 * client flip (commit ⑦); until then, live users have no BA session cookie
 * so this returns the NULL_AUTH_RESULT and Clerk-era code degrades to
 * signed-out — build-safe, functionally inert until the cutover merge.
 */

interface AuthResult {
  userId: string | null;
  sessionId: string | null;
  orgId: string | null;
}

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

/**
 * Better Auth throws when `headers()` is called outside a request scope
 * (e.g. from `unstable_cache` or a script). The Clerk-era wrapper detected
 * this via "clerkmiddleware" / "outside a request scope" substrings; the BA
 * equivalents are the same "outside a request scope" plus Next.js's
 * `headers()` rejection message.
 */
function isMissingAuthRequestContext(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  return (
    message.includes('outside a request scope') ||
    message.includes('only supported in app router') ||
    message.includes('only supported in a route handler') ||
    message.includes('only supported in a server component') ||
    message.includes('headers() expects') ||
    message.includes('dynamic server usage')
  );
}

async function readBetterAuthSession(): Promise<AuthResult> {
  try {
    const headerStore = await headers();
    const session = await auth.api.getSession({ headers: headerStore });
    if (!session) {
      return NULL_AUTH_RESULT;
    }

    const appUser = await getAppUserByBetterAuthId(session.user.id);
    if (!appUser) {
      // BA knows the user (provisioning hook ran) but the app `users` row
      // isn't linked yet — gate.ts' lazy-create heals on the next request.
      // Treat as not-yet-provisioned so callers fall through to /start.
      return {
        userId: null,
        sessionId: session.session.id,
        orgId: null,
      };
    }

    await attachSentryContext(appUser.id);
    return {
      userId: appUser.id,
      sessionId: session.session.id,
      orgId: null,
    };
  } catch (error) {
    if (isMissingAuthRequestContext(error)) {
      return NULL_AUTH_RESULT;
    }
    throw error;
  }
}

async function resolveCachedAuth(): Promise<AuthResult> {
  const bypassSession = await getCachedDevTestAuthSession();
  if (bypassSession) {
    const result: AuthResult = {
      userId: bypassSession.dbUserId,
      sessionId: `sess_test_bypass_${bypassSession.dbUserId}`,
      orgId: null,
    };
    await attachSentryContext(result.userId);
    return result;
  }

  return readBetterAuthSession();
}

export const getCachedAuth = cache(async (): Promise<AuthResult> => {
  return resolveCachedAuth();
});

export const getCachedSessionTokenAuth = cache(
  async (): Promise<AuthResult> => {
    // Better Auth's getSession always validates the full session token
    // (signed cookie + DB/Redis lookup); there's no separate "session-token
    // only" tier. Preserve the export name so callers don't churn.
    return resolveCachedAuth();
  }
);

export const getOptionalAuth = cache(async (): Promise<AuthResult> => {
  try {
    return await resolveCachedAuth();
  } catch (error) {
    if (isMissingAuthRequestContext(error)) {
      return NULL_AUTH_RESULT;
    }
    throw error;
  }
});

export const getCachedCurrentUser = cache(
  async (): Promise<JovieUser | null> => {
    const bypassSession = await getCachedDevTestAuthSession();
    if (bypassSession) {
      const bypassUser = buildDevTestAuthCurrentUser(bypassSession);
      // The bypass persona preserves the Clerk-shaped currentUser contract
      // (emailAddresses / imageUrl / fullName / firstName / lastName /
      // username) so legacy consumers (e.g. resolveClerkIdentity) keep
      // working in dev/E2E without churn. JovieUser.id is the BA user id
      // for the real-auth path; for the bypass it falls back to the
      // persona's stable string so consumers that key on `user.id` still
      // get a stable identifier.
      const emailAddress = bypassUser.primaryEmailAddress.emailAddress;
      const emailEntry = {
        id: `bypass_email_${bypassUser.id}`,
        emailAddress,
      };
      return {
        id: bypassUser.id,
        emailAddresses: [emailEntry],
        primaryEmailAddress: emailEntry,
        imageUrl: bypassUser.imageUrl,
        fullName: bypassUser.fullName,
        firstName: bypassUser.firstName ?? null,
        lastName: bypassUser.lastName ?? null,
        username: bypassUser.username ?? null,
      };
    }

    try {
      const headerStore = await headers();
      const session = await auth.api.getSession({ headers: headerStore });
      if (!session) {
        return null;
      }

      return toJovieUser({
        id: session.user.id,
        email: session.user.email,
        name: session.user.name,
        image: session.user.image,
        username:
          (session.user as { username?: string | null }).username ?? null,
      });
    } catch (error) {
      if (isMissingAuthRequestContext(error)) {
        return null;
      }
      throw error;
    }
  }
);
