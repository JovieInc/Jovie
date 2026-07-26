import { expect, Page, type TestInfo, test } from '@playwright/test';
import { APP_ROUTES } from '@/constants/routes';
import {
  assertExactNavigationUrl,
  isExactNavigationUrl,
  requireExactNavigationOrigin,
} from '../helpers/vercel-preview';
import { primeOriginBoundVercelBypass } from './utils/prime-vercel-bypass';
import { resolveProductionAuthCredentials } from './utils/production-auth-credentials';
import {
  prepareProductionAuthEmailForm,
  waitForProductionDashboardContent,
} from './utils/production-auth-interaction';
import { waitForProductionAuthOtp } from './utils/production-auth-otp';
import { SMOKE_TIMEOUTS, waitForHydration } from './utils/smoke-test-utils';

/**
 * Production Auth Smoke Tests
 *
 * Lightweight tests that run against the PRODUCTION deployment after deploy.
 * Uses a seeded Better Auth production identity and a fresh real sign-in OTP.
 *
 * These tests verify:
 * 1. Sign-in flow works with real credentials
 * 2. Dashboard loads with real data (not empty state)
 * 3. Navigation between key tabs works
 *
 * Max ~2min total. No golden path, no content gate, no admin tests.
 *
 * @production-smoke
 */

test.use({ storageState: { cookies: [], origins: [] } });

function hasProdAuthCredentials(): boolean {
  return resolveProductionAuthCredentials() !== null;
}

function getProdCredentials() {
  const credentials = resolveProductionAuthCredentials();
  if (!credentials) {
    throw new Error(
      'Production auth smoke requires a configured Better Auth identity and OTP source.'
    );
  }
  return credentials;
}

type SignInResult =
  | 'authenticated'
  | 'verification-required'
  | 'signin-form-unavailable'
  | 'unknown';

type SignInNextStep = 'redirected' | 'password' | 'email_code' | 'unknown';

function exactOriginForTest(testInfo: TestInfo): string {
  const baseUrl = testInfo.project.use.baseURL;
  if (typeof baseUrl !== 'string') {
    throw new Error('Production auth smoke requires an exact baseURL.');
  }
  return requireExactNavigationOrigin(baseUrl);
}

async function detectNextStep(
  page: Page,
  expectedOrigin: string
): Promise<SignInNextStep> {
  return page
    .waitForFunction(
      exactOrigin => {
        if (window.location.origin !== exactOrigin) return false;
        if (window.location.pathname.startsWith('/app')) return 'redirected';
        if (
          document.querySelector(
            'input[name="password"], input[type="password"]'
          )
        ) {
          return 'password';
        }
        if (
          document.querySelector('[data-auth-email-code-step="code"]') ||
          document.querySelector(
            'input[name="code"], input[autocomplete="one-time-code"], input[inputmode="numeric"]'
          )
        ) {
          return 'email_code';
        }
        return false;
      },
      expectedOrigin,
      { timeout: 15_000 }
    )
    .then(handle => handle.jsonValue() as Promise<SignInNextStep>)
    .catch(() => 'unknown');
}

async function signInViaRenderedFlow(
  page: Page,
  credentials: ReturnType<typeof getProdCredentials>,
  expectedOrigin: string
): Promise<SignInResult> {
  assertExactNavigationUrl(page.url(), expectedOrigin, 'Rendered sign-in flow');
  const emailForm = page
    .locator('form[data-auth-email-code-step="email"]')
    .first();
  const hasIdentifierInput = await emailForm
    .isVisible({ timeout: 15_000 })
    .catch(() => false);

  if (!hasIdentifierInput) {
    if (
      isExactNavigationUrl(page.url(), expectedOrigin) &&
      new URL(page.url()).pathname.startsWith('/app')
    ) {
      return 'authenticated';
    }
    return 'signin-form-unavailable';
  }

  const { submitButton } = await prepareProductionAuthEmailForm(
    page,
    credentials.email
  );
  const otpRequestedAtMs = Date.now();
  await submitButton.click();

  const nextStep = await detectNextStep(page, expectedOrigin);

  if (nextStep === 'redirected') {
    return 'authenticated';
  }

  if (nextStep === 'password') {
    const passwordInput = page
      .locator('input[name="password"], input[type="password"]')
      .first();
    await expect(passwordInput).toBeVisible({ timeout: 10_000 });
    await passwordInput.fill(credentials.password);
    await page
      .locator('form:has(input[type="password"]) button[type="submit"]')
      .first()
      .click();
    await page.waitForURL(
      url => url.origin === expectedOrigin && url.pathname.startsWith('/app'),
      { timeout: 30_000 }
    );
    assertExactNavigationUrl(page.url(), expectedOrigin, 'Password redirect');
    return 'authenticated';
  }

  if (nextStep === 'email_code') {
    const codeForm = page
      .locator('form[data-auth-email-code-step="code"]')
      .first();
    const codeInput = codeForm
      .locator(
        '[data-testid="otp-autofill-input"], input[name="code"], input[autocomplete="one-time-code"], input[inputmode="numeric"]'
      )
      .first();
    await expect(codeInput).toBeVisible({ timeout: 10_000 });
    const verificationCode =
      credentials.verificationCode ||
      (await waitForProductionAuthOtp({
        email: credentials.email,
        startedAtMs: otpRequestedAtMs,
      }));
    const authenticatedRedirect = page.waitForURL(
      url => url.origin === expectedOrigin && url.pathname.startsWith('/app'),
      { timeout: 30_000 }
    );
    await codeInput.fill(verificationCode);
    await authenticatedRedirect;
    assertExactNavigationUrl(page.url(), expectedOrigin, 'Email-code redirect');
    return 'authenticated';
  }

  return 'unknown';
}

test.describe('Production Auth Smoke @production-smoke', () => {
  test.setTimeout(120_000);

  test.beforeEach(async ({ context }, testInfo) => {
    if (!hasProdAuthCredentials()) {
      test.skip(true, 'No production auth credentials configured');
      return;
    }

    const baseUrl = testInfo.project.use.baseURL;
    if (typeof baseUrl !== 'string') {
      throw new Error('Production auth smoke requires an exact baseURL.');
    }
    await primeOriginBoundVercelBypass(context, baseUrl);
  });

  test('sign-in works and dashboard loads', async ({ page }, testInfo) => {
    const credentials = getProdCredentials();
    const expectedOrigin = exactOriginForTest(testInfo);

    await page.goto(APP_ROUTES.SIGNIN, {
      waitUntil: 'domcontentloaded',
      timeout: SMOKE_TIMEOUTS.NAVIGATION,
    });
    assertExactNavigationUrl(page.url(), expectedOrigin, 'Sign-in navigation');

    const result = await signInViaRenderedFlow(
      page,
      credentials,
      expectedOrigin
    );

    if (result === 'verification-required') {
      throw new Error(
        'Better Auth rendered email-code verification without a configured OTP source'
      );
    }
    if (result === 'signin-form-unavailable') {
      throw new Error('Better Auth sign-in form not available');
    }

    expect(result).toBe('authenticated');

    await waitForHydration(page);
    assertExactNavigationUrl(
      page.url(),
      expectedOrigin,
      'Hydrated dashboard navigation'
    );

    const main = page.locator('main').first();
    await expect(main, 'Dashboard should be visible after sign-in').toBeVisible(
      {
        timeout: SMOKE_TIMEOUTS.VISIBILITY,
      }
    );

    const mainText = await waitForProductionDashboardContent(
      page,
      SMOKE_TIMEOUTS.VISIBILITY
    );

    const lower = mainText.toLowerCase();
    expect(lower).not.toContain('application error');
    expect(lower).not.toContain('something went wrong');

    const performanceAuthStatePath =
      process.env.PERFORMANCE_AUTH_STATE_PATH?.trim();
    if (performanceAuthStatePath) {
      await page.context().storageState({ path: performanceAuthStatePath });
    }
  });

  test('dashboard tab navigation works', async ({ page }, testInfo) => {
    const credentials = getProdCredentials();
    const expectedOrigin = exactOriginForTest(testInfo);

    await page.goto(APP_ROUTES.DASHBOARD_PROFILE, {
      waitUntil: 'domcontentloaded',
      timeout: SMOKE_TIMEOUTS.NAVIGATION,
    });
    const profileUrl = assertExactNavigationUrl(
      page.url(),
      expectedOrigin,
      'Dashboard profile navigation'
    );

    if (
      profileUrl.pathname.startsWith(APP_ROUTES.SIGNIN) ||
      profileUrl.pathname.startsWith('/sign-in')
    ) {
      const result = await signInViaRenderedFlow(
        page,
        credentials,
        expectedOrigin
      );

      if (result === 'verification-required') {
        throw new Error(
          'Better Auth rendered email-code verification without a configured OTP source'
        );
      }
      if (result === 'signin-form-unavailable') {
        throw new Error('Sign-in form not available for tab navigation test');
      }

      expect(result).toBe('authenticated');
    }

    await waitForHydration(page);
    assertExactNavigationUrl(
      page.url(),
      expectedOrigin,
      'Hydrated dashboard profile navigation'
    );

    const tabs = [APP_ROUTES.AUDIENCE, APP_ROUTES.RELEASES];

    for (const tabPath of tabs) {
      await page.goto(tabPath, {
        waitUntil: 'domcontentloaded',
        timeout: SMOKE_TIMEOUTS.NAVIGATION,
      });
      assertExactNavigationUrl(
        page.url(),
        expectedOrigin,
        `Dashboard tab navigation for ${tabPath}`
      );

      await waitForHydration(page);
      const currentUrl = assertExactNavigationUrl(
        page.url(),
        expectedOrigin,
        `Hydrated dashboard tab navigation for ${tabPath}`
      );

      expect(currentUrl.pathname).not.toContain(APP_ROUTES.SIGNIN);
      expect(currentUrl.pathname).not.toContain('/sign-in');

      const main = page.locator('main').first();
      const mainVisible = await main
        .isVisible({ timeout: SMOKE_TIMEOUTS.VISIBILITY })
        .catch(() => false);
      expect(mainVisible, `${tabPath}: main content should be visible`).toBe(
        true
      );
    }
  });
});
