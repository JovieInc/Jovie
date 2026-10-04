import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  capabilityQuality,
  effectivePrices,
  expectedCostPerSuccess,
  loadOutcomes,
  loadRegistry,
  rank,
} from '../../pr-review/rank.mjs';

const NOW = Date.parse('2026-09-29T00:00:00Z');

const gateway = (id, family, quality, priceIn, priceOut, extra = {}) => ({
  id,
  model: `${family}/${id}`,
  provider: 'vercel-ai-gateway',
  family,
  channel: 'api',
  quality,
  list_price_in: priceIn,
  list_price_out: priceOut,
  capabilities: ['review', 'review-verify', 'code'],
  ...extra,
});

const registry = (models, policy = {}) => ({
  routing_policy: {
    job_token_estimates: {
      review: { input: 1_000_000, output: 0 },
      code: { input: 1_000_000, output: 0 },
    },
    min_samples: 5,
    prior_weight: 2,
    ...policy,
  },
  models,
});

describe('effectivePrices', () => {
  const model = gateway('m', 'f', 50, 1, 2, {
    promo: { price_in: 0, price_out: 0, until: '2026-10-10T00:00:00Z' },
  });

  it('uses an active promo and ignores an expired one', () => {
    expect(effectivePrices(model, NOW)).toMatchObject({
      priceIn: 0,
      basis: 'promo',
    });
    expect(
      effectivePrices(model, Date.parse('2026-10-11T00:00:00Z'))
    ).toMatchObject({ priceIn: 1, priceOut: 2, basis: 'list' });
  });

  it('applies a credit multiplier and accepts epoch-second promo ends', () => {
    const credits = gateway('c', 'f', 50, 1, 2, {
      effective_price_multiplier: 0.5,
      promo: { price_in: 0, price_out: 0, until: NOW / 1000 - 1 },
    });
    expect(effectivePrices(credits, NOW)).toEqual({
      priceIn: 0.5,
      priceOut: 1,
      basis: 'list+credits',
    });
  });
});

describe('expectedCostPerSuccess', () => {
  it('prefers benchmark quality for the capability over global quality', () => {
    const model = gateway('m', 'f', 90, 1, 0, {
      quality_by_capability: { review: 40 },
    });
    expect(capabilityQuality(model, 'review')).toBe(40);
    expect(capabilityQuality(model, 'code')).toBe(90);
    expect(capabilityQuality({}, 'code')).toBe(0);
  });

  it('divides attempt cost by p for retry-until-done work', () => {
    const economics = expectedCostPerSuccess(
      registry([]),
      gateway('m', 'f', 50, 1, 0),
      'code',
      { now: NOW }
    );
    expect(economics.pSuccess).toBeCloseTo(0.5);
    expect(economics.expectedCostPerSuccess).toBeCloseTo(2);
  });

  it('adds the miss cost for one-shot work', () => {
    const economics = expectedCostPerSuccess(
      registry([], { failure_cost_usd: { review: 10 } }),
      gateway('m', 'f', 50, 1, 0),
      'review',
      { now: NOW }
    );
    expect(economics.expectedCostPerSuccess).toBeCloseTo(1 + 0.5 * 10);
  });

  it('blends outcomes with the prior and switches to observed usage at min_samples', () => {
    const model = gateway('m', 'f', 50, 1, 0);
    const few = expectedCostPerSuccess(registry([]), model, 'code', {
      now: NOW,
      outcomes: { m: { code: { attempts: 2, successes: 0 } } },
    });
    expect(few.pSuccess).toBeCloseTo(1 / 4);
    expect(few.samples).toBe(2);
    const many = expectedCostPerSuccess(registry([]), model, 'code', {
      now: NOW,
      outcomes: {
        m: {
          code: {
            attempts: 8,
            successes: 8,
            tokens_in: 8 * 100_000,
            tokens_out: 0,
          },
        },
      },
    });
    expect(many.pSuccess).toBeCloseTo(9 / 10);
    expect(many.attemptTokenCost).toBeCloseTo(0.1);
  });

  it('shows the subscription subsidy in the price', () => {
    const sub = {
      ...gateway('s', 'f', 50, 10, 0),
      channel: 'subscription',
      sub_included_multiplier: 10,
    };
    expect(
      expectedCostPerSuccess(registry([]), sub, 'code', { now: NOW })
    ).toMatchObject({ priceIn: 1, priceBasis: 'subscription-included' });
  });
});

describe('rank', () => {
  const models = [
    gateway('cheap-weak', 'a', 30, 0.1, 0),
    gateway('pricier-strong', 'b', 90, 0.5, 0),
    { ...gateway('other', 'c', 99, 0, 0), provider: 'hyperagent' },
    { ...gateway('no-review', 'd', 99, 0, 0), capabilities: ['code'] },
  ];

  it('lets a pricier model with a better finish rate win', () => {
    const { ranked } = rank(
      registry(models, { failure_cost_usd: { review: 5 } }),
      'review',
      { provider: 'vercel-ai-gateway', now: NOW }
    );
    expect(ranked.map(row => row.id)).toEqual(['pricier-strong', 'cheap-weak']);
  });

  it('refuses families and models below the capability floor', () => {
    const { ranked, refused } = rank(
      registry(models, { min_quality: { 'review-verify': 50 } }),
      'review-verify',
      { provider: 'vercel-ai-gateway', excludeFamilies: ['b'], now: NOW }
    );
    expect(ranked).toEqual([]);
    expect(refused).toEqual([
      { id: 'cheap-weak', reason: 'below_quality_floor' },
      { id: 'pricier-strong', reason: 'excluded_family' },
    ]);
  });

  it('lets replay misses knock a model off the top', () => {
    const outcomes = {
      'pricier-strong': { review: { attempts: 10, successes: 0 } },
    };
    const { ranked } = rank(
      registry(models, { failure_cost_usd: { review: 5 } }),
      'review',
      { provider: 'vercel-ai-gateway', outcomes, now: NOW }
    );
    expect(ranked[0].id).toBe('cheap-weak');
  });

  it('prefers V4.1 Flash over V4 Flash on the real registry priors', () => {
    const { ranked } = rank(loadRegistry(), 'review', {
      provider: 'vercel-ai-gateway',
      now: NOW,
    });
    const ids = ranked.map(row => row.id);
    expect(ids[0]).toBe('gateway-deepseek-v4.1-flash');
    expect(ids.indexOf('gateway-deepseek-v4-flash')).toBeGreaterThan(0);
  });
});

describe('loadOutcomes', () => {
  it('reads a model-outcomes/v1 ledger and ignores anything else', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pr-review-rank-'));
    const good = join(dir, 'good.json');
    writeFileSync(
      good,
      JSON.stringify({
        schema: 'model-outcomes/v1',
        outcomes: { m: { review: { attempts: 1 } } },
      })
    );
    expect(loadOutcomes(good)).toEqual({ m: { review: { attempts: 1 } } });
    const wrong = join(dir, 'wrong.json');
    writeFileSync(wrong, JSON.stringify({ schema: 'other', outcomes: {} }));
    expect(loadOutcomes(wrong)).toEqual({});
    const noOutcomes = join(dir, 'none.json');
    writeFileSync(noOutcomes, JSON.stringify({ schema: 'model-outcomes/v1' }));
    expect(loadOutcomes(noOutcomes)).toEqual({});
    expect(loadOutcomes(join(dir, 'missing.json'))).toEqual({});
    expect(loadOutcomes(undefined)).toEqual({});
  });
});
