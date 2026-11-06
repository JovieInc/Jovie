import { describe, expect, it } from 'vitest';
import { digestBlock, promotionRows, summarize } from '../merge-to-live.mjs';

const SHA = 'a'.repeat(40);
const t = m => new Date(Date.UTC(2026, 10, 1, 0, m)).toISOString();
const entry = (
  sha,
  id,
  merged,
  created,
  first,
  ps,
  pe,
  conclusion = 'success'
) => ({
  run: {
    id,
    display_title: `Production Controller ${sha} from CI 1 attempt 1`,
    created_at: t(created),
  },
  mergedAt: t(merged),
  jobs: [
    {
      name: 'Bind completed staging to source CI',
      started_at: t(first),
      completed_at: t(first),
      conclusion: 'success',
    },
    {
      name: 'Production Release / Promote to Production',
      started_at: t(ps),
      completed_at: t(pe),
      conclusion,
    },
  ],
});

describe('merge-to-live', () => {
  it('splits lead time into stages and names the slowest', () => {
    const rows = promotionRows([entry(SHA, 1, 0, 60, 62, 70, 85)]);
    expect(rows[0].leadSeconds).toBe(85 * 60);
    const s = summarize(rows);
    expect(s.stages.ci_staging.p50).toBe(60 * 60);
    expect(s.stages.promote.p50).toBe(15 * 60);
    expect(s.slowestStage).toBe('ci_staging');
    expect(digestBlock(s)).toContain('p50 85m');
  });

  it('keeps the earliest promote per sha and skips failed promotions', () => {
    const rows = promotionRows([
      entry(SHA, 2, 0, 60, 62, 70, 120),
      entry(SHA, 1, 0, 60, 62, 70, 85),
      entry('b'.repeat(40), 3, 0, 10, 11, 12, 13, 'failure'),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].runId).toBe(1);
  });

  it('computes p50 and p95 over the latest promotions', () => {
    const many = Array.from({ length: 10 }, (_, i) =>
      entry(String(i).repeat(40), i, 0, 30, 31, 40, 50 + i * 10)
    );
    const s = summarize(promotionRows(many));
    expect(s.promotions).toBe(10);
    expect(s.leadSeconds.p95).toBe(140 * 60);
  });
});
