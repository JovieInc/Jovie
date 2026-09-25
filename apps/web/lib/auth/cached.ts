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
import { checkUserStatus } from '@/lib/auth/status-checker';
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
 * Better Auth is the live session path. A missing or invalid Better Auth
 * session yields NULL_AUTH_RESULT; there is no fallback to the retired provider.
 *
 * Read-only callers use the signed cookie cache (`session.cookieCache`,
 * 5 minutes). That skips Better Auth's secondary-storage GET. The app user
 * is still loaded from Postgres (`getAppUserByBetterAuthId`), which is why
 * forcing `disableCookieCache` on every read burned an Upstash command
 * without skipping the database.
 *
 * Fresh reads (`disableCookieCache: true`, one secondary-storage GET) are
 * only for security mutations. `getFreshAuth` is that read. A still-valid
 * `session_data` cookie must not authorize these paths after the server
 * session is revoked or deleted. Paths:
 * - Sign-out: Better Auth `POST /api/auth/sign-out` (`authClient.signOut`
 *   in `hooks/useJovieAuth.tsx`) calls `findSession` and `deleteSession`
 *   itself. It does not use this module or the cookie cache.
 * - Role changes: `POST` and `DELETE /api/admin/roles`.
 * - Permission changes: `POST` and `DELETE /api/admin/impersonate`.
 *   Impersonate GET stays on the cookie cache.
 * - Billing mutations: `POST /api/stripe/checkout`, `POST /api/stripe/cancel`,
 *   `POST` and `DELETE /api/stripe/plan-change`, `POST /api/stripe/portal`,
 *   `POST /api/admin/set-plan`.
 *   Plan-change GET, plan-change preview, billing status, and billing
 *   history stay on the cookie cache.
 * - Account erasure: `POST /api/account/delete`. Account export stays on
 *   the cookie cache.
 * - Runtime flag writes: `POST /api/admin/feature-flags` and
 *   `POST /api/admin/feature-flags/rollback`. `GET /api/feature-flags`
 *   stays on the cookie cache.
 * - Production deploy: `POST /api/deploy/promote`. Deploy status stays
 *   on the cookie cache.
 * - Admin privilege and destructive server actions in
 *   `app/app/(shell)/admin/actions.ts` (verify, ban, unban, delete),
 *   playlist approval, and platform-connection settings.
 * - Investor-link, investor-settings, and investor-update mutations.
 *   Investor GETs stay on the cookie cache.
 * - Other admin mutations authorize with
 *   `requireAdmin({ session: 'fresh' })` or
 *   `getCurrentUserEntitlements({ session: 'fresh' })`.
 *   Admin and dashboard reads stay on the cookie cache.
 * - Non-production plan and trial overrides:
 *   `POST /api/dev/test-user/set-plan` and `set-trial-state`.
 */

/** `userId` is `users.id`, never Better Auth or `users.clerkId`. */
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

type SessionRead = 'cookie' | 'fresh';

const FRESH_SESSION_QUERY = { disableCookieCache: true } as const;

interface FreshAuthSlot {
  settled: boolean;
  result: AuthResult;
}

/** Per-request slot so a later cookie read reuses the fresh identity. */
const freshAuthSlot = cache(
  (): FreshAuthSlot => ({
    settled: false,
    result: NULL_AUTH_RESULT,
  })
);

async function loadBetterAuthSession(mode: SessionRead) {
  const headerStore = await headers();
  return auth.api.getSession({
    headers: headerStore,
    ...(mode === 'fresh' ? { query: FRESH_SESSION_QUERY } : {}),
  });
}

async function readBetterAuthSession(mode: SessionRead): Promise<AuthResult> {
  try {
    const session = await loadBetterAuthSession(mode);
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
    if (checkUserStatus(appUser.userStatus, appUser.deletedAt).isBlocked) {
      return NULL_AUTH_RESULT;
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

async function resolveRequestAuth(mode: SessionRead): Promise<AuthResult> {
  const slot = freshAuthSlot();
  if (slot.settled) return slot.result;

  const bypassSession = await getCachedDevTestAuthSession();
  if (bypassSession) {
    const result: AuthResult = {
      userId: bypassSession.dbUserId,
      sessionId: `sess_test_bypass_${bypassSession.dbUserId}`,
      orgId: null,
    };
    await attachSentryContext(result.userId);
    if (mode === 'fresh') {
      slot.settled = true;
      slot.result = result;
    }
    return result;
  }

  const result = await readBetterAuthSession(mode);
  if (mode === 'fresh') {
    slot.settled = true;
    slot.result = result;
  }
  return result;
}

export const getCachedAuth = cache(
  async (options?: { session?: 'cookie' | 'fresh' }): Promise<AuthResult> => {
    return resolveRequestAuth(
      options?.session === 'fresh' ? 'fresh' : 'cookie'
    );
  }
);

/** Authoritative session read for the security mutations listed above. */
export const getFreshAuth = cache(async (): Promise<AuthResult> => {
  return resolveRequestAuth('fresh');
});

export const getCachedSessionTokenAuth = cache(
  async (): Promise<AuthResult> => {
    // Same cookie-cached read as getCachedAuth. There is no separate
    // session-token tier. The export name stays so callers don't churn.
    return getCachedAuth();
  }
);

export const getOptionalAuth = cache(async (): Promise<AuthResult> => {
  try {
    return await getCachedAuth();
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
      // username) so identity consumers (e.g. resolveUserIdentity) keep
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
      const session = await loadBetterAuthSession('cookie');
      if (!session) {
        return null;
      }
      const appUser = await getAppUserByBetterAuthId(session.user.id);
      if (
        !appUser ||
        checkUserStatus(appUser.userStatus, appUser.deletedAt).isBlocked
      ) {
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
