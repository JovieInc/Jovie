import { expect, type Page, test } from '@playwright/test';
import { APP_ROUTES } from '@/constants/routes';
import { ARTIST_VISIBILITY_OFFER, toCents } from '@/lib/config/plan-prices';
import { ensureSignedInUser } from '../helpers/auth';

/**
 * Billing Checkout E2E — Money-path regression coverage
 *
 * Checkout is a post-activation upgrade path under the reverse-trial model
 * (no card at signup) — kept as money-path regression coverage,
 * intentionally NOT part of the new-artist golden path (JOV-3757). The
 * golden path's "first value" moment is a live public profile, not a
 * paywall; see golden-path.spec.ts for that journey.
 *
 * Uses the standing E2E test user (via ensureSignedInUser) rather than
 * fresh-signup machinery, since this test only exercises the authenticated
 * checkout API surface.
 */

/* ------------------------------------------------------------------ */
/*  Environment gates                                                   */
/* ------------------------------------------------------------------ */

const REQUIRED_ENV = {
  DATABASE_URL: process.env.DATABASE_URL,
} as const;

const IS_AUTH_MOCKED =
  process.env.NEXT_PUBLIC_AUTH_MOCK === '1' ||
  process.env.NEXT_PUBLIC_AUTH_PROXY_DISABLED === '1';

function hasRealEnv(): boolean {
  return Object.values(REQUIRED_ENV).every(
    v => v && !v.includes('mock') && !v.includes('dummy')
  );
}

/** Block fire-and-forget tracking calls that trigger slow Turbopack cascades. */
async function interceptTrackingCalls(page: Page) {
  await page.route('**/api/profile/view', r =>
    r.fulfill({ status: 200, body: '{}' })
  );
  await page.route('**/api/audience/visit', r =>
    r.fulfill({ status: 200, body: '{}' })
  );
  await page.route('**/api/track', r => r.fulfill({ status: 200, body: '{}' }));
}

interface CheckoutAttempt {
  readonly status: number;
  readonly url: string | null;
  readonly body: string;
}

async function refreshBetterAuthSessionForApi(page: Page): Promise<boolean> {
  await page.goto(APP_ROUTES.CHAT, {
    waitUntil: 'domcontentloaded',
    timeout: 120_000,
  });

  if (/\/sign-?in/.test(page.url())) {
    return false;
  }

  const sessionRes = await page.request
    .get('/api/auth/get-session', { failOnStatusCode: false })
    .catch(() => null);
  return Boolean(sessionRes?.ok());
}

async function createCheckoutSessionFromBrowser(
  page: Page,
  priceId: string
): Promise<CheckoutAttempt> {
  return page.evaluate(async targetPriceId => {
    const response = await fetch('/api/stripe/checkout', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({ priceId: targetPriceId }),
    });
    const body = await response.text();
    if (!response.ok) {
      return { status: response.status, url: null, body };
    }

    const json = JSON.parse(body) as { url?: string };
    return { status: response.status, url: json.url ?? null, body };
  }, priceId);
}

/* ------------------------------------------------------------------ */
/*  Test suite                                                          */
/* ------------------------------------------------------------------ */

test.describe('Billing Checkout: Stripe checkout session creation', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test.beforeEach(async ({ page }) => {
    if (IS_AUTH_MOCKED) {
      test.skip(true, 'Billing checkout requires unmocked Better Auth');
    }
    if (!hasRealEnv()) {
      test.skip(true, 'Better Auth/DB env vars not configured');
    }
    if (
      process.env.E2E_USE_TEST_AUTH_BYPASS !== '1' &&
      process.env.E2E_USE_STORED_AUTH !== '1'
    ) {
      test.skip(
        true,
        'Better Auth checkout E2E requires E2E_USE_TEST_AUTH_BYPASS=1 or E2E_USE_STORED_AUTH=1'
      );
    }

    await interceptTrackingCalls(page);
  });

  test('creates a Stripe checkout session for the Pro monthly plan', async ({
    page,
  }) => {
    test.setTimeout(180_000);

    await ensureSignedInUser(page);

    // Get available pricing. Local Next can restart under memory pressure,
    // so retry request-level ECONNRESET failures.
    let pricingJson: {
      pricingOptions?: Array<{
        priceId?: string;
        description?: string;
        amount?: number;
        currency?: string;
        interval?: string;
      }>;
      options?: Array<{
        priceId?: string;
        description?: string;
        amount?: number;
        currency?: string;
        interval?: string;
      }>;
    } | null = null;

    await expect
      .poll(
        async () => {
          try {
            const pricingResponse = await page.request.get(
              '/api/stripe/pricing-options',
              { timeout: 60_000 }
            );
            if (!pricingResponse.ok()) {
              return `http-${pricingResponse.status()}`;
            }

            pricingJson = (await pricingResponse.json()) as NonNullable<
              typeof pricingJson
            >;
            return 'ready';
          } catch {
            return 'request-error';
          }
        },
        { timeout: 180_000, intervals: [2_000, 5_000, 10_000] }
      )
      .toBe('ready');

    const allOptions =
      pricingJson!.pricingOptions ?? pricingJson!.options ?? [];

    // Find the primary paid Pro monthly plan specifically.
    const proMonthlyOption = allOptions.find(
      o =>
        o.description === ARTIST_VISIBILITY_OFFER.pro.displayName &&
        o.amount === toCents(ARTIST_VISIBILITY_OFFER.pro.monthlyUsd) &&
        o.currency === ARTIST_VISIBILITY_OFFER.pro.currency &&
        o.interval === ARTIST_VISIBILITY_OFFER.pro.interval &&
        o.priceId
    );
    expect(
      proMonthlyOption,
      'Pro monthly pricing option not returned — billing misconfigured'
    ).toBeTruthy();

    const proMonthlyPriceId = proMonthlyOption!.priceId!;
    expect(
      proMonthlyOption!.amount,
      `Artist Presence monthly price should be $${ARTIST_VISIBILITY_OFFER.pro.monthlyUsd}/mo (${toCents(ARTIST_VISIBILITY_OFFER.pro.monthlyUsd)} cents)`
    ).toBe(toCents(ARTIST_VISIBILITY_OFFER.pro.monthlyUsd));

    // Create checkout session with Pro monthly price
    let checkoutUrl: string | null = null;
    await expect
      .poll(
        async () => {
          try {
            let checkoutAttempt = await createCheckoutSessionFromBrowser(
              page,
              proMonthlyPriceId
            );

            if (checkoutAttempt.status === 401) {
              const refreshed = await refreshBetterAuthSessionForApi(page);
              if (!refreshed) return 'http-401';
              checkoutAttempt = await createCheckoutSessionFromBrowser(
                page,
                proMonthlyPriceId
              );
            }

            if (checkoutAttempt.status < 200 || checkoutAttempt.status >= 300) {
              return `http-${checkoutAttempt.status}`;
            }

            checkoutUrl = checkoutAttempt.url;
            return checkoutUrl ?? 'missing-url';
          } catch {
            return 'request-error';
          }
        },
        { timeout: 180_000, intervals: [2_000, 5_000, 10_000] }
      )
      .toMatch(/^https:\/\/checkout\.stripe\.com\//);

    expect(
      checkoutUrl,
      'Stripe checkout URL missing — checkout session not created'
    ).toMatch(/^https:\/\/checkout\.stripe\.com\//);
  });
});
