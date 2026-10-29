import 'server-only';

import { and, desc, sql as drizzleSql, eq, gte, isNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { signupReplays } from '@/lib/db/schema/signup-replays';

/** Sentry replay ids are 32 lowercase hex characters. */
export const SENTRY_REPLAY_ID_PATTERN = /^[0-9a-f]{32}$/;

const SENTRY_ORG_SLUG = 'jovie';

/** Internal Sentry link for a replay. Requires a Sentry login. */
export function sentryReplayUrl(replayId: string): string {
  return `https://${SENTRY_ORG_SLUG}.sentry.io/explore/replays/${replayId}/`;
}

/**
 * Attach the identity the server can verify to a replay. Idempotent: a later
 * report for the same replay id only fills identity that is still missing, so
 * the anonymous session id from /start and the user id after sign-in end up
 * on the same row.
 */
export async function recordSignupReplay(input: {
  readonly replayId: string;
  readonly onboardingSessionId: string | null;
  readonly userId: string | null;
}): Promise<void> {
  if (!input.onboardingSessionId && !input.userId) return;
  await db
    .insert(signupReplays)
    .values({
      sentryReplayId: input.replayId,
      onboardingSessionId: input.onboardingSessionId,
      userId: input.userId,
    })
    .onConflictDoUpdate({
      target: signupReplays.sentryReplayId,
      set: {
        onboardingSessionId: drizzleSql`coalesce(${signupReplays.onboardingSessionId}, excluded.onboarding_session_id)`,
        userId: drizzleSql`coalesce(${signupReplays.userId}, excluded.user_id)`,
        updatedAt: new Date(),
      },
    });
}

/**
 * When an anonymous onboarding session is claimed onto a user, attach the
 * user to every replay recorded under that session.
 */
export async function linkOnboardingSessionReplaysToUser(
  onboardingSessionId: string,
  userId: string
): Promise<void> {
  await db
    .update(signupReplays)
    .set({ userId, updatedAt: new Date() })
    .where(
      and(
        eq(signupReplays.onboardingSessionId, onboardingSessionId),
        isNull(signupReplays.userId)
      )
    );
}

export interface StuckSignupReplay {
  readonly userId: string;
  readonly signedUpAt: string;
  readonly profileClaimed: boolean;
  readonly replays: ReadonlyArray<{
    readonly replayId: string;
    readonly url: string;
    readonly recordedAt: string;
  }>;
}

/**
 * Accounts created in the window with no claimed profile, with their replays
 * (newest first). Ids only: no email, name or handle leaves this function.
 */
export async function listStuckSignupReplays(
  windowDays: number,
  limit = 50
): Promise<StuckSignupReplay[]> {
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
  const claimed = drizzleSql<boolean>`exists (
    select 1 from ${creatorProfiles}
    where ${creatorProfiles.userId} = ${users.id}
      and ${creatorProfiles.isClaimed} = true
  )`;
  const rows = await db
    .select({
      userId: users.id,
      signedUpAt: users.createdAt,
      profileClaimed: claimed,
      replayId: signupReplays.sentryReplayId,
      recordedAt: signupReplays.createdAt,
    })
    .from(users)
    .leftJoin(signupReplays, eq(signupReplays.userId, users.id))
    .where(gte(users.createdAt, since))
    .orderBy(desc(users.createdAt), desc(signupReplays.createdAt))
    .limit(limit * 5);

  const byUser = new Map<string, StuckSignupReplay>();
  for (const row of rows) {
    if (row.profileClaimed) continue;
    let entry = byUser.get(row.userId);
    if (!entry) {
      if (byUser.size >= limit) continue;
      entry = {
        userId: row.userId,
        signedUpAt: row.signedUpAt.toISOString(),
        profileClaimed: false,
        replays: [],
      };
      byUser.set(row.userId, entry);
    }
    if (row.replayId && row.recordedAt) {
      (entry.replays as Array<StuckSignupReplay['replays'][number]>).push({
        replayId: row.replayId,
        url: sentryReplayUrl(row.replayId),
        recordedAt: row.recordedAt.toISOString(),
      });
    }
  }
  return [...byUser.values()];
}
