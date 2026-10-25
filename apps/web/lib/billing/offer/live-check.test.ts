import { describe, expect, it } from 'vitest';
import { contentHash, offerSnapshot } from './index';
import {
  htmlToText,
  jsonLdOffers,
  type LiveCheckInput,
  type OfferSnapshot,
  runOfferTruthCheck,
  type StripeReader,
  type SurfaceEntry,
  verdictOf,
  wrongRecurringAmounts,
  wrongTrialDays,
} from './live-check';

const snap = offerSnapshot() as unknown as OfferSnapshot;
const PRO_PAGE =
  '<html><body><h1>Artist Presence</h1><p>$<!-- -->12<span>/mo</span></p><p>14-day Artist Presence trial</p></body></html>';

function good(
  over: Partial<Record<string, { status: number; body: string }>> = {}
): LiveCheckInput['fetchText'] {
  const table: Record<string, { status: number; body: string }> = {
    '/api/offer': { status: 200, body: JSON.stringify(snap) },
    '/api/stripe/pricing-options': {
      status: 200,
      body: JSON.stringify({
        pricingOptions: [
          {
            priceId: 'price_1',
            amount: 1200,
            currency: 'usd',
            interval: 'month',
          },
        ],
      }),
    },
    '/pricing': { status: 200, body: PRO_PAGE },
    ...over,
  };
  return async path => table[path] ?? { status: 404, body: '' };
}

const stripeOk = (
  over: Record<string, { status: number; json: unknown }> = {}
): StripeReader => ({
  async get(path) {
    const p = path.split('?')[0] as string;
    const t: Record<string, { status: number; json: unknown }> = {
      '/v1/prices/price_1': {
        status: 200,
        json: {
          active: true,
          unit_amount: 1200,
          currency: 'usd',
          type: 'recurring',
          billing_scheme: 'per_unit',
          transform_quantity: null,
          product: 'prod_1',
          recurring: {
            interval: 'month',
            interval_count: 1,
            usage_type: 'licensed',
            trial_period_days: null,
          },
        },
      },
      '/v1/products/prod_1': {
        status: 200,
        json: { active: true, name: 'Artist Presence' },
      },
      '/v1/prices': { status: 200, json: { data: [{ unit_amount: 1200 }] } },
      '/v1/billing_portal/configurations': {
        status: 200,
        json: {
          data: [
            {
              is_default: true,
              features: {
                subscription_cancel: {
                  enabled: true,
                  mode: 'at_period_end',
                  proration_behavior: 'none',
                },
              },
            },
          ],
        },
      },
      '/v1/promotion_codes': { status: 200, json: { data: [] } },
      '/v1/tax/settings': { status: 200, json: { status: 'pending' } },
      ...over,
    };
    return t[p] ?? { status: 404, json: null };
  },
});

const surfaces: SurfaceEntry[] = [
  {
    id: 'page-pricing',
    kind: 'page',
    route: '/pricing',
    owner: 'web',
    verify: 'live-render',
    requires: ['price.pro.amount', 'trial.days'],
  },
];

const run = (over: Partial<LiveCheckInput> = {}) =>
  runOfferTruthCheck({
    expected: snap,
    mode: 'checkout',
    fetchText: good(),
    stripe: stripeOk(),
    surfaces,
    ...over,
  });
const status = (r: Awaited<ReturnType<typeof run>>, id: string) =>
  r.checks.find(c => c.id === id)?.status;

describe('text helpers', () => {
  it('flattens React SSR text and reads JSON-LD offers', () => {
    expect(htmlToText(PRO_PAGE)).toContain('$12 /mo');
    const html =
      '<script type="application/ld+json">{"@graph":[{"@type":"Offer","price":"12","priceCurrency":"USD"}]}</script>';
    expect(jsonLdOffers(html)).toHaveLength(1);
  });
  it('finds wrong recurring amounts and trial lengths only', () => {
    const offer = snap.offer;
    expect(wrongRecurringAmounts('Pro is $199/mo', offer)).toEqual(['$199/mo']);
    expect(wrongRecurringAmounts('Pro is $12/mo, tips from $5', offer)).toEqual(
      []
    );
    expect(
      wrongRecurringAmounts('About $6 a month', offer, [{ text: '$6 a month' }])
    ).toEqual([]);
    expect(wrongTrialDays('Start a 30-day Pro trial', offer)).toHaveLength(1);
    expect(wrongTrialDays('Start a 14-day Pro trial', offer)).toEqual([]);
  });
});

describe('live offer-truth check', () => {
  it('passes when production, Stripe and pages agree', async () => {
    const r = await run();
    expect(
      r.checks
        .filter(c => c.status !== 'pass')
        .map(c => `${c.id}:${c.status}:${c.detail}`)
    ).toEqual([]);
    expect(r.verdict).toBe('pass');
    expect(r.exitCode).toBe(0);
  });

  it('without a Stripe key the Stripe side is uncertified, never pass', async () => {
    const r = await run({ stripe: null });
    expect(status(r, 'stripe_price')).toBe('uncertified');
    expect(r.verdict).toBe('uncertified');
    expect(r.exitCode).toBe(3);
  });

  it('records stage timestamps for every check', async () => {
    const r = await run();
    for (const c of r.checks)
      expect(Date.parse(c.finishedAt)).toBeGreaterThanOrEqual(
        Date.parse(c.startedAt)
      );
  });

  it('DELIBERATE RED: stale deploy serving a different offer hash fails', async () => {
    const stale = { ...snap, hash: 'deadbeefdeadbe', version: 'old' };
    const r = await run({
      fetchText: good({
        '/api/offer': { status: 200, body: JSON.stringify(stale) },
      }),
    });
    expect(status(r, 'offer_endpoint')).toBe('fail');
    expect(r.exitCode).toBe(1);
  });

  it('a served older offer fails unless its version is in the declared overlap window', async () => {
    const offer = {
      ...snap.offer,
      version: 'old',
    } as unknown as OfferSnapshot['offer'];
    const older = {
      ...snap,
      version: 'old',
      offer,
      hash: contentHash({ offer, claims: snap.claims }),
    };
    const fetchText = good({
      '/api/offer': { status: 200, body: JSON.stringify(older) },
    });
    expect(status(await run({ fetchText }), 'offer_endpoint')).toBe('fail');
    expect(
      status(
        await run({ fetchText, acceptServedVersions: ['old'] }),
        'offer_endpoint'
      )
    ).toBe('warn');
  });

  it('a served snapshot whose hash does not match its content fails', async () => {
    const tampered = { ...snap, hash: 'x' };
    const r = await run({
      mode: 'served',
      fetchText: good({
        '/api/offer': { status: 200, body: JSON.stringify(tampered) },
      }),
    });
    expect(status(r, 'offer_endpoint')).toBe('fail');
  });

  it('DELIBERATE RED: Stripe price amount drift fails', async () => {
    const r = await run({
      stripe: stripeOk({
        '/v1/prices/price_1': {
          status: 200,
          json: {
            active: true,
            unit_amount: 19900,
            currency: 'usd',
            type: 'recurring',
            billing_scheme: 'per_unit',
            transform_quantity: null,
            product: 'prod_1',
            recurring: {
              interval: 'month',
              interval_count: 1,
              usage_type: 'licensed',
              trial_period_days: null,
            },
          },
        },
      }),
    });
    expect(status(r, 'stripe_price')).toBe('fail');
    expect(r.exitCode).toBe(1);
  });

  it('DELIBERATE RED: a Stripe price that carries a trial the offer does not have fails', async () => {
    const r = await run({
      stripe: stripeOk({
        '/v1/prices/price_1': {
          status: 200,
          json: {
            active: true,
            unit_amount: 1200,
            currency: 'usd',
            type: 'recurring',
            billing_scheme: 'per_unit',
            transform_quantity: null,
            product: 'prod_1',
            recurring: {
              interval: 'month',
              interval_count: 1,
              usage_type: 'licensed',
              trial_period_days: 14,
            },
          },
        },
      }),
    });
    expect(status(r, 'stripe_price')).toBe('fail');
  });

  it('DELIBERATE RED: portal that cancels immediately contradicts "effective end of period"', async () => {
    const r = await run({
      stripe: stripeOk({
        '/v1/billing_portal/configurations': {
          status: 200,
          json: {
            data: [
              {
                is_default: true,
                features: {
                  subscription_cancel: { enabled: true, mode: 'immediately' },
                },
              },
            ],
          },
        },
      }),
    });
    expect(status(r, 'stripe_portal')).toBe('fail');
  });

  it('DELIBERATE RED: a portal that prorates on cancel contradicts "no partial refunds"', async () => {
    const r = await run({
      stripe: stripeOk({
        '/v1/billing_portal/configurations': {
          status: 200,
          json: {
            data: [
              {
                is_default: true,
                features: {
                  subscription_cancel: {
                    enabled: true,
                    mode: 'at_period_end',
                    proration_behavior: 'create_prorations',
                  },
                },
              },
            ],
          },
        },
      }),
    });
    expect(status(r, 'stripe_portal')).toBe('fail');
  });

  it('DELIBERATE RED: the incident sentence rendered on a page fails', async () => {
    const page =
      '<p>Artist Presence is $12/mo after a 14-day trial with no card.</p>';
    const r = await run({
      fetchText: good({ '/pricing': { status: 200, body: page } }),
    });
    expect(status(r, 'surface:page-pricing')).toBe('fail');
    expect(
      r.checks.find(c => c.id === 'surface:page-pricing')?.detail
    ).toContain('trial.price_after_trial');
  });

  it('DELIBERATE RED: legacy $199 on a page and in JSON-LD fails', async () => {
    const page = `${PRO_PAGE}<p>$199/mo</p><script type="application/ld+json">{"@type":"Offer","price":"199","priceCurrency":"USD"}</script>`;
    const r = await run({
      fetchText: good({ '/pricing': { status: 200, body: page } }),
    });
    const detail =
      r.checks.find(c => c.id === 'surface:page-pricing')?.detail ?? '';
    expect(detail).toContain('$199/mo');
    expect(detail).toContain('JSON-LD Offer price 199');
  });

  it('endpoint outage is unavailable, not a mismatch', async () => {
    const r = await run({
      fetchText: good({ '/api/offer': { status: 503, body: '' } }),
    });
    expect(status(r, 'offer_endpoint')).toBe('unavailable');
    expect(verdictOf(r.checks)).toBe('unavailable');
    expect(r.exitCode).toBe(2);
  });

  it('attested out-of-repo surfaces: never verified is uncertified, stale after an offer change fails', async () => {
    const attested = (hash: string | null): SurfaceEntry[] => [
      {
        id: 'stripe-receipts',
        kind: 'stripe-dashboard',
        owner: 'billing',
        verify: 'attested',
        lastVerifiedOfferHash: hash,
        lastVerifiedAt: '2026-10-25',
      },
    ];
    expect(
      status(await run({ surfaces: attested(null) }), 'surface:stripe-receipts')
    ).toBe('uncertified');
    expect(
      status(
        await run({ surfaces: attested(snap.hash) }),
        'surface:stripe-receipts'
      )
    ).toBe('pass');
    expect(
      status(
        await run({ surfaces: attested('oldhash') }),
        'surface:stripe-receipts'
      )
    ).toBe('fail');
  });

  it('a tracked known mismatch warns until its date, then fails', async () => {
    const page =
      '<p>Pro and Max are paid plans billed monthly or annually.</p>';
    const entry = (until: string): SurfaceEntry[] => [
      {
        id: 'page-terms',
        kind: 'page',
        route: '/legal/terms',
        owner: 'legal',
        verify: 'live-render',
        knownMismatch: { reason: 'r', issue: 'X-1', until },
      },
    ];
    const fetchText = good({ '/legal/terms': { status: 200, body: page } });
    const now = () => new Date('2026-11-01T00:00:00Z');
    expect(
      status(
        await run({ fetchText, surfaces: entry('2026-11-08'), now }),
        'surface:page-terms'
      )
    ).toBe('warn');
    expect(
      status(
        await run({ fetchText, surfaces: entry('2026-10-31'), now }),
        'surface:page-terms'
      )
    ).toBe('fail');
    expect(
      status(
        await run({
          fetchText,
          surfaces: entry('2099-01-01').map(
            ({ knownMismatch: _k, ...e }) => e
          ) as SurfaceEntry[],
          now,
        }),
        'surface:page-terms'
      )
    ).toBe('fail');
  });

  it('blocked surfaces are uncertified with the blocker named', async () => {
    const r = await run({
      surfaces: [
        {
          id: 'chat-closer-live',
          kind: 'chat-runtime',
          owner: 'onboarding',
          verify: 'blocked',
          blocker: 'JOV-9004',
        },
      ],
    });
    expect(
      r.checks.find(c => c.id === 'surface:chat-closer-live')?.detail
    ).toContain('JOV-9004');
  });
});
