import 'server-only';

import { existsSync, readFileSync } from 'node:fs';
import { getAdminMercuryMetrics } from '@/lib/admin/mercury-metrics';
import { getAdminStripeOverviewMetrics } from '@/lib/admin/stripe-metrics';
import { captureError } from '@/lib/error-tracking';
import {
  composeOvieMacHudSnapshot,
  monthlyToWeeklyUsd,
  type OvieMacHudSnapshot,
  weeklyGrowthFromPeriodRate,
  windowToWeeklyUsd,
} from '@/lib/hud/ovie-mac-hud';
import { WHAT_SHIPPED_STATE_PATH } from '@/lib/hud/what-shipped';

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

export async function getOvieMacHudSnapshot(
  nowMs: number = Date.now()
): Promise<OvieMacHudSnapshot> {
  const generatedAtIso = new Date(nowMs).toISOString();
  const [stripeMetrics, mercuryMetrics] = await Promise.all([
    getAdminStripeOverviewMetrics(),
    getAdminMercuryMetrics(),
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
      thisWeekActiveUsers: null,
      lastWeekActiveUsers: null,
    },
    shippingEntries: shipping.entries,
    shippingAvailable: shipping.available,
    generatedAtIso,
    nowMs,
  });
}
