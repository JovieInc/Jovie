import 'server-only';

import { desc, eq } from 'drizzle-orm';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth/better-auth';
import { getCachedAuth } from '@/lib/auth/cached';
import { requireAuth, UnauthorizedSessionError } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';
import { baSessions } from '@/lib/db/schema/better-auth';

/**
 * Active-sessions listing + revoke, backed by Better Auth's core session
 * table (no plugin required — `ba_sessions` already stores IP/user-agent).
 * Deferred since the Clerk cutover (docs/auth/better-auth-migration-plan.md).
 */

export interface AccountSession {
  readonly id: string;
  readonly ipAddress: string | null;
  readonly userAgent: string | null;
  readonly lastActiveAt: string;
  readonly isCurrent: boolean;
}

export class SessionNotFoundError extends Error {
  constructor() {
    super('Session not found');
    this.name = 'SessionNotFoundError';
  }
}

export class CannotRevokeCurrentSessionError extends Error {
  constructor() {
    super('Sign out of this device instead of ending its own session');
    this.name = 'CannotRevokeCurrentSessionError';
  }
}

/**
 * `ba_sessions.user_id` is keyed on the Better Auth user id (`ba_users.id`),
 * not the app `users.id` UUID that `getCachedAuth`/`requireAuth` return —
 * resolve the link column before querying sessions.
 */
async function resolveBetterAuthUserId(appUserId: string): Promise<string> {
  const [row] = await db
    .select({ betterAuthUserId: users.betterAuthUserId })
    .from(users)
    .where(eq(users.id, appUserId))
    .limit(1);
  if (!row?.betterAuthUserId) {
    throw new UnauthorizedSessionError();
  }
  return row.betterAuthUserId;
}

/** Lists the current user's active sessions, most recently active first. */
export async function listAccountSessions(): Promise<AccountSession[]> {
  const { userId: appUserId, sessionId: currentSessionId } =
    await getCachedAuth();
  if (!appUserId) {
    throw new UnauthorizedSessionError();
  }

  const betterAuthUserId = await resolveBetterAuthUserId(appUserId);
  const rows = await db
    .select({
      id: baSessions.id,
      ipAddress: baSessions.ipAddress,
      userAgent: baSessions.userAgent,
      updatedAt: baSessions.updatedAt,
      expiresAt: baSessions.expiresAt,
    })
    .from(baSessions)
    .where(eq(baSessions.userId, betterAuthUserId))
    .orderBy(desc(baSessions.updatedAt));

  const now = Date.now();
  return rows
    .filter(row => row.expiresAt.getTime() > now)
    .map(row => ({
      id: row.id,
      ipAddress: row.ipAddress,
      userAgent: row.userAgent,
      lastActiveAt: row.updatedAt.toISOString(),
      isCurrent: row.id === currentSessionId,
    }));
}

/**
 * Revokes one of the current user's own sessions. Ownership is checked
 * against `ba_sessions.user_id` before Better Auth ever sees a token, since
 * `auth.api.revokeSession` silently no-ops (still returns `status: true`) on
 * a token it doesn't own instead of throwing.
 */
export async function revokeAccountSession(sessionId: string): Promise<void> {
  const appUserId = await requireAuth();
  const { sessionId: currentSessionId } = await getCachedAuth();
  if (sessionId === currentSessionId) {
    throw new CannotRevokeCurrentSessionError();
  }

  const betterAuthUserId = await resolveBetterAuthUserId(appUserId);
  const [row] = await db
    .select({ token: baSessions.token, userId: baSessions.userId })
    .from(baSessions)
    .where(eq(baSessions.id, sessionId))
    .limit(1);

  if (!row || row.userId !== betterAuthUserId) {
    throw new SessionNotFoundError();
  }

  const headerStore = await headers();
  const result = await auth.api.revokeSession({
    headers: headerStore,
    body: { token: row.token },
  });
  if (!result?.status) {
    throw new Error('Failed to revoke session');
  }
}

/** Signs out every session for the current user except the one making the request. */
export async function revokeOtherAccountSessions(): Promise<void> {
  await requireAuth();
  const headerStore = await headers();
  const result = await auth.api.revokeOtherSessions({ headers: headerStore });
  if (!result?.status) {
    throw new Error('Failed to revoke other sessions');
  }
}
