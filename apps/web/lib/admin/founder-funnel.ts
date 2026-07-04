import 'server-only';

import { sql as drizzleSql } from 'drizzle-orm';

import { db } from '@/lib/db';
import { captureError } from '@/lib/error-tracking';

export type FounderFunnelTimeRange = '7d' | '30d' | 'all';

export interface FounderFunnelStage {
  /** Machine-readable stage key */
  key: string;
  /** Human-readable stage label */
  label: string;
  /** Short description of what the stage counts */
  description: string;
  /** Absolute count for this stage */
  count: number;
  /** Conversion rate from previous stage (0-1), null for first stage */
  conversionRate: number | null;
  /** Number lost between the previous stage and this one (null for first stage) */
  dropOff: number | null;
}

export interface FounderFunnelData {
  stages: FounderFunnelStage[];
  timeRange: FounderFunnelTimeRange;
  /**
   * Stage key with the largest absolute drop-off from its previous stage —
   * the biggest leak in the funnel. Null when the funnel is empty.
   */
  biggestDropOffKey: string | null;
  errors: string[];
}

const STAGE_DEFS = [
  {
    key: 'onboarding_chats',
    label: 'Onboarding chats',
    description: 'Anonymous visitors who started the onboarding chat',
  },
  {
    key: 'accounts_created',
    label: 'Accounts created',
    description: 'Signups (users created)',
  },
  {
    key: 'profile_claimed',
    label: 'Profile claimed',
    description: 'Users with a claimed creator profile',
  },
  {
    key: 'onboarding_complete',
    label: 'Onboarding complete',
    description: 'Users whose profile finished onboarding',
  },
  {
    key: 'paid',
    label: 'Paid',
    description: 'Users with an active Stripe subscription',
  },
] as const;

function toDateFilter(timeRange: FounderFunnelTimeRange): Date | null {
  if (timeRange === 'all') return null;
  const now = new Date();
  const days = timeRange === '7d' ? 7 : 30;
  now.setDate(now.getDate() - days);
  return now;
}

function buildStages(counts: readonly number[]): FounderFunnelStage[] {
  return STAGE_DEFS.map((def, i) => {
    const count = counts[i] ?? 0;
    if (i === 0) {
      return { ...def, count, conversionRate: null, dropOff: null };
    }
    const prev = counts[i - 1] ?? 0;
    return {
      ...def,
      count,
      conversionRate: prev > 0 ? count / prev : null,
      dropOff: prev > 0 ? prev - count : null,
    };
  });
}

function findBiggestDropOff(stages: FounderFunnelStage[]): string | null {
  let biggestKey: string | null = null;
  let biggest = 0;
  for (const stage of stages) {
    if (stage.dropOff !== null && stage.dropOff > biggest) {
      biggest = stage.dropOff;
      biggestKey = stage.key;
    }
  }
  return biggestKey;
}

/**
 * Queries the database for the founder conversion funnel (#11500):
 * onboarding chat → account created → profile claimed → onboarding
 * complete → paid.
 *
 * Stage sources (all first-party, reconciled with existing admin metrics):
 * 1. Onboarding chats — anonymous onboarding conversations
 *    (chat_conversations with a session_id), the top-of-funnel proxy for
 *    landing visitors engaging. Marketing-site raw pageviews have no
 *    first-party store yet, so the funnel starts at the first tracked touch.
 * 2. Accounts created — rows in users (excluding soft-deleted).
 * 3. Profile claimed — users with a claimed creator_profile
 *    (same definition as lib/admin/conversion-funnel.ts "With Profiles").
 * 4. Onboarding complete — users with creator_profiles.onboarding_completed_at.
 * 5. Paid — users with a Stripe subscription id (same definition as the
 *    existing conversion funnel's "Paid" stage).
 *
 * Uses a single SQL query with CTEs for efficiency.
 */
export async function getFounderFunnelData(
  timeRange: FounderFunnelTimeRange = '30d'
): Promise<FounderFunnelData> {
  const errors: string[] = [];
  const dateFilter = toDateFilter(timeRange);

  try {
    type FunnelRow = {
      onboarding_chats: string | number;
      accounts_created: string | number;
      profile_claimed: string | number;
      onboarding_complete: string | number;
      paid_users: string | number;
    };

    const convoDateConstraint = dateFilter
      ? drizzleSql`AND cc.created_at >= ${dateFilter.toISOString()}`
      : drizzleSql``;
    const userDateConstraint = dateFilter
      ? drizzleSql`AND u.created_at >= ${dateFilter.toISOString()}`
      : drizzleSql``;

    const result = await db.execute<FunnelRow>(
      drizzleSql`
        WITH onboarding_chats AS (
          SELECT count(*) AS n
          FROM chat_conversations cc
          WHERE cc.session_id IS NOT NULL
          ${convoDateConstraint}
        ),
        base_users AS (
          SELECT u.id, u.stripe_subscription_id
          FROM users u
          WHERE u.deleted_at IS NULL
          ${userDateConstraint}
        ),
        claimed AS (
          SELECT DISTINCT cp.user_id
          FROM creator_profiles cp
          INNER JOIN base_users bu ON bu.id = cp.user_id
          WHERE cp.is_claimed = true
        ),
        onboarded AS (
          SELECT DISTINCT cp.user_id
          FROM creator_profiles cp
          INNER JOIN base_users bu ON bu.id = cp.user_id
          WHERE cp.onboarding_completed_at IS NOT NULL
        ),
        paid AS (
          SELECT bu.id
          FROM base_users bu
          WHERE bu.stripe_subscription_id IS NOT NULL
        )
        SELECT
          (SELECT n FROM onboarding_chats) AS onboarding_chats,
          (SELECT count(*) FROM base_users) AS accounts_created,
          (SELECT count(*) FROM claimed) AS profile_claimed,
          (SELECT count(*) FROM onboarded) AS onboarding_complete,
          (SELECT count(*) FROM paid) AS paid_users
        ;
      `
    );

    const row = result.rows?.[0];
    const counts = [
      Number(row?.onboarding_chats ?? 0),
      Number(row?.accounts_created ?? 0),
      Number(row?.profile_claimed ?? 0),
      Number(row?.onboarding_complete ?? 0),
      Number(row?.paid_users ?? 0),
    ];

    const stages = buildStages(counts);

    return {
      stages,
      timeRange,
      biggestDropOffKey: findBiggestDropOff(stages),
      errors,
    };
  } catch (error) {
    captureError('Error fetching founder funnel data', error);
    errors.push(
      `Founder funnel query: ${error instanceof Error ? error.message : 'unknown'}`
    );

    return {
      stages: buildStages([0, 0, 0, 0, 0]),
      timeRange,
      biggestDropOffKey: null,
      errors,
    };
  }
}
