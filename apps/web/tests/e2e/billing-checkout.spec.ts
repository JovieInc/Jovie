import { expect, type Page, test } from '@playwright/test';
import { APP_ROUTES } from '@/constants/routes';
import { ensureSignedInUser } from '../helpers/clerk-auth';

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
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY:
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
  CLERK_SECRET_KEY: process.env.CLERK_SECRET_KEY,
  DATABASE_URL: process.env.DATABASE_URL,
} as const;

const IS_LOCAL_AUTH_BYPASS =
  process.env.E2E_USE_TEST_AUTH_BYPASS === '1' ||
  process.env.NEXT_PUBLIC_CLERK_MOCK === '1' ||
  process.env.NEXT_PUBLIC_CLERK_PROXY_DISABLED === '1';

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

async function refreshClerkSessionForApi(page: Page): Promise<boolean> {
  // Clerk → Better Auth migration: setupClerkTestingToken removed.
  // The dev bypass session cookie persists, so no re-arm is needed.
  await page.goto(APP_ROUTES.CHAT, {
    waitUntil: 'domcontentloaded',
    timeout: 120_000,
  });

  if (/\/sign-?in/.test(page.url())) {
    return false;
  }

  return page
    .evaluate(async () => {
      const clerk = (window as any).Clerk;
      if (!clerk) return true;
      if (!clerk.loaded) {
        await new Promise<void>(resolve => {
          const startedAt = Date.now();
          const tick = () => {
            if (clerk.loaded || Date.now() - startedAt > 15_000) {
              resolve();
              return;
            }
            window.setTimeout(tick, 100);
          };
          tick();
        });
      }

      if (!clerk.user?.id || !clerk.session) return false;
      await clerk.session.getToken({ skipCache: true }).catch(() => null);
      return true;
    })
    .catch(() => false);
}

async function createCheckoutSessionFromBrowser(
  page: Page,
  priceId: string
): Promise<CheckoutAttempt> {
  return page.evaluate(async targetPriceId => {
    const clerk = (window as any).Clerk;
    const token = await clerk?.session
      ?.getToken({ skipCache: true })
      .catch(() => null);
    const headers: Record<string, string> = {
      'content-type': 'application/json',
    };
    if (token) {
      headers.authorization = `Bearer ${token}`;
    }

    const response = await fetch('/api/stripe/checkout', {
      method: 'POST',
      headers,
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
    if (IS_LOCAL_AUTH_BYPASS) {
      test.skip(true, 'Billing checkout requires real Clerk auth');
    }
    if (!hasRealEnv()) {
      test.skip(true, 'Real Clerk/DB env vars not configured');
    }
    if (process.env.CLERK_TESTING_SETUP_SUCCESS !== 'true') {
      test.skip(true, 'Clerk testing setup was not successful');
    }
    if (
      !process.env.E2E_CLERK_USER_USERNAME ||
      !(
        process.env.E2E_CLERK_USER_USERNAME.includes('+clerk_test') ||
        process.env.E2E_CLERK_USER_PASSWORD
      )
    ) {
      test.skip(
        true,
        'E2E_CLERK_USER_USERNAME/PASSWORD not configured for standing test user'
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
      }>;
      options?: Array<{
        priceId?: string;
        description?: string;
        amount?: number;
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
      o => o.description === 'Pro' && o.amount === 3900 && o.priceId
    );
    expect(
      proMonthlyOption,
      'Pro monthly pricing option not returned — billing misconfigured'
    ).toBeTruthy();

    const proMonthlyPriceId = proMonthlyOption!.priceId!;
    expect(
      proMonthlyOption!.amount,
      'Pro monthly price should be $39/mo (3900 cents)'
    ).toBe(3900);

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
              const refreshed = await refreshClerkSessionForApi(page);
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
