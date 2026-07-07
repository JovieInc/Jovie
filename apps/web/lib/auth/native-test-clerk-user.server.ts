import 'server-only';

import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';
import { baUsers } from '@/lib/db/schema/better-auth';

/**
 * Resolve a configured Better Auth user id for native test auth (Clerk →
 * Better Auth migration, commit ⑨). Replaces the Clerk-era
 * `resolveConfiguredNativeTestClerkUserId` which queried the Clerk API.
 * Under BA, the test user is a direct drizzle row — no external API call.
 *
 * Reads `JOVIE_IOS_LIVE_AUTH_BETTER_AUTH_USER_ID` (new) or
 * `JOVIE_IOS_LIVE_AUTH_CLERK_USER_ID` (old, fallback) from env. The value
 * is a BA user id; we verify it exists in `ba_users` before returning it.
 * If the env value is an old Clerk id that's now linked to a BA user via
 * `users.clerkId`, we resolve through to the BA user id.
 */
export async function resolveConfiguredNativeTestBetterAuthUserId(): Promise<
  string | null
> {
  const explicitBaUserId = readTrimmedEnv(
    'JOVIE_IOS_LIVE_AUTH_BETTER_AUTH_USER_ID'
  );
  const legacyClerkId = readTrimmedEnv('JOVIE_IOS_LIVE_AUTH_CLERK_USER_ID');
  const e2eEmail = readTrimmedEnv('E2E_CLERK_USER_USERNAME');
  const e2eUserId = readTrimmedEnv('E2E_CLERK_USER_ID');

  if (!explicitBaUserId && !legacyClerkId && !e2eEmail && !e2eUserId) {
    return null;
  }

  // Direct BA user id from env — verify it exists.
  if (explicitBaUserId) {
    const [baUser] = await db
      .select({ id: baUsers.id })
      .from(baUsers)
      .where(eq(baUsers.id, explicitBaUserId))
      .limit(1);
    return baUser?.id ?? null;
  }

  // Legacy Clerk id — resolve through to the linked BA user id.
  if (legacyClerkId || e2eUserId) {
    const clerkId = legacyClerkId ?? e2eUserId!;
    const [appUser] = await db
      .select({ betterAuthUserId: users.betterAuthUserId })
      .from(users)
      .where(eq(users.clerkId, clerkId))
      .limit(1);
    return appUser?.betterAuthUserId ?? null;
  }

  // Email lookup — find the BA user by email.
  if (e2eEmail) {
    const [baUser] = await db
      .select({ id: baUsers.id })
      .from(baUsers)
      .where(eq(baUsers.email, e2eEmail))
      .limit(1);
    return baUser?.id ?? null;
  }

  return null;
}

function readTrimmedEnv(name: string): string | null {
  const value = process.env[name]?.trim();
  return value ? value : null;
}
