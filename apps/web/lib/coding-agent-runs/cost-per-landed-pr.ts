/**
 * Jev query surface (JOV-6508): cost-per-landed-PR per agent per model.
 *
 * Denominator and numerator are landed rows with a non-null actual cost.
 * Estimated or unknown costs are not treated as zero.
 */
export const ACTUAL_LANDED_COST_FILTER =
  "outcome_label = 'landed' AND cost_source = 'actual' AND cost_usd IS NOT NULL";

export interface ActualLandedCostInput {
  readonly outcomeLabel: string;
  readonly costSource: string;
  readonly costUsd: number | null;
}

export function summarizeActualLandedCost(
  rows: readonly ActualLandedCostInput[]
): {
  landedCount: number;
  actualCostUsdLanded: number | null;
  costPerLandedPrUsd: number | null;
} {
  const actual = rows.filter(
    row =>
      row.outcomeLabel === 'landed' &&
      row.costSource === 'actual' &&
      row.costUsd != null
  );
  if (actual.length === 0) {
    return {
      landedCount: 0,
      actualCostUsdLanded: null,
      costPerLandedPrUsd: null,
    };
  }
  const actualCostUsdLanded = actual.reduce(
    (sum, row) => sum + (row.costUsd ?? 0),
    0
  );
  return {
    landedCount: actual.length,
    actualCostUsdLanded,
    costPerLandedPrUsd: actualCostUsdLanded / actual.length,
  };
}

import { sql as drizzleSql } from 'drizzle-orm';
import { db } from '@/lib/db';

export interface CostPerLandedPrRow {
  source: string;
  modelName: string | null;
  landedCount: number;
  actualCostUsdLanded: number | null;
  costPerLandedPrUsd: number | null;
}

export async function costPerLandedPr(opts?: {
  windowDays?: number;
  source?: string;
  modelName?: string;
}): Promise<CostPerLandedPrRow[]> {
  const windowDays = opts?.windowDays;
  const result = await db.execute<{
    source: string;
    model_name: string | null;
    landed_count: string | number;
    actual_cost_usd_landed: string | number | null;
    cost_per_landed_pr_usd: string | number | null;
  }>(drizzleSql`
    SELECT
      source,
      model_name,
      COUNT(*) FILTER (WHERE ${drizzleSql.raw(ACTUAL_LANDED_COST_FILTER)}) AS landed_count,
      SUM(cost_usd) FILTER (
        WHERE ${drizzleSql.raw(ACTUAL_LANDED_COST_FILTER)}
      ) AS actual_cost_usd_landed,
      CASE
        WHEN COUNT(*) FILTER (WHERE ${drizzleSql.raw(ACTUAL_LANDED_COST_FILTER)}) = 0 THEN NULL
        ELSE SUM(cost_usd) FILTER (
          WHERE ${drizzleSql.raw(ACTUAL_LANDED_COST_FILTER)}
        ) / COUNT(*) FILTER (WHERE ${drizzleSql.raw(ACTUAL_LANDED_COST_FILTER)})
      END AS cost_per_landed_pr_usd
    FROM coding_agent_runs
    WHERE 1 = 1
      ${windowDays != null ? drizzleSql`AND merge_timestamp >= NOW() - make_interval(days => ${windowDays})` : drizzleSql``}
      ${opts?.source ? drizzleSql`AND source = ${opts.source}` : drizzleSql``}
      ${opts?.modelName ? drizzleSql`AND model_name = ${opts.modelName}` : drizzleSql``}
    GROUP BY source, model_name
    ORDER BY source, model_name
  `);

  return result.rows.map(r => ({
    source: r.source,
    modelName: r.model_name,
    landedCount: Number(r.landed_count),
    actualCostUsdLanded:
      r.actual_cost_usd_landed == null
        ? null
        : Number(r.actual_cost_usd_landed),
    costPerLandedPrUsd:
      r.cost_per_landed_pr_usd == null
        ? null
        : Number(r.cost_per_landed_pr_usd),
  }));
}
