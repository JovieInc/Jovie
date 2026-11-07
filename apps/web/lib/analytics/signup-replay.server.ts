import 'server-only';

import { and, desc, sql as drizzleSql, eq, gte, isNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import {
  type SignupReplayRow,
  signupReplays,
} from '@/lib/db/schema/signup-replays';
import { logger } from '@/lib/utils/logger';

/** Sentry replay ids are 32 lowercase hex characters. */
export const SENTRY_REPLAY_ID_PATTERN = /^[0-9a-f]{32}$/;

const SENTRY_ORG_SLUG = 'jovie';

/** Internal Sentry link for a replay. Requires a Sentry login. */
export function sentryReplayUrl(replayId: string): string {
  return `https://${SENTRY_ORG_SLUG}.sentry.io/explore/replays/${replayId}/`;
}

/** Free Sentry plan: 50 replays a month. Stop flushing with headroom left. */
export const REPLAY_MONTHLY_CAP = 45;
/** Sentry's billing period starts on this UTC day of the month. */
const BILLING_ANCHOR_DAY = 24;

export const REPLAY_FLUSH_TRIGGERS = [
  'claim_idle',
  'claim_left',
  'onboarding_stalled',
  'onboarding_abandoned',
  'client_error',
  'signup',
  'profile_claimed',
] as const;
export type ReplayFlushTrigger = (typeof REPLAY_FLUSH_TRIGGERS)[number];

/** Start of the current Sentry billing period (UTC). */
export function billingPeriodStart(now = new Date()): Date {
  const month =
    now.getUTCDate() >= BILLING_ANCHOR_DAY
      ? now.getUTCMonth()
      : now.getUTCMonth() - 1;
  return new Date(Date.UTC(now.getUTCFullYear(), month, BILLING_ANCHOR_DAY));
}

/** Replays flushed in the current billing period. */
export async function countPeriodFlushes(now = new Date()): Promise<number> {
  const [row] = await db
    .select({ n: drizzleSql<number>`count(*)::int` })
    .from(signupReplays)
    .where(gte(signupReplays.flushedAt, billingPeriodStart(now)));
  return row?.n ?? 0;
}

/**
 * Attach the identity the server can verify to a replay. Idempotent: a later
 * report for the same replay id only fills identity that is still missing, so
 * the anonymous session id from /start and the user id after sign-in end up
 * on the same row. Returns the row (null when there is no identity to keep).
 */
export async function recordSignupReplay(input: {
  readonly replayId: string;
  readonly onboardingSessionId: string | null;
  readonly userId: string | null;
}): Promise<SignupReplayRow | null> {
  if (!input.onboardingSessionId && !input.userId) return null;
  const [row] = await db
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
    })
    .returning();
  return row ?? null;
}

/**
 * Success-path trigger: a brand-new account (created in the last day) whose
 * replay has not been flushed yet. 'profile_claimed' once it has a claimed
 * profile, otherwise 'signup'.
 */
export async function resolveServerFlushTrigger(
  row: SignupReplayRow | null
): Promise<ReplayFlushTrigger | null> {
  if (!row?.userId || row.flushedAt) return null;
  const [user] = await db
    .select({
      createdAt: users.createdAt,
      claimed: drizzleSql<boolean>`exists (
        select 1 from ${creatorProfiles}
        where ${creatorProfiles.userId} = ${users.id}
          and ${creatorProfiles.isClaimed} = true
      )`,
    })
    .from(users)
    .where(eq(users.id, row.userId))
    .limit(1);
  if (!user) return null;
  if (user.claimed) return 'profile_claimed';
  const isNew = Date.now() - user.createdAt.getTime() < 24 * 60 * 60 * 1000;
  return isNew ? 'signup' : null;
}

/**
 * Record that the browser flushed a buffered replay, if the monthly cap
 * allows. Logs every decision with its trigger. Returns whether it counted.
 */
export async function recordReplayFlush(input: {
  readonly replayId: string;
  readonly trigger: ReplayFlushTrigger;
  readonly onboardingSessionId: string | null;
  readonly userId: string | null;
}): Promise<boolean> {
  const used = await countPeriodFlushes();
  if (used >= REPLAY_MONTHLY_CAP) {
    logger.warn('[replay-flush] suppressed: monthly cap reached', {
      trigger: input.trigger,
      used,
      cap: REPLAY_MONTHLY_CAP,
    });
    return false;
  }
  const now = new Date();
  const updated = await db
    .insert(signupReplays)
    .values({
      sentryReplayId: input.replayId,
      onboardingSessionId: input.onboardingSessionId,
      userId: input.userId,
      flushTrigger: input.trigger,
      flushedAt: now,
    })
    .onConflictDoUpdate({
      target: signupReplays.sentryReplayId,
      set: {
        flushTrigger: drizzleSql`coalesce(${signupReplays.flushTrigger}, excluded.flush_trigger)`,
        flushedAt: drizzleSql`coalesce(${signupReplays.flushedAt}, excluded.flushed_at)`,
        onboardingSessionId: drizzleSql`coalesce(${signupReplays.onboardingSessionId}, excluded.onboarding_session_id)`,
        userId: drizzleSql`coalesce(${signupReplays.userId}, excluded.user_id)`,
        updatedAt: now,
      },
    })
    .returning({ flushTrigger: signupReplays.flushTrigger });
  logger.info('[replay-flush] flushed', {
    trigger: input.trigger,
    recordedTrigger: updated[0]?.flushTrigger ?? null,
    used: used + 1,
    cap: REPLAY_MONTHLY_CAP,
  });
  return true;
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
