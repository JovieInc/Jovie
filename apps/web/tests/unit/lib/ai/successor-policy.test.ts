import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { AI_ROUTING } from '@/lib/ai/routing';
import {
  blendedUsdPerM,
  DEFAULT_USAGE_MIX,
  decideSuccessorSwitch,
  SUCCESSOR_POLICY_COVERED_MODELS,
  SUCCESSOR_SWITCH_MAX_DELTA_PCT,
} from '@/lib/ai/successor-policy';

/**
 * Successor auto-routing spend guard (JOV-13153).
 *
 * Pins the rule end-to-end, fail-closed: the successor-switch path REFUSES
 * when the price check fails (blended delta above the threshold), when
 * pricing data is missing on either side, and when the usage mix is unusable
 * — every refusal flags Tim with the delta instead of switching. The
 * threshold itself (+5%, PENDING TIM CONFIRMATION) and the covered models are
 * cross-checked against the config mirrors in routing.json and
 * ops/models/task-registry.json so the config can never drift from the code.
 */

const taskRegistry = JSON.parse(
  readFileSync(
    new URL('../../../../../ops/models/task-registry.json', import.meta.url),
    'utf8'
  )
) as { successorPolicy?: { coveredModels: string[]; sourceOfTruth: string } };

const pricing = (inputUsdPerM: number, outputUsdPerM: number) => ({
  inputUsdPerM,
  outputUsdPerM,
});

describe('successor-policy decision (JOV-13153)', () => {
  it('switches when the successor costs the same', () => {
    const decision = decideSuccessorSwitch({
      currentPricing: pricing(0.2, 1.5),
      successor: {
        modelId: 'successor/same-price',
        pricing: pricing(0.2, 1.5),
      },
    });
    expect(decision.action).toBe('switch');
    expect(decision.action === 'switch' && decision.blendedDeltaPct).toBe(0);
  });

  it('switches when the successor is cheaper', () => {
    const decision = decideSuccessorSwitch({
      currentPricing: pricing(0.3, 1.2),
      successor: { modelId: 'successor/cheaper', pricing: pricing(0.1, 0.5) },
    });
    expect(decision.action).toBe('switch');
    expect(
      decision.action === 'switch' && decision.blendedDeltaPct
    ).toBeLessThan(0);
  });

  it('switches at exactly the +5% boundary ("at most +5%")', () => {
    // 0.10 -> 0.105 blended is exactly +5% (and IEEE-754 noise must not
    // turn the legal boundary into a refusal).
    const decision = decideSuccessorSwitch({
      currentPricing: pricing(0.1, 0.1),
      successor: {
        modelId: 'successor/boundary',
        pricing: pricing(0.105, 0.105),
      },
    });
    expect(decision.action).toBe('switch');
  });

  it('REFUSES just above the threshold and flags Tim with the delta', () => {
    const decision = decideSuccessorSwitch({
      currentPricing: pricing(0.1, 0.1),
      successor: { modelId: 'successor/6pct', pricing: pricing(0.106, 0.106) },
    });
    expect(decision.action).toBe('refuse-and-flag');
    if (decision.action === 'refuse-and-flag') {
      expect(decision.flagTo).toBe('Tim');
      expect(decision.reason).toBe('blended-increase-above-threshold');
      expect(decision.blendedDeltaPct).toBeGreaterThan(5);
      expect(decision.currentBlendedUsdPerM).toBeCloseTo(0.1);
      expect(decision.successorBlendedUsdPerM).toBeCloseTo(0.106);
    }
  });

  it('REFUSES the real-world deepseek-v4.1-flash price step over glm-5.3-flash', () => {
    // Gateway list prices: glm-5.3-flash $0.20/$1.50 per M; deepseek v4.1
    // flash $0.30/$1.20 per M. On the default 20k-in/1k-out mix the blended
    // cost rises ~31% — far past +5%, so the rule must refuse and flag.
    const decision = decideSuccessorSwitch({
      currentPricing: pricing(0.2, 1.5),
      successor: {
        modelId: '@cf/deepseek-ai/deepseek-v4.1-flash-1017',
        pricing: pricing(0.3, 1.2),
      },
    });
    expect(decision.action).toBe('refuse-and-flag');
    if (decision.action === 'refuse-and-flag') {
      expect(decision.reason).toBe('blended-increase-above-threshold');
      expect(decision.blendedDeltaPct).toBeGreaterThan(30);
    }
  });

  it('REFUSES (fail closed) when successor pricing is missing', () => {
    const decision = decideSuccessorSwitch({
      currentPricing: pricing(0.2, 1.5),
      successor: { modelId: 'successor/unknown-price', pricing: null },
    });
    expect(decision.action).toBe('refuse-and-flag');
    if (decision.action === 'refuse-and-flag') {
      expect(decision.reason).toBe('successor-pricing-missing');
      expect(decision.flagTo).toBe('Tim');
      expect(decision.blendedDeltaPct).toBeNull();
    }
  });

  it('REFUSES (fail closed) when successor pricing is unusable', () => {
    for (const bad of [
      pricing(Number.NaN, 1),
      pricing(0, 1),
      pricing(-0.3, 1.2),
      pricing(Number.POSITIVE_INFINITY, 1.2),
    ]) {
      const decision = decideSuccessorSwitch({
        currentPricing: pricing(0.2, 1.5),
        successor: { modelId: 'successor/bad-price', pricing: bad },
      });
      expect(decision.action).toBe('refuse-and-flag');
      expect(decision.action === 'refuse-and-flag' && decision.reason).toBe(
        'successor-pricing-missing'
      );
    }
  });

  it('REFUSES (fail closed) when current pricing is missing', () => {
    const decision = decideSuccessorSwitch({
      currentPricing: null,
      successor: { modelId: 'successor/cheap', pricing: pricing(0.1, 0.5) },
    });
    expect(decision.action).toBe('refuse-and-flag');
    expect(decision.action === 'refuse-and-flag' && decision.reason).toBe(
      'current-pricing-missing'
    );
  });

  it('REFUSES (fail closed) when the usage mix is unusable', () => {
    const decision = decideSuccessorSwitch({
      currentPricing: pricing(0.2, 1.5),
      successor: { modelId: 'successor/cheap', pricing: pricing(0.1, 0.5) },
      usageMix: { inputTokens: 0, outputTokens: 1_000 },
    });
    expect(decision.action).toBe('refuse-and-flag');
    expect(decision.action === 'refuse-and-flag' && decision.reason).toBe(
      'usage-mix-invalid'
    );
  });

  it('does nothing when no successor candidate exists', () => {
    const decision = decideSuccessorSwitch({
      currentPricing: pricing(0.2, 1.5),
      successor: null,
    });
    expect(decision.action).toBe('none');
  });

  it('blends input and output prices by the usage mix', () => {
    // (20_000 * $0.20 + 1_000 * $1.50) / 21_000 = $0.2619… per M tokens.
    expect(blendedUsdPerM(pricing(0.2, 1.5), DEFAULT_USAGE_MIX)).toBeCloseTo(
      0.2619,
      3
    );
  });
});

describe('successor-policy config mirrors (JOV-13153)', () => {
  it('routing.json successorPolicy matches the policy module', () => {
    const config = AI_ROUTING.successorPolicy;
    expect(config).toBeDefined();
    expect(config?.maxBlendedDeltaPct).toBe(SUCCESSOR_SWITCH_MAX_DELTA_PCT);
    expect(config?.coveredModels).toEqual([...SUCCESSOR_POLICY_COVERED_MODELS]);
    expect(config?.usageMix).toEqual({ ...DEFAULT_USAGE_MIX });
    expect(config?.flagTo).toBe('Tim');
    // The threshold stays visibly unconfirmed until Tim confirms it himself.
    expect(config?.status).toMatch(/PENDING TIM CONFIRMATION/u);
    expect(config?.trigger).toMatch(/event-driven/iu);
    expect(config?.trigger).not.toMatch(/cron|polling/iu);
  });

  it('ops/models/task-registry.json points at the policy module and covers the same models', () => {
    const config = taskRegistry.successorPolicy;
    expect(config).toBeDefined();
    expect(config?.coveredModels).toEqual([...SUCCESSOR_POLICY_COVERED_MODELS]);
    expect(config?.sourceOfTruth).toContain(
      'apps/web/lib/ai/successor-policy.ts'
    );
  });
});
