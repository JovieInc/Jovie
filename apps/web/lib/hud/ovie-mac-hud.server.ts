import 'server-only';

import { existsSync, readFileSync } from 'node:fs';
import { sql as drizzleSql } from 'drizzle-orm';
import { getAdminMercuryMetrics } from '@/lib/admin/mercury-metrics';
import { getAdminStripeOverviewMetrics } from '@/lib/admin/stripe-metrics';
import { db, doesTableExist } from '@/lib/db';
import { captureError } from '@/lib/error-tracking';
import {
  composeOvieMacHudSnapshot,
  monthlyToWeeklyUsd,
  type OvieMacHudSnapshot,
  weeklyGrowthFromPeriodRate,
  windowToWeeklyUsd,
} from '@/lib/hud/ovie-mac-hud';
import { WHAT_SHIPPED_STATE_PATH } from '@/lib/hud/what-shipped';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function extractCount(result: unknown): number {
  return Number(
    (result as { rows?: Record<string, unknown>[] }).rows?.[0]?.count ?? 0
  );
}

function readShippingEntries(): {
  readonly entries: readonly unknown[];
  readonly available: boolean;
} {
  if (!existsSync(WHAT_SHIPPED_STATE_PATH)) {
    return { entries: [], available: false };
  }
  try {
    const parsed = JSON.parse(readFileSync(WHAT_SHIPPED_STATE_PATH, 'utf8'));
    const record = parsed as { entries?: unknown; items?: unknown };
    const rawEntries = Array.isArray(parsed)
      ? parsed
      : Array.isArray(record.entries)
        ? record.entries
        : Array.isArray(record.items)
          ? record.items
          : [];
    return { entries: rawEntries, available: true };
  } catch (error) {
    captureError('Ovie Mac HUD shipping receipts unreadable', error);
    return { entries: [], available: false };
  }
}

async function countActiveClaimedProfiles(
  since: Date,
  until: Date
): Promise<number | null> {
  try {
    const hasProfiles = await doesTableExist('creator_profiles');
    const hasClickEvents = await doesTableExist('click_events');
    if (!hasProfiles || !hasClickEvents) return null;

    const result = await db.execute(
      drizzleSql`
        SELECT COUNT(DISTINCT cp.id)::int as count
        FROM creator_profiles cp
        INNER JOIN click_events ce ON ce.creator_profile_id = cp.id
        WHERE cp.is_claimed = true
          AND ce.created_at >= ${since}
          AND ce.created_at < ${until}
          AND ce.is_bot = false
      `
    );

    return extractCount(result);
  } catch (error) {
    captureError('Ovie Mac HUD active-user count failed', error);
    return null;
  }
}

export async function getOvieMacHudSnapshot(
  nowMs: number = Date.now()
): Promise<OvieMacHudSnapshot> {
  const thisWeekStart = new Date(nowMs - 7 * MS_PER_DAY);
  const lastWeekStart = new Date(nowMs - 14 * MS_PER_DAY);
  const generatedAtIso = new Date(nowMs).toISOString();

  const [stripeMetrics, mercuryMetrics, thisWeekUsers, lastWeekUsers] =
    await Promise.all([
      getAdminStripeOverviewMetrics(),
      getAdminMercuryMetrics(),
      countActiveClaimedProfiles(thisWeekStart, new Date(nowMs)),
      countActiveClaimedProfiles(lastWeekStart, thisWeekStart),
    ]);
  const shipping = readShippingEntries();

  const financialAvailable =
    stripeMetrics.isAvailable && mercuryMetrics.isAvailable;
  const weeklyRevenueUsd = financialAvailable
    ? monthlyToWeeklyUsd(stripeMetrics.mrrUsd)
    : null;
  const lastWeekRevenueUsd = financialAvailable
    ? monthlyToWeeklyUsd(stripeMetrics.mrrUsd30dAgo)
    : null;
  const monthRate =
    financialAvailable && stripeMetrics.mrrUsd30dAgo > 0
      ? stripeMetrics.mrrUsd / stripeMetrics.mrrUsd30dAgo - 1
      : null;

  return composeOvieMacHudSnapshot({
    alive: {
      cashUsd: financialAvailable ? mercuryMetrics.balanceUsd : null,
      weeklyBurnUsd: financialAvailable
        ? windowToWeeklyUsd(
            mercuryMetrics.burnRateUsd,
            mercuryMetrics.burnWindowDays
          )
        : null,
      weeklyRevenueUsd,
      weeklyRevenueGrowthRate:
        monthRate == null ? null : weeklyGrowthFromPeriodRate(monthRate, 30),
      available: financialAvailable,
    },
    growth: {
      thisWeekRevenueUsd: weeklyRevenueUsd,
      lastWeekRevenueUsd,
      thisWeekActiveUsers: thisWeekUsers,
      lastWeekActiveUsers: lastWeekUsers,
    },
    shippingEntries: shipping.entries,
    shippingAvailable: shipping.available,
    generatedAtIso,
    nowMs,
  });
}
