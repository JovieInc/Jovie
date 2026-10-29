import { eq } from 'drizzle-orm';

import { db } from '@/lib/db';
import {
  type AdminCost,
  adminCosts,
  adminSystemSettings,
} from '@/lib/db/schema/admin';
import {
  getSourceFreshnessState,
  type HudSourceFreshnessState,
} from '@/lib/hud/source-trust';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Freshness budget per billing/update cadence. A cost row is only an
 * observation of the current 30-day window while it is younger than one
 * cadence cycle plus a grace period for the provider's invoice/report lag.
 * Unrecognised cadences fall back to the monthly budget.
 */
export const COST_FRESHNESS_BUDGET_MS = {
  daily: 3 * DAY_MS,
  weekly: 10 * DAY_MS,
  'usage-based': 35 * DAY_MS,
  monthly: 45 * DAY_MS,
  quarterly: 100 * DAY_MS,
  annual: 380 * DAY_MS,
} as const;

export type CostCadence = keyof typeof COST_FRESHNESS_BUDGET_MS;

export function normalizeCostCadence(period: string): CostCadence {
  const key = period
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-');
  if (key === 'usage' || key === 'usage-based' || key === 'metered')
    return 'usage-based';
  if (key === 'yearly' || key === 'annually' || key === 'annual')
    return 'annual';
  if (key in COST_FRESHNESS_BUDGET_MS) return key as CostCadence;
  return 'monthly';
}

const CADENCE_LABELS: Record<CostCadence, string> = {
  daily: 'Daily',
  weekly: 'Weekly',
  'usage-based': 'Usage-based',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  annual: 'Annual',
};

export type AdminCostRow = AdminCost & {
  readonly lastUpdatedLabel: string;
  readonly periodLabel: string;
  readonly observedAtIso: string | null;
  readonly freshness: HudSourceFreshnessState;
};

export function mapAdminCostRow(
  row: AdminCost,
  now: Date = new Date()
): AdminCostRow {
  const observedAtIso = row.updatedAt
    ? new Date(row.updatedAt).toISOString()
    : null;
  const cadence = normalizeCostCadence(row.period);
  return {
    ...row,
    periodLabel: CADENCE_LABELS[cadence],
    observedAtIso,
    freshness: getSourceFreshnessState(
      observedAtIso,
      now.getTime(),
      COST_FRESHNESS_BUDGET_MS[cadence]
    ),
    lastUpdatedLabel: row.updatedAt
      ? new Date(row.updatedAt).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
          timeZone: 'UTC',
        })
      : '—',
  };
}

export async function getAdminCosts(
  now: Date = new Date()
): Promise<AdminCostRow[]> {
  const rows = await db
    .select()
    .from(adminCosts)
    .where(eq(adminCosts.isActive, true))
    .orderBy(adminCosts.label);

  return rows.map(row => mapAdminCostRow(row, now));
}

export async function getCostsLastRefreshedAt(): Promise<Date | null> {
  const [row] = await db
    .select({ ts: adminSystemSettings.costsLastRefreshedAt })
    .from(adminSystemSettings)
    .limit(1);
  return row?.ts ?? null;
}

export async function markCostsRefreshed(
  now: Date = new Date()
): Promise<Date> {
  await db
    .update(adminSystemSettings)
    .set({ costsLastRefreshedAt: now, updatedAt: now })
    .where(eq(adminSystemSettings.id, 1));
  return now;
}

/** For v1 manual edit surface (server action friendly). */
export async function upsertAdminCost(input: {
  id?: string;
  label: string;
  monthlyUsd: string;
  observed30dUsd: string;
  period?: string;
  notes?: string;
  externalUrl?: string | null;
}): Promise<void> {
  const now = new Date();

  // Validate decimal strings for numeric columns (per CodeRabbit review)
  const decimalRe = /^-?\d+(\.\d+)?$/;
  if (
    !decimalRe.test(input.monthlyUsd) ||
    !decimalRe.test(input.observed30dUsd)
  ) {
    throw new Error(
      'monthlyUsd and observed30dUsd must be valid decimal strings (e.g. "0", "123.45")'
    );
  }

  if (input.id) {
    const result = await db
      .update(adminCosts)
      .set({
        label: input.label,
        monthlyUsd: input.monthlyUsd,
        observed30dUsd: input.observed30dUsd,
        period: input.period ?? 'monthly',
        notes: input.notes ?? '',
        externalUrl: input.externalUrl ?? null,
        updatedAt: now,
      })
      .where(eq(adminCosts.id, input.id));

    // Verify update affected a row (per CodeRabbit); throw on missing id
    if ((result as { rowCount?: number | null }).rowCount === 0) {
      throw new Error(`Admin cost with id ${input.id} not found`);
    }
  } else {
    await db.insert(adminCosts).values({
      label: input.label,
      monthlyUsd: input.monthlyUsd,
      observed30dUsd: input.observed30dUsd,
      period: input.period ?? 'monthly',
      notes: input.notes ?? '',
      externalUrl: input.externalUrl ?? null,
      isActive: true,
      updatedAt: now,
    });
  }
  await markCostsRefreshed(now);
}
