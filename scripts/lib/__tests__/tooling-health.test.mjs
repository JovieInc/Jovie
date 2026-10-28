import { describe, expect, it } from 'vitest';

import {
  alertAction,
  consecutiveRed,
  percentile,
  rollup,
  validateTools,
} from '../tooling-health.mjs';

const now = Date.parse('2026-10-28T20:00:00Z');
const row = (min, tool, ok, ms) => ({
  at: new Date(now - min * 60000).toISOString(),
  tool,
  ok,
  ms,
});

describe('tooling health', () => {
  it('computes percentiles', () => {
    expect(percentile([1, 2, 3, 4, 100], 50)).toBe(3);
    expect(percentile([1, 2, 3, 4, 100], 95)).toBe(100);
    expect(percentile([], 50)).toBeNull();
  });
  it('rolls up 24h window and last-good', () => {
    const r = rollup(
      [
        row(2000, 'a', true, 1),
        row(30, 'a', true, 10),
        row(20, 'a', false, 0),
        row(10, 'a', true, 30),
      ],
      now
    );
    expect(r.a.runs24h).toBe(3);
    expect(r.a.okPct24h).toBe(67);
    expect(r.a.p95Ms).toBe(30);
    expect(r.a.lastGood).toBe(new Date(now - 10 * 60000).toISOString());
  });
  it('counts consecutive red and alerts on 2, clears on green', () => {
    const h = [
      row(30, 'a', true, 1),
      row(20, 'a', false, 0),
      row(10, 'a', false, 0),
      row(5, 'b', true, 1),
    ];
    expect(consecutiveRed(h, 'a')).toBe(2);
    expect(alertAction({ red: 1, previousRed: 0 })).toBe('none');
    expect(alertAction({ red: 2, previousRed: 1 })).toBe('red');
    expect(alertAction({ red: 0, previousRed: 3 })).toBe('green');
  });
  it('validates inventory shape', () => {
    expect(
      validateTools([{ tool: 'x', owner: 'o', probe: 'p', cost: 'c' }])
    ).toEqual([]);
    expect(validateTools([{ tool: 'x' }]).length).toBe(3);
  });
});
