import { describe, expect, it } from 'vitest';
import {
  ARTIST_VISIBILITY_ACTIVATION_COPY,
  CHECKOUT_PENDING_COPY,
  CHECKOUT_RECOVERY_COPY,
} from '@/app/billing/success/checkout-success-state';
import { ARTIST_VISIBILITY_OFFER } from '@/lib/config/plan-prices';
import {
  buildM2RevenuePathRepro,
  evaluateActivationSurface,
  evaluateClaimSurface,
  evaluateProCheckout199,
  evaluateSignedOutSurface,
  findProMonthlyOption,
  formatM2RevenuePathSummary,
  isGatedActivationRedirect,
  M2_ACTIVATION_MARKERS,
  M2_CLAIM_FIRST_COPY,
  M2_CLAIM_PRICE_DISPLAY,
  M2_PRO_MONTHLY_AMOUNT_CENTS,
  M2_PRO_MONTHLY_USD,
  M2_REVENUE_PATH_CANARY,
  M2_REVENUE_PATH_DISTINCT_FROM,
  M2_REVENUE_PATH_ISSUE,
  M2_REVENUE_PATH_STEPS,
  M2_SIGNED_OUT_MARKERS,
  normalizeCanaryBaseUrl,
  runM2RevenuePathCanary,
} from './m2-revenue-path';

const PRICING_HTML = `
  <html><body>
    ${'x'.repeat(500)}
    <p>${M2_CLAIM_FIRST_COPY}. Choose Pro when you want the release system turned on.</p>
    <span>${M2_CLAIM_PRICE_DISPLAY}</span>
  </body></html>
`;

const HOME_HTML = `
  <html><body>
    ${'x'.repeat(500)}
    <form data-testid="homepage-claim-form"></form>
  </body></html>
`;

const SUCCESS_HTML = `
  <html><body>
    ${'x'.repeat(200)}
    <h1>${ARTIST_VISIBILITY_ACTIVATION_COPY.status}</h1>
  </body></html>
`;

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function htmlResponse(status: number, body: string, url?: string): Response {
  return new Response(body, {
    status,
    headers: { 'Content-Type': 'text/html' },
    url,
  } as ResponseInit);
}

describe('M2 revenue-path canary contract', () => {
  it('is the $199 Artist Visibility Pro path, not generic uptime', () => {
    expect(M2_REVENUE_PATH_CANARY).toBe('m2-revenue-path');
    expect(M2_REVENUE_PATH_ISSUE).toBe('JOV-6439');
    expect(M2_REVENUE_PATH_DISTINCT_FROM).toBe('generic-uptime');
    expect(M2_REVENUE_PATH_STEPS).toEqual([
      'signed_out',
      'claim',
      'pro_checkout_199',
      'activation',
    ]);
    expect(M2_PRO_MONTHLY_USD).toBe(199);
    expect(M2_PRO_MONTHLY_AMOUNT_CENTS).toBe(19900);
    expect(M2_PRO_MONTHLY_USD).toBe(ARTIST_VISIBILITY_OFFER.pro.monthlyUsd);
    expect(M2_CLAIM_PRICE_DISPLAY).toBe('$199');
    expect(M2_ACTIVATION_MARKERS).toEqual(
      expect.arrayContaining([
        ARTIST_VISIBILITY_ACTIVATION_COPY.status,
        CHECKOUT_RECOVERY_COPY.title,
        CHECKOUT_PENDING_COPY.title,
      ])
    );
  });

  it('requires a credential-free http(s) target', () => {
    expect(normalizeCanaryBaseUrl('https://jov.ie/')).toBe('https://jov.ie');
    expect(normalizeCanaryBaseUrl('https://staging.jov.ie')).toBe(
      'https://staging.jov.ie'
    );
    const credentialedTarget = [
      'https://',
      'canary-user',
      ':',
      'canary-pass',
      '@',
      'jov.ie',
    ].join('');
    expect(() => normalizeCanaryBaseUrl(credentialedTarget)).toThrow(
      /credentials/
    );
    expect(buildM2RevenuePathRepro('https://jov.ie/')).toBe(
      'pnpm --filter=@jovie/web exec tsx scripts/m2-revenue-path-canary.ts --base-url https://jov.ie'
    );
  });
});

describe('evaluateSignedOutSurface', () => {
  it('passes when the anonymous claim CTA is present', () => {
    expect(
      evaluateSignedOutSurface({
        statusCode: 200,
        body: HOME_HTML,
        finalUrl: 'https://jov.ie/',
      })
    ).toMatchObject({
      ok: true,
      evidence: expect.arrayContaining([M2_SIGNED_OUT_MARKERS[0]]),
    });
  });

  it('fails when the visitor is bounced into /app', () => {
    expect(
      evaluateSignedOutSurface({
        statusCode: 200,
        body: HOME_HTML,
        finalUrl: 'https://jov.ie/app',
      }).ok
    ).toBe(false);
  });

  it('fails when only a generic shell renders', () => {
    expect(
      evaluateSignedOutSurface({
        statusCode: 200,
        body: `<html><body>${'ok'.repeat(400)}</body></html>`,
      }).ok
    ).toBe(false);
  });
});

describe('evaluateClaimSurface', () => {
  it('requires claim-first copy, $199, and the Pro signup handoff', () => {
    expect(
      evaluateClaimSurface({
        pricingStatus: 200,
        pricingBody: PRICING_HTML,
        signupStatus: 200,
        signupBody: `<html><body>${'signup'.repeat(200)}<div data-auth-shell-ready="true"></div></body></html>`,
      })
    ).toMatchObject({
      ok: true,
      evidence: expect.arrayContaining([
        M2_CLAIM_FIRST_COPY,
        M2_CLAIM_PRICE_DISPLAY,
        'signup?plan=pro',
      ]),
    });
  });

  it('fails when pricing still advertises a stale Pro amount', () => {
    expect(
      evaluateClaimSurface({
        pricingStatus: 200,
        pricingBody: PRICING_HTML.replace('$199', '$39'),
        signupStatus: 200,
        signupBody: `<html><body>${'signup'.repeat(200)}<div data-auth-shell-ready="true"></div></body></html>`,
      }).detail
    ).toMatch(/\$199/);
  });
});

describe('evaluateProCheckout199', () => {
  const livePricing = JSON.stringify({
    pricingOptions: [
      {
        priceId: 'price_visibility_pro',
        amount: 19900,
        currency: 'usd',
        interval: 'month',
        description: 'Pro',
      },
    ],
  });

  it('selects only the live $199 monthly Pro option', () => {
    expect(
      findProMonthlyOption([
        {
          priceId: 'price_legacy',
          amount: 3900,
          interval: 'month',
          description: 'Pro',
        },
        {
          priceId: 'price_visibility_pro',
          amount: 19900,
          interval: 'month',
          description: 'Pro',
        },
      ])?.priceId
    ).toBe('price_visibility_pro');
  });

  it('passes when unsigned checkout stays gated and $199 is live', () => {
    expect(
      evaluateProCheckout199({
        pricingStatus: 200,
        pricingBody: livePricing,
        checkoutPostStatus: 401,
        checkoutPostBody: JSON.stringify({ error: 'Unauthorized' }),
        checkoutGetStatus: 405,
      }).ok
    ).toBe(true);
  });

  it('fails if unsigned POST can create a checkout session', () => {
    expect(
      evaluateProCheckout199({
        pricingStatus: 200,
        pricingBody: livePricing,
        checkoutPostStatus: 200,
        checkoutPostBody: JSON.stringify({
          url: 'https://checkout.stripe.com/c',
        }),
        checkoutGetStatus: 405,
      }).ok
    ).toBe(false);
  });
});

describe('evaluateActivationSurface', () => {
  it('treats the signed-out 307 to sign-in as the live activation gate', () => {
    expect(
      isGatedActivationRedirect('/signin?redirect_url=%2Fbilling%2Fsuccess')
    ).toBe(true);
    expect(
      evaluateActivationSurface({
        successStatus: 307,
        successBody: 'Redirecting...',
        successLocation: '/signin?redirect_url=%2Fbilling%2Fsuccess',
        sessionStatus: 401,
      })
    ).toMatchObject({
      ok: true,
      evidence: expect.arrayContaining([
        'billing/success → signin',
        'checkout-session 401',
      ]),
    });
  });

  it('requires the Artist Visibility activation contract when the page renders', () => {
    expect(
      evaluateActivationSurface({
        successStatus: 200,
        successBody: SUCCESS_HTML,
        sessionStatus: 401,
      })
    ).toMatchObject({
      ok: true,
      evidence: expect.arrayContaining([
        ARTIST_VISIBILITY_ACTIVATION_COPY.status,
        'checkout-session 401',
      ]),
    });
  });

  it('fails when the success page is only generic uptime HTML', () => {
    expect(
      evaluateActivationSurface({
        successStatus: 200,
        successBody: `<html><body>${'uptime'.repeat(80)}</body></html>`,
        sessionStatus: 401,
      }).ok
    ).toBe(false);
  });
});

describe('runM2RevenuePathCanary', () => {
  it('timestamps every step and builds a red receipt with repro', async () => {
    const clock = [
      new Date('2026-09-18T06:37:00.000Z'),
      new Date('2026-09-18T06:37:00.010Z'),
      new Date('2026-09-18T06:37:00.020Z'),
      new Date('2026-09-18T06:37:00.030Z'),
      new Date('2026-09-18T06:37:00.040Z'),
      new Date('2026-09-18T06:37:00.050Z'),
      new Date('2026-09-18T06:37:00.060Z'),
      new Date('2026-09-18T06:37:00.070Z'),
      new Date('2026-09-18T06:37:00.080Z'),
      new Date('2026-09-18T06:37:01.000Z'),
    ];
    let capturedHeaders: Headers | null = null;
    const receipt = await runM2RevenuePathCanary({
      baseUrl: 'https://jov.ie/',
      now: () => {
        const next = clock.shift();
        if (!next) throw new Error('clock exhausted');
        return next;
      },
      fetchImpl: async (input, init) => {
        const url = String(input);
        if (!capturedHeaders) {
          capturedHeaders = new Headers(init?.headers);
        }
        if (url.endsWith('/') || url.endsWith('jov.ie')) {
          return htmlResponse(200, HOME_HTML, 'https://jov.ie/');
        }
        if (url.includes('/pricing') && !url.includes('pricing-options')) {
          return htmlResponse(200, PRICING_HTML);
        }
        if (url.includes('/signup')) {
          return htmlResponse(
            200,
            `<html><body>${'signup'.repeat(200)}<div data-auth-shell-ready="true"></div></body></html>`
          );
        }
        if (url.includes('/api/stripe/pricing-options')) {
          return jsonResponse(200, {
            pricingOptions: [
              {
                priceId: 'price_visibility_pro',
                amount: 19900,
                currency: 'usd',
                interval: 'month',
                description: 'Pro',
              },
            ],
          });
        }
        if (url.includes('/api/stripe/checkout')) {
          if (init?.method === 'POST') {
            return jsonResponse(401, { error: 'Unauthorized' });
          }
          return jsonResponse(405, { error: 'Method not allowed' });
        }
        if (url.includes('/billing/success')) {
          return htmlResponse(200, SUCCESS_HTML);
        }
        if (url.includes('/api/billing/checkout-session')) {
          return jsonResponse(401, { error: 'Unauthorized' });
        }
        return jsonResponse(404, { error: 'missing' });
      },
    });

    expect(capturedHeaders?.get('accept')).toContain('text/html');
    expect(capturedHeaders?.get('user-agent')).toBeTruthy();
    expect(receipt.pass).toBe(true);
    expect(receipt.issue).toBe('JOV-6439');
    expect(receipt.distinctFrom).toBe('generic-uptime');
    expect(receipt.steps.map(step => step.name)).toEqual([
      ...M2_REVENUE_PATH_STEPS,
    ]);
    expect(receipt.steps.every(step => step.startedAt <= step.finishedAt)).toBe(
      true
    );
    expect(receipt.steps.every(step => step.ok)).toBe(true);
    expect(receipt.repro).toContain('--base-url https://jov.ie');
    expect(formatM2RevenuePathSummary(receipt)).toContain('PASS');
  });

  it('stays red when checkout pricing drifts off $199', async () => {
    const receipt = await runM2RevenuePathCanary({
      baseUrl: 'https://staging.jov.ie',
      fetchImpl: async (input, init) => {
        const url = String(input);
        if (url.includes('/api/stripe/pricing-options')) {
          return jsonResponse(200, {
            pricingOptions: [
              {
                priceId: 'price_old',
                amount: 3900,
                currency: 'usd',
                interval: 'month',
                description: 'Pro',
              },
            ],
          });
        }
        if (url.includes('/api/stripe/checkout')) {
          return jsonResponse(init?.method === 'POST' ? 401 : 405, {
            error:
              init?.method === 'POST' ? 'Unauthorized' : 'Method not allowed',
          });
        }
        if (url.includes('/api/billing/checkout-session')) {
          return jsonResponse(401, { error: 'Unauthorized' });
        }
        if (url.includes('/billing/success')) {
          return htmlResponse(200, SUCCESS_HTML);
        }
        if (url.includes('/pricing')) {
          return htmlResponse(200, PRICING_HTML);
        }
        if (url.includes('/signup')) {
          return htmlResponse(
            200,
            `<html><body>${'signup'.repeat(200)}<div data-auth-shell-ready="true"></div></body></html>`
          );
        }
        return htmlResponse(200, HOME_HTML, 'https://staging.jov.ie/');
      },
    });

    expect(receipt.pass).toBe(false);
    const checkout = receipt.steps.find(
      step => step.name === 'pro_checkout_199'
    );
    expect(checkout?.ok).toBe(false);
    expect(checkout?.detail).toMatch(/19900/);
    expect(formatM2RevenuePathSummary(receipt)).toContain('FAIL');
  });
});
