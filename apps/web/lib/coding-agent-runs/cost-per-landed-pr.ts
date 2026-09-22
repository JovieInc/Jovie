/**
 * Jev query surface (JOV-6508): cost-per-landed-PR per agent per model.
 *
 * `costPerLandedPr` = sum(cost_usd where cost_source='actual')
 *                     / count(outcome_label='landed')
 * grouped by `source` + `model_name`, over an optional trailing window.
 * Estimated-cost rows never enter the numerator — estimates are not truth.
 */

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
      COUNT(*) FILTER (WHERE outcome_label = 'landed') AS landed_count,
      SUM(cost_usd) FILTER (
        WHERE cost_source = 'actual' AND outcome_label = 'landed'
      ) AS actual_cost_usd_landed,
      CASE
        WHEN COUNT(*) FILTER (WHERE outcome_label = 'landed') = 0 THEN NULL
        ELSE SUM(cost_usd) FILTER (
          WHERE cost_source = 'actual' AND outcome_label = 'landed'
        ) / COUNT(*) FILTER (WHERE outcome_label = 'landed')
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
