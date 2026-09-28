import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  ACTUAL_LANDED_COST_FILTER,
  summarizeActualLandedCost,
} from '@/lib/coding-agent-runs/cost-per-landed-pr';

describe('summarizeActualLandedCost', () => {
  it('does not treat estimated or unknown landed costs as zero', () => {
    const summary = summarizeActualLandedCost([
      { outcomeLabel: 'landed', costSource: 'actual', costUsd: 4 },
      { outcomeLabel: 'landed', costSource: 'estimated', costUsd: 100 },
      { outcomeLabel: 'landed', costSource: 'actual', costUsd: null },
      { outcomeLabel: 'reverted', costSource: 'actual', costUsd: 9 },
    ]);

    expect(summary.landedCount).toBe(1);
    expect(summary.actualCostUsdLanded).toBe(4);
    expect(summary.costPerLandedPrUsd).toBe(4);
  });

  it('uses that same actual-landed filter in the migration view', () => {
    const sql = readFileSync(
      path.resolve(
        import.meta.dirname,
        '../../../../drizzle/migrations/0108_coding_agent_runs.sql'
      ),
      'utf8'
    );
    expect(sql).toContain(ACTUAL_LANDED_COST_FILTER);
    expect(sql).not.toContain(
      'COUNT(*) FILTER (WHERE "outcome_label" = \'landed\')'
    );
  });
});
