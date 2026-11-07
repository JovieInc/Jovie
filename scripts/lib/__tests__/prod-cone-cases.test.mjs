import { describe, expect, it } from 'vitest';
import {
  anonymousChecks,
  EXPECTED_BROWSER_CHECKS,
  SURFACE_IDS,
} from '../prod-cert.mjs';
import {
  checkoutConeChecks,
  readPricingOptions,
} from '../prod-cert-probes.mjs';
import {
  CONE_CASE_IDS,
  CONE_CASE_PRODUCERS,
  CONE_CASES,
  CONE_UNCOVERED_REASONS,
  coneScoreboard,
  formatConeScoreboardLine,
} from '../prod-cone-cases.mjs';

/** All check ids the anonymous HTTP probes produce, per surface. */
async function anonymousCheckIds() {
  const fakeResponse = {
    status: 200,
    ok: true,
    text: async () => '<html><title>x</title></html>',
    headers: new Map(),
    url: 'https://jov.ie/',
  };
  /** @type {typeof fetch} */
  const fakeFetch = async () => /** @type {any} */ (fakeResponse);
  const probes = anonymousChecks({
    origin: 'https://jov.ie',
    fetchImpl: fakeFetch,
    coneCases: true,
  });
  const ids = {};
  for (const [surface, fns] of Object.entries(probes)) {
    ids[surface] = [];
    for (const pending of fns()) {
      // runCheck never throws: a failing probe still carries its id.
      ids[surface].push((await pending).id);
    }
  }
  return ids;
}

describe('JOV-6920 cone case registry', () => {
  it('freezes the 31-case full-cone denominator', () => {
    expect(CONE_CASE_IDS.length).toBe(31);
    expect(new Set(CONE_CASE_IDS).size).toBe(31);
    const phases = {};
    for (const id of CONE_CASE_IDS) {
      phases[CONE_CASES[id].phase] ??= 0;
      phases[CONE_CASES[id].phase] += 1;
      expect(CONE_CASES[id].requirement.length).toBeGreaterThan(10);
    }
    // JOV-6920 §2: entry 4 · claim/auth 6 · free 4 · offer 5 ·
    // checkout/payment 8 · activation 4.
    expect(phases).toEqual({
      entry: 4,
      claim: 6,
      free: 4,
      offer: 5,
      checkout: 8,
      activation: 4,
    });
  });

  it('every uncovered case names its exact unblock reason', () => {
    for (const id of CONE_CASE_IDS) {
      if (!CONE_CASE_PRODUCERS[id]) {
        expect(CONE_UNCOVERED_REASONS[id], id).toBeTruthy();
        expect(CONE_UNCOVERED_REASONS[id], id).toMatch(
          /no producer|needs|fold it into/
        );
      }
    }
  });

  it('every producer maps to a real surface', () => {
    for (const [id, producer] of Object.entries(CONE_CASE_PRODUCERS)) {
      expect(SURFACE_IDS, id).toContain(producer.surface);
      expect(producer.checkId, id).toMatch(/^[a-z0-9-]+$/);
    }
  });

  it('every anonymous-produced check id is actually produced', async () => {
    const ids = await anonymousCheckIds();
    const browserIds = Object.values(EXPECTED_BROWSER_CHECKS).flat();
    for (const [id, producer] of Object.entries(CONE_CASE_PRODUCERS)) {
      if (browserIds.includes(producer.checkId)) continue; // browser smoke producer
      expect(
        ids[producer.surface],
        `${id} has no anonymous producer`
      ).toBeDefined();
      expect(ids[producer.surface], id).toContain(producer.checkId);
    }
  });
});

describe('coneScoreboard', () => {
  const receipt = (surface, checks, status = 'passed', blocker = null) => ({
    surface,
    status,
    blocker,
    checks,
  });

  it('counts produced checks by their real status', () => {
    const scoreboard = coneScoreboard([
      receipt('landing', [
        { id: 'landing-renders', status: 'passed', summary: 'ok' },
        { id: 'landing-claim-handoff', status: 'passed', summary: 'marker' },
      ]),
      receipt('claim', [
        { id: 'claimed-profile-owned', status: 'passed', summary: 'owns /x' },
      ]),
      receipt('checkout', [
        {
          id: 'offer-canonical-pricing',
          status: 'failed',
          summary: 'wrong amount',
        },
      ]),
    ]);
    expect(scoreboard.total).toBe(31);
    expect(scoreboard.counts.passed).toBe(3);
    expect(scoreboard.counts.failed).toBe(1);
    // 31 - 4 produced-and-run - the uncovered remainder
    expect(scoreboard.counts.uncovered).toBe(27);
    const failed = scoreboard.cases.find(
      c => c.id === 'cone-offer-price-canonical'
    );
    expect(failed.status).toBe('failed');
  });

  it('never counts an uncovered case as passed', () => {
    const scoreboard = coneScoreboard([
      receipt('claim', [
        { id: 'claimed-profile-owned', status: 'passed', summary: 'ok' },
      ]),
    ]);
    const uncovered = scoreboard.cases.filter(c => c.status === 'uncovered');
    expect(uncovered.length).toBeGreaterThan(0);
    for (const c of uncovered) {
      expect(c.summary).toMatch(/no producer|producer registered/);
    }
    expect(
      scoreboard.cases.find(c => c.id === 'cone-claim-intent-survives-auth')
        .status
    ).toBe('uncovered');
  });

  it('a blocked surface blocks its produced cases (served-sha class)', () => {
    const scoreboard = coneScoreboard([
      receipt(
        'landing',
        [
          {
            id: 'served-sha-matches-promotion',
            status: 'blocked',
            summary: 'production serves abc, promotion was def',
          },
        ],
        'blocked',
        'served-sha-matches-promotion: production serves abc, promotion was def'
      ),
    ]);
    const handoff = scoreboard.cases.find(
      c => c.id === 'cone-entry-claim-handoff'
    );
    expect(handoff.status).toBe('blocked');
    expect(handoff.summary).toContain('serves abc');
    expect(scoreboard.counts.passed).toBe(0);
  });

  it('a producer registered but absent from the receipt is uncovered, not passed', () => {
    const scoreboard = coneScoreboard([
      receipt('landing', [
        { id: 'landing-renders', status: 'passed', summary: 'ok' },
      ]),
    ]);
    const handoff = scoreboard.cases.find(
      c => c.id === 'cone-entry-claim-handoff'
    );
    expect(handoff.status).toBe('uncovered');
    expect(handoff.summary).toContain('producer registered');
  });

  it('formats one fixed-denominator line', () => {
    const line = formatConeScoreboardLine(
      coneScoreboard([
        receipt('landing', [
          { id: 'landing-renders', status: 'passed', summary: 'ok' },
          { id: 'landing-claim-handoff', status: 'passed', summary: 'ok' },
        ]),
      ])
    );
    expect(line).toMatch(
      /cone: 2\/31 passed, 0 failed, 0 blocked, 29 uncovered/
    );
  });
});

// JOV-9754: /api/stripe/pricing-options serves `{ pricingOptions, options }`
// (pinned by apps/web/tests/unit/api/stripe/pricing-options.test.ts and
// normalized the same way by usePricingOptionsQuery and the M2 revenue-path
// canary). The checkout cone probe must read that envelope, not a bare array.
const PRO_OFFER_FIXTURE = Object.freeze({
  priceId: 'price_test_artist_presence',
  amount: 1200,
  currency: 'usd',
  interval: 'month',
  description: 'Artist Presence',
});

function pricingFetch(payload) {
  return async () =>
    new Response(JSON.stringify(payload), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
}

async function runOfferChecks(payload) {
  const results = {};
  const run = async (id, fn) => {
    try {
      await fn();
      results[id] = { ok: true };
    } catch (error) {
      results[id] = { ok: false, error: String(error?.message ?? error) };
    }
  };
  const checks = checkoutConeChecks({
    origin: 'https://jov.ie',
    fetchImpl: pricingFetch(payload),
    run,
  }).filter(check => check.id !== 'return-page-no-false-paid');
  await Promise.all(checks);
  return results;
}

describe('checkout cone pricing checks read the served envelope (JOV-9754)', () => {
  it('readPricingOptions unwraps pricingOptions, then options, then a bare array', () => {
    expect(
      readPricingOptions(
        JSON.stringify({
          pricingOptions: [PRO_OFFER_FIXTURE],
          options: [PRO_OFFER_FIXTURE],
        })
      )
    ).toEqual([PRO_OFFER_FIXTURE]);
    expect(
      readPricingOptions(JSON.stringify({ options: [PRO_OFFER_FIXTURE] }))
    ).toEqual([PRO_OFFER_FIXTURE]);
    expect(readPricingOptions(JSON.stringify([PRO_OFFER_FIXTURE]))).toEqual([
      PRO_OFFER_FIXTURE,
    ]);
    expect(readPricingOptions(JSON.stringify({ error: 'x' }))).toEqual([]);
  });

  it('pass on the production envelope with the canonical monthly offer', async () => {
    const results = await runOfferChecks({
      pricingOptions: [PRO_OFFER_FIXTURE],
      options: [PRO_OFFER_FIXTURE],
    });
    expect(results['offer-canonical-pricing'].ok).toBe(true);
    expect(results['offer-no-contradictory-pricing'].ok).toBe(true);
  });

  it('still fail when the payable monthly offer is missing', async () => {
    const results = await runOfferChecks({
      pricingOptions: [],
      options: [],
    });
    expect(results['offer-canonical-pricing'].ok).toBe(false);
    expect(results['offer-no-contradictory-pricing'].ok).toBe(false);
  });

  it('still fail on a contradictory monthly amount', async () => {
    const wrong = { ...PRO_OFFER_FIXTURE, amount: 3900 };
    const results = await runOfferChecks({
      pricingOptions: [PRO_OFFER_FIXTURE, wrong],
      options: [PRO_OFFER_FIXTURE, wrong],
    });
    expect(results['offer-no-contradictory-pricing'].ok).toBe(false);
  });
});
