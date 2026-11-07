import { describe, expect, it } from 'vitest';
import {
  checkoutConeChecks,
  readPricingOptions,
} from '../prod-cert-probes.mjs';

// The exact shape production served on 2026-11-07 (JOV-9815): a dual-field
// envelope, not a bare array.
const PRO = {
  priceId: 'price_test_artist_presence',
  amount: 1200,
  currency: 'usd',
  interval: 'month',
  description: 'Artist Presence',
};
const ENVELOPE = { pricingOptions: [PRO], options: [PRO] };

function jsonFetch(payload) {
  return async () =>
    new Response(JSON.stringify(payload), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
}

async function runPricingChecks(payload) {
  const results = {};
  const run = async (id, fn) => {
    try {
      results[id] = { ok: true, value: await fn() };
    } catch (error) {
      results[id] = { ok: false, error: String(error?.message ?? error) };
    }
  };
  await Promise.all(
    checkoutConeChecks({
      origin: 'https://jov.ie',
      fetchImpl: jsonFetch(payload),
      run,
    }).slice(0, 2)
  );
  return results;
}

describe('readPricingOptions', () => {
  it('reads the pricingOptions envelope the API serves', () => {
    expect(readPricingOptions(JSON.stringify(ENVELOPE))).toEqual([PRO]);
  });

  it('falls back to options, then a bare array, then empty', () => {
    expect(readPricingOptions(JSON.stringify({ options: [PRO] }))).toEqual([
      PRO,
    ]);
    expect(readPricingOptions(JSON.stringify([PRO]))).toEqual([PRO]);
    expect(readPricingOptions(JSON.stringify({ error: 'x' }))).toEqual([]);
  });
});

describe('checkout cone pricing checks (JOV-9815)', () => {
  it('pass on the production envelope with the canonical $12 offer', async () => {
    const results = await runPricingChecks(ENVELOPE);
    expect(results['offer-canonical-pricing']).toMatchObject({ ok: true });
    expect(results['offer-no-contradictory-pricing']).toMatchObject({
      ok: true,
    });
  });

  it('still fail when the payable offer is missing', async () => {
    const results = await runPricingChecks({ pricingOptions: [], options: [] });
    expect(results['offer-canonical-pricing'].ok).toBe(false);
    expect(results['offer-no-contradictory-pricing'].ok).toBe(false);
  });

  it('still fail on a contradictory monthly price', async () => {
    const wrong = { ...PRO, amount: 3900 };
    const results = await runPricingChecks({
      pricingOptions: [PRO, wrong],
      options: [PRO, wrong],
    });
    expect(results['offer-no-contradictory-pricing'].ok).toBe(false);
  });
});
