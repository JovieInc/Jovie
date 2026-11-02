/**
 * Deterministic tests for the live runner: spend guards, the per-run case
 * cap, the judge calibration set and the gbrain metric page. No model calls.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import calibration from './calibration.json';
import { HELPFULNESS_CASES } from './cases';
import { judgeScore } from './scoring';
import { HELPFULNESS_EVAL_VERSION } from './spec';

describe('case cap', () => {
  it('keeps every selection within the per-run cap', async () => {
    const { MAX_CASES_PER_RUN, selectCases } = await import('./run');
    expect(HELPFULNESS_CASES.length).toBeLessThanOrEqual(MAX_CASES_PER_RUN);
    expect(selectCases({ subset: 'ci', cases: [] }).length).toBeGreaterThan(4);
    expect(selectCases({ subset: null, cases: ['greeting'] })).toHaveLength(1);
  });
});

describe('spend guards', () => {
  it('refuses AI Gateway credentials unless explicitly allowed', async () => {
    const { assertNoGatewaySpend } = await import('./run');
    expect(() =>
      assertNoGatewaySpend(
        { AI_GATEWAY_API_KEY: 'k' } as NodeJS.ProcessEnv,
        false
      )
    ).toThrow(/allow-gateway-spend/);
    expect(() =>
      assertNoGatewaySpend(
        { AI_GATEWAY_API_KEY: 'k' } as NodeJS.ProcessEnv,
        true
      )
    ).not.toThrow();
    expect(() =>
      assertNoGatewaySpend({} as NodeJS.ProcessEnv, false)
    ).not.toThrow();
  });
});

describe('judge calibration set', () => {
  it('references real cases and spans good and bad replies', () => {
    const ids = new Set(HELPFULNESS_CASES.map(c => c.id));
    const scores = calibration.examples.map(e => {
      expect(ids.has(e.id)).toBe(true);
      return judgeScore(e.reference as Parameters<typeof judgeScore>[0]);
    });
    expect(Math.min(...scores)).toBeLessThan(50);
    expect(Math.max(...scores)).toBeGreaterThan(80);
  });
});

describe('gbrain metric page', () => {
  const row = (score: number, ranAt: string) => ({
    ranAt,
    version: HELPFULNESS_EVAL_VERSION,
    model: '@cf/zai-org/glm-5.3',
    judge: '@cf/moonshotai/kimi-k2.6',
    subset: 'all',
    score,
    passRate: 0.8,
    hardPassRate: 0.84,
    behaviorMeans: { truthful: 0.64, grounded: 1 },
    latencyP50Ms: 13_000,
    latencyP95Ms: 40_000,
    cases: 25,
    worst: [{ id: 'followup-do-it', score: 40, why: 'did not call the tool' }],
  });

  it('appends runs, shows the delta and round-trips its history', async () => {
    const { parseHistory, renderMetricPage } = await import('./publish');
    const first = renderMetricPage([row(42, '2026-10-28T00:00:00Z')]);
    const second = renderMetricPage([
      ...parseHistory(first),
      row(80, '2026-10-29T00:00:00Z'),
    ]);
    expect(parseHistory(second)).toHaveLength(2);
    expect(second).toContain('**80/100** (+38 vs previous comparable run)');
    expect(second).toContain('Weakest behaviors first: truthful 0.64');
    expect(second).toContain('- followup-do-it (40): did not call the tool');
    expect(parseHistory('no history here')).toEqual([]);
  });
});
