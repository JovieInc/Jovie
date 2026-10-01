import { describe, expect, it } from 'vitest';
import {
  EvalBudgetTracker,
  parseBudgetCapUsd,
  REAL_EVAL_DEFAULT_CAP_USD,
} from './budget';
import {
  isRealModelEvalCostEligible,
  REAL_EVAL_COST_ELIGIBILITY_TOKEN,
} from './eligibility';
import { isRealModelEvalEnabled } from './helicone-gateway';
import { buildRangeReport, formatRangeReport } from './reporting';

describe('parseBudgetCapUsd (JOV-6234 no-spend default)', () => {
  it('defaults to 0 USD when the cap is unset', () => {
    expect(parseBudgetCapUsd(undefined)).toBe(REAL_EVAL_DEFAULT_CAP_USD);
    expect(REAL_EVAL_DEFAULT_CAP_USD).toBe(0);
  });

  it('defaults to 0 USD for empty, invalid, or non-positive caps', () => {
    expect(parseBudgetCapUsd('')).toBe(0);
    expect(parseBudgetCapUsd('not-a-number')).toBe(0);
    expect(parseBudgetCapUsd('0')).toBe(0);
    expect(parseBudgetCapUsd('-5')).toBe(0);
    // No automatic paid fallback: a previously assumed default of 2 USD
    // must never be resurrected for invalid input.
    expect(parseBudgetCapUsd('abc')).not.toBe(2);
  });

  it('parses an explicitly authorized positive cap', () => {
    expect(parseBudgetCapUsd('2.00')).toBe(2);
    expect(parseBudgetCapUsd('0.5')).toBeCloseTo(0.5);
  });
});

describe('EvalBudgetTracker', () => {
  it('records usage and stays within an explicit cap', () => {
    const tracker = new EvalBudgetTracker(2);
    tracker.recordUsage(100_000, 10_000);
    // 100k input * 3e-6 + 10k output * 15e-6 = 0.3 + 0.15 = 0.45 USD
    expect(tracker.spent).toBeCloseTo(0.45);
    expect(tracker.remaining).toBeCloseTo(1.55);
    expect(() => tracker.assertWithinBudget('real-model eval')).not.toThrow();
  });

  it('throws when spend exceeds the explicit cap', () => {
    const tracker = new EvalBudgetTracker(2);
    tracker.recordUsage(1_000_000, 0);
    expect(() => tracker.assertWithinBudget('real-model eval')).toThrow(
      /exceeded BUDGET_CAP_USD=2\.00/
    );
  });

  it('exposes its cap for spend provenance reporting', () => {
    expect(new EvalBudgetTracker(1.5).cap).toBe(1.5);
    expect(new EvalBudgetTracker(REAL_EVAL_DEFAULT_CAP_USD).cap).toBe(0);
  });
});

describe('range report spend provenance (JOV-6234)', () => {
  it('records the authorized cap alongside pass counts', () => {
    const report = buildRangeReport('golden', [true, true], 2, 1, 2);
    expect(report.capUsd).toBe(2);
    expect(formatRangeReport(report)).toContain('cap_usd=2');
  });

  it('marks unreported caps as 0 (no-spend provenance)', () => {
    const report = buildRangeReport('golden', [true, true], 2, 1);
    expect(report.capUsd).toBe(0);
    expect(formatRangeReport(report)).toContain('cap_usd=0');
  });
});

describe('explicit cost eligibility gate (JOV-6234)', () => {
  it('stays closed for the automatic scheduled environment', () => {
    // The nightly workflow sets the flag, both gateway keys, and a default
    // 2.00 cap — none of that authorizes a paid call anymore.
    const scheduledEnv = {
      JOVIE_RUN_REAL_MODEL_EVALS: '1',
      AI_GATEWAY_API_KEY: 'gw-key',
      HELICONE_API_KEY: 'helicone-key',
      BUDGET_CAP_USD: '2.00',
    };
    expect(isRealModelEvalCostEligible(scheduledEnv)).toBe(false);
    expect(
      isRealModelEvalEnabled(isRealModelEvalCostEligible(scheduledEnv))
    ).toBe(false);
  });

  it('opens only with the operator-typed token plus an explicit positive cap', () => {
    expect(REAL_EVAL_COST_ELIGIBILITY_TOKEN).toBe('REAL_MODEL_EVAL_APPROVED');
    const authorizedEnv = {
      JOVIE_RUN_REAL_MODEL_EVALS: '1',
      AI_GATEWAY_API_KEY: 'gw-key',
      HELICONE_API_KEY: 'helicone-key',
      REAL_EVAL_COST_ELIGIBILITY: 'REAL_MODEL_EVAL_APPROVED',
      BUDGET_CAP_USD: '2.00',
    };
    expect(isRealModelEvalCostEligible(authorizedEnv)).toBe(true);
  });

  it('rejects wrong tokens, empty tokens, and zero or unset caps', () => {
    expect(
      isRealModelEvalCostEligible({
        REAL_EVAL_COST_ELIGIBILITY: 'REAL_MODEL_EVAL_APPROVED',
        BUDGET_CAP_USD: '0',
      })
    ).toBe(false);
    expect(
      isRealModelEvalCostEligible({
        REAL_EVAL_COST_ELIGIBILITY: 'REAL_MODEL_EVAL_APPROVED',
      })
    ).toBe(false);
    expect(
      isRealModelEvalCostEligible({
        REAL_EVAL_COST_ELIGIBILITY: 'yes',
        BUDGET_CAP_USD: '2.00',
      })
    ).toBe(false);
    expect(
      isRealModelEvalCostEligible({
        BUDGET_CAP_USD: '2.00',
      })
    ).toBe(false);
  });
});
