import 'server-only';

import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';
import { baUsers } from '@/lib/db/schema/better-auth';

function readTrimmedEnv(name: string): string | null {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

export async function resolveConfiguredNativeTestBetterAuthUserId(): Promise<
  string | null
> {
  const explicitBaUserId = readTrimmedEnv(
    'JOVIE_IOS_LIVE_AUTH_BETTER_AUTH_USER_ID'
  );
  const legacyClerkId = readTrimmedEnv('JOVIE_IOS_LIVE_AUTH_CLERK_USER_ID');
  const e2eEmail = readTrimmedEnv('E2E_CLERK_USER_USERNAME');
  const e2eUserId = readTrimmedEnv('E2E_CLERK_USER_ID');

  if (explicitBaUserId) {
    const [baUser] = await db
      .select({ id: baUsers.id })
      .from(baUsers)
      .where(eq(baUsers.id, explicitBaUserId))
      .limit(1);
    return baUser?.id ?? null;
  }

  const legacyId = legacyClerkId ?? e2eUserId;
  if (legacyId) {
    const [appUser] = await db
      .select({ betterAuthUserId: users.betterAuthUserId })
      .from(users)
      .where(eq(users.clerkId, legacyId))
      .limit(1);
    return appUser?.betterAuthUserId ?? null;
  }

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
