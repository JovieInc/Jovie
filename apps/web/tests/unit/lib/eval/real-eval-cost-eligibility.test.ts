import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  formatRealEvalProvenance,
  isRealModelEvalEnabled,
  parseRealEvalEligibility,
  resolveRealEvalEligibility,
} from '@/lib/eval/adversarial';
import {
  DEFAULT_BUDGET_CAP_USD,
  MAX_BUDGET_CAP_USD,
  parseBudgetCapUsd,
} from '@/lib/eval/adversarial/budget';

/**
 * JOV-6234: live-model evaluation requires an explicit cost eligibility
 * declaration (account/provider/cap). The default is no-spend — the lane
 * stays disabled without it, and declared caps are bounded.
 */

const BASE_ENV: NodeJS.ProcessEnv = {
  JOVIE_RUN_REAL_MODEL_EVALS: '1',
  AI_GATEWAY_API_KEY: 'gateway-key',
  HELICONE_API_KEY: 'helicone-key',
};

const ELIGIBILITY = JSON.stringify({
  account: 'jovie-eval',
  provider: 'vercel-ai-gateway',
  capUsd: 2,
});

describe('real-model eval cost eligibility', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('stays disabled by default: flag and keys alone never authorize spend', () => {
    expect(isRealModelEvalEnabled({ ...BASE_ENV })).toBe(false);
    expect(resolveRealEvalEligibility({ ...BASE_ENV })).toBeNull();
  });

  it('enables only with a valid explicit eligibility token', () => {
    const env: NodeJS.ProcessEnv = {
      ...BASE_ENV,
      REAL_EVAL_ELIGIBILITY: ELIGIBILITY,
    };
    expect(isRealModelEvalEnabled(env)).toBe(true);
    const resolved = resolveRealEvalEligibility(env);
    expect(resolved).not.toBeNull();
    expect(resolved?.account).toBe('jovie-eval');
    expect(resolved?.provider).toBe('vercel-ai-gateway');
    expect(resolved?.capUsd).toBe(2);
  });

  it('stays disabled when eligibility is malformed', () => {
    for (const malformed of [
      'not-json',
      'null',
      '[]',
      '{}',
      JSON.stringify({ account: '', provider: 'p', capUsd: 2 }),
      JSON.stringify({ account: 'a', provider: '', capUsd: 2 }),
      JSON.stringify({ account: 'a', provider: 'p' }),
      JSON.stringify({ account: 'a', provider: 'p', capUsd: 0 }),
      JSON.stringify({ account: 'a', provider: 'p', capUsd: -1 }),
      JSON.stringify({ account: 'a', provider: 'p', capUsd: '2' }),
    ]) {
      const env: NodeJS.ProcessEnv = {
        ...BASE_ENV,
        REAL_EVAL_ELIGIBILITY: malformed,
      };
      expect(parseRealEvalEligibility(malformed), malformed).toBeNull();
      expect(isRealModelEvalEnabled(env), malformed).toBe(false);
    }
  });

  it('stays disabled without the opt-in flag or provider keys even when eligible', () => {
    const eligible: NodeJS.ProcessEnv = {
      ...BASE_ENV,
      REAL_EVAL_ELIGIBILITY: ELIGIBILITY,
    };
    expect(
      isRealModelEvalEnabled({ ...eligible, JOVIE_RUN_REAL_MODEL_EVALS: '0' })
    ).toBe(false);
    const noGatewayKey: NodeJS.ProcessEnv = { ...eligible };
    delete noGatewayKey.AI_GATEWAY_API_KEY;
    expect(isRealModelEvalEnabled(noGatewayKey)).toBe(false);
    const noHeliconeKey: NodeJS.ProcessEnv = { ...eligible };
    delete noHeliconeKey.HELICONE_API_KEY;
    expect(isRealModelEvalEnabled(noHeliconeKey)).toBe(false);
  });

  it('bounds an out-of-range declared cap to the conservative default', () => {
    const declared = JSON.stringify({
      account: 'a',
      provider: 'p',
      capUsd: MAX_BUDGET_CAP_USD * 10,
    });
    const resolved = resolveRealEvalEligibility({
      ...BASE_ENV,
      REAL_EVAL_ELIGIBILITY: declared,
    });
    // An out-of-range declared cap keeps the lane eligible but applies the
    // conservative default cap instead of honoring the declared value.
    expect(resolved?.capUsd).toBe(DEFAULT_BUDGET_CAP_USD);
    expect(resolved?.declaredCapUsd).toBe(MAX_BUDGET_CAP_USD * 10);
  });

  it('reports machine-readable provenance with the applied cap', () => {
    const resolved = resolveRealEvalEligibility({
      ...BASE_ENV,
      REAL_EVAL_ELIGIBILITY: ELIGIBILITY,
    });
    expect(resolved).not.toBeNull();
    const line = formatRealEvalProvenance(resolved!);
    expect(line).toContain('REAL_EVAL_PROVENANCE');
    expect(line).toContain('account=jovie-eval');
    expect(line).toContain('provider=vercel-ai-gateway');
    expect(line).toContain('capUsd=2.00');
  });
});

describe('parseBudgetCapUsd bounds (JOV-6234)', () => {
  it('keeps a valid in-range cap', () => {
    expect(parseBudgetCapUsd('0.50')).toBe(0.5);
    expect(parseBudgetCapUsd('1.50')).toBe(1.5);
    expect(parseBudgetCapUsd('2')).toBe(2);
    expect(parseBudgetCapUsd(String(MAX_BUDGET_CAP_USD))).toBe(
      MAX_BUDGET_CAP_USD
    );
  });

  it('falls back to the conservative default for out-of-range or malformed caps', () => {
    for (const bad of [
      undefined,
      '',
      'abc',
      '0',
      '-5',
      'NaN',
      'Infinity',
      String(MAX_BUDGET_CAP_USD + 0.01),
      '1000000',
      '1e9',
    ]) {
      expect(parseBudgetCapUsd(bad), String(bad)).toBe(DEFAULT_BUDGET_CAP_USD);
    }
  });
});
