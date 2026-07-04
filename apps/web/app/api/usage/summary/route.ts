import { and, count, eq, gte, isNotNull, min } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { getCachedAuth } from '@/lib/auth/cached';
import { isMissingConnectorSchemaError } from '@/lib/connectors/schema-errors';
import { db } from '@/lib/db';
import { getUserByClerkId } from '@/lib/db/queries/shared';
import { suggestedActions } from '@/lib/db/schema/connectors';
import {
  getPlanDisplayName,
  type PlanId,
  resolveCanonicalPlanId,
} from '@/lib/entitlements/registry';
import { getCurrentUserEntitlements } from '@/lib/entitlements/server';
import {
  getRemainingPercent,
  getUsageLimits,
  getWeeklyUsageWindow,
  LIVE_ACTION_WINDOW_MS,
  type UsageSummaryData,
} from '@/lib/usage/limits';
import { logger } from '@/lib/utils/logger';

export const runtime = 'nodejs';

const CACHE_HEADERS = {
  'Cache-Control': 'private, max-age=30, stale-while-revalidate=120',
} as const;

interface UsageCounts {
  readonly suggestionsThisWeek: number;
  readonly liveActionsInWindow: number;
  readonly oldestLiveActionAt: Date | null;
  readonly stale: boolean;
}

const EMPTY_COUNTS: UsageCounts = {
  suggestionsThisWeek: 0,
  liveActionsInWindow: 0,
  oldestLiveActionAt: null,
  stale: false,
};

/**
 * Real usage counts from `suggested_actions`:
 * - suggestions surfaced this calendar week (createdAt >= UTC Monday)
 * - live actions executed in the trailing 5-hour window (executedAt)
 *
 * Fails soft: any DB error (including missing connector schema) degrades to
 * zero counts flagged `_stale` instead of throwing — the pill still renders.
 */
async function loadUsageCounts(
  clerkUserId: string,
  weekStart: Date,
  windowStart: Date
): Promise<UsageCounts> {
  try {
    const dbUser = await getUserByClerkId(db, clerkUserId);
    if (!dbUser) {
      return EMPTY_COUNTS;
    }

    const [suggestionRows, liveActionRows] = await Promise.all([
      db
        .select({ value: count() })
        .from(suggestedActions)
        .where(
          and(
            eq(suggestedActions.userId, dbUser.id),
            gte(suggestedActions.createdAt, weekStart)
          )
        ),
      db
        .select({
          value: count(),
          oldest: min(suggestedActions.executedAt),
        })
        .from(suggestedActions)
        .where(
          and(
            eq(suggestedActions.userId, dbUser.id),
            isNotNull(suggestedActions.executedAt),
            gte(suggestedActions.executedAt, windowStart)
          )
        ),
    ]);

    const oldestRaw = liveActionRows[0]?.oldest ?? null;

    return {
      suggestionsThisWeek: suggestionRows[0]?.value ?? 0,
      liveActionsInWindow: liveActionRows[0]?.value ?? 0,
      oldestLiveActionAt: oldestRaw ? new Date(oldestRaw) : null,
      stale: false,
    };
  } catch (error) {
    if (!isMissingConnectorSchemaError(error)) {
      logger.warn('Usage summary counts unavailable; serving degraded data', {
        error,
      });
    }
    return { ...EMPTY_COUNTS, stale: true };
  }
}

function buildUsageSummary(params: {
  readonly plan: PlanId;
  readonly counts: UsageCounts;
  readonly weekResetAt: Date;
}): UsageSummaryData {
  const { plan, counts, weekResetAt } = params;
  const limits = getUsageLimits(plan);

  const suggestionsRemaining = Math.max(
    0,
    limits.suggestionsPerWeek - counts.suggestionsThisWeek
  );
  const liveActionsRemaining = Math.max(
    0,
    limits.liveActionsPer5h - counts.liveActionsInWindow
  );

  const suggestionsRemainingPercent = getRemainingPercent(
    counts.suggestionsThisWeek,
    limits.suggestionsPerWeek
  );
  const liveActionsRemainingPercent = getRemainingPercent(
    counts.liveActionsInWindow,
    limits.liveActionsPer5h
  );

  const liveActionsResetAt = counts.oldestLiveActionAt
    ? new Date(
        counts.oldestLiveActionAt.getTime() + LIVE_ACTION_WINDOW_MS
      ).toISOString()
    : null;

  return {
    plan,
    planDisplayName: getPlanDisplayName(plan),
    suggestions: {
      used: counts.suggestionsThisWeek,
      limit: limits.suggestionsPerWeek,
      remaining: suggestionsRemaining,
      remainingPercent: suggestionsRemainingPercent,
      resetAt: weekResetAt.toISOString(),
    },
    liveActions: {
      used: counts.liveActionsInWindow,
      limit: limits.liveActionsPer5h,
      remaining: liveActionsRemaining,
      resetAt: liveActionsResetAt,
    },
    remainingPercent: Math.min(
      suggestionsRemainingPercent,
      liveActionsRemainingPercent
    ),
    ...(counts.stale ? { _stale: true as const } : {}),
  };
}

export async function GET() {
  let userId: string | null;
  try {
    ({ userId } = await getCachedAuth());
  } catch (error) {
    // Clerk throws when middleware didn't run (e.g., matcher misconfiguration).
    // Return 401 for that case, but let unexpected errors propagate to Sentry.
    const message = error instanceof Error ? error.message : '';
    if (message.includes('clerkMiddleware')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    throw error;
  }
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const entitlements = await getCurrentUserEntitlements();
  if (!entitlements.isAuthenticated || !entitlements.userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const plan = resolveCanonicalPlanId(entitlements.plan) ?? 'free';

  const now = new Date();
  const week = getWeeklyUsageWindow(now);
  const windowStart = new Date(now.getTime() - LIVE_ACTION_WINDOW_MS);

  const counts = await loadUsageCounts(userId, week.start, windowStart);

  const summary = buildUsageSummary({
    plan,
    counts,
    weekResetAt: week.resetAt,
  });

  return NextResponse.json(summary, { headers: CACHE_HEADERS });
}
