import { describe, expect, it } from 'vitest';
import {
  anonymousChecks,
  EXPECTED_BROWSER_CHECKS,
  runCheck,
  SURFACE_IDS,
} from '../prod-cert.mjs';
import {
  checkoutConeChecks,
  readPricingOptions,
} from '../prod-cert-probes.mjs';
import {
  jankChecks,
  paidEntries,
  penDesignChecks,
  STRANGER_USER_AGENT,
  strangerChecks,
} from '../prod-cert-truth.mjs';
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

describe('truthful certification: a stranger, no token, no canary', () => {
  const ORIGIN = 'https://jov.ie';
  /** @param {Record<string, { url?: string, body?: string, status?: number }>} routes */
  const strangerFetch =
    (routes, seen = []) =>
    async (url, init) => {
      seen.push({ path: new URL(url).pathname, headers: init?.headers ?? {} });
      const r = routes[new URL(url).pathname] ?? {};
      return {
        status: r.status ?? 200,
        url: r.url ?? String(url),
        text: async () => r.body ?? '<title>Jovie</title>',
      };
    };
  const runAll = (fetchImpl, surface) => {
    const run = (id, fn) => runCheck(id, fn);
    const checks = strangerChecks({ origin: ORIGIN, fetchImpl, run });
    const out = checks[surface]();
    return Promise.all(Array.isArray(out) ? out : [out]);
  };
  const waitlisted = { url: `${ORIGIN}/waitlist`, body: 'Request access' };

  it('fails /signup and /start when a stranger lands on the waitlist', async () => {
    const fetchImpl = strangerFetch({
      '/signup': waitlisted,
      '/start': waitlisted,
    });
    const [signup] = await runAll(fetchImpl, 'signup');
    const [start] = await runAll(fetchImpl, 'start');
    expect(signup).toMatchObject({ id: 'signup-renders', status: 'failed' });
    expect(signup.summary).toContain('lands on the waitlist');
    expect(start).toMatchObject({ id: 'start-renders', status: 'failed' });
  });

  it('fails /signup and /start when a 200 page renders error text', async () => {
    const broken = {
      body: '<h2>Application error: a client-side exception</h2>',
    };
    const fetchImpl = strangerFetch({ '/signup': broken, '/start': broken });
    const [signup] = await runAll(fetchImpl, 'signup');
    const [start] = await runAll(fetchImpl, 'start');
    expect(signup).toMatchObject({ id: 'signup-renders', status: 'failed' });
    expect(signup.summary).toContain('error text rendered');
    expect(start).toMatchObject({ id: 'start-renders', status: 'failed' });
  });

  it('passes when signup is open, and sends no synthetic or passage header', async () => {
    const seen = [];
    const [signup] = await runAll(strangerFetch({}, seen), 'signup');
    expect(signup.status).toBe('passed');
    expect(Object.keys(seen[0].headers)).toEqual(['user-agent']);
    expect(STRANGER_USER_AGENT).not.toMatch(/synthetic|prod-cert|jovie/i);
  });

  it('fails a homepage that offers a stranger no way in (invite only)', async () => {
    const [entry] = await runAll(
      strangerFetch({
        '/': { body: '<a href="#waitlist">Request an Invite</a>' },
      }),
      'landing'
    );
    expect(entry.status).toBe('failed');
    expect(entry.summary).toContain('invite only');
  });

  it('follows the $12 CTA from /pricing and fails when it ends on the waitlist', async () => {
    const pricing = {
      body: '<a href="/claim?plan=pro">Start Artist Presence</a>',
    };
    const [open] = await runAll(
      strangerFetch({ '/pricing': pricing }),
      'checkout'
    );
    expect(open).toMatchObject({
      id: 'stranger-paid-cta-reaches-signup',
      status: 'passed',
    });
    const [closed] = await runAll(
      strangerFetch({ '/pricing': pricing, '/start': waitlisted }),
      'checkout'
    );
    expect(closed.status).toBe('failed');
    expect(paidEntries('<a href="/signup?plan=free">f</a>')).toEqual([]);
  });

  it('turns layout shift and long frames into checks at the good-experience bounds', () => {
    const checks = jankChecks(
      [
        { contractId: 'jank.cls', value: 0.04 },
        { contractId: 'jank.cls', value: 0.27 },
        { contractId: 'jank.worst-frame-ms', value: 120 },
        { contractId: 'other', value: 9999 },
      ],
      'T'
    );
    expect(checks.map(c => [c.id, c.status])).toEqual([
      ['jank.cls', 'failed'],
      ['jank.worst-frame-ms', 'passed'],
    ]);
    expect(jankChecks([])).toEqual([]);
  });

  it('judges a frame measured on three loads by its median and names the worst load', () => {
    const [noisy] = jankChecks(
      [
        {
          contractId: 'jank.worst-frame-ms',
          value: 176,
          samples: [376.6, 106, 176],
        },
      ],
      'T'
    );
    expect(noisy.status).toBe('passed');
    expect(noisy.summary).toBe(
      'longest blocked frame (ms) 176 (load judged on the middle of 3; worst load 376.6) (limit 200)'
    );
    const [slow] = jankChecks(
      [
        {
          contractId: 'jank.worst-frame-ms',
          value: 240,
          samples: [260, 240, 190],
        },
      ],
      'T'
    );
    expect(slow.status).toBe('failed');
  });
});

describe('design first: every Golden Path screen needs a Pen frame', () => {
  const frame = (sectionId, penNodeId) => ({
    sectionId,
    penNodeId,
    stillPath: `${sectionId}.png`,
    viewport: 1440,
    mode: 'dark',
    status: 'active',
  });
  const manifest = {
    frames: [
      frame('signup-signin/signin', 'oaz9c'),
      frame('signup-signin/request-access', 'pending-no-design'),
      frame('checkout/pricing', 'hLRZB'),
    ],
  };
  const run = (surface, extra = {}) =>
    penDesignChecks(surface, { manifest, exists: () => true, ...extra }).map(
      c => [c.id, c.status, c.summary]
    );

  it('fails a surface with an undesigned screen or none listed', () => {
    expect(run('signup-signin')[0]).toEqual([
      'pen.design-exists',
      'failed',
      'no Pen design yet: request-access',
    ]);
    expect(run('claim')[0].slice(0, 2)).toEqual([
      'pen.design-exists',
      'failed',
    ]);
  });

  it('fails an unexported frame, then follows the production comparison', () => {
    expect(run('checkout', { exists: () => false })[1].slice(0, 2)).toEqual([
      'pen.still-exported',
      'failed',
    ]);
    expect(run('checkout')[1].slice(0, 2)).toEqual([
      'pen.matches-production',
      'blocked',
    ]);
    const receipt = verdict => ({
      frames: [{ ...frame('checkout/pricing', 'hLRZB'), verdict }],
    });
    expect(run('checkout', { receipt: receipt('pass') })[1][1]).toBe('passed');
    expect(run('checkout', { receipt: receipt('fail') })[1][1]).toBe('failed');
  });
});
