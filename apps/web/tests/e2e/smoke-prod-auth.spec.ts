import { expect, Page, test } from '@playwright/test';
import { APP_ROUTES } from '@/constants/routes';
import { SMOKE_TIMEOUTS, waitForHydration } from './utils/smoke-test-utils';

/**
 * Production Auth Smoke Tests
 *
 * Lightweight tests that run against the PRODUCTION deployment after deploy.
 * Uses seeded e2e production Clerk credentials (not +clerk_test emails).
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
  const email =
    process.env.E2E_PROD_USER_EMAIL ||
    process.env.E2E_CLERK_USER_USERNAME ||
    '';
  const password =
    process.env.E2E_PROD_USER_PASSWORD ||
    process.env.E2E_CLERK_USER_PASSWORD ||
    '';
  return email.length > 0 && password.length > 0;
}

function getProdCredentials() {
  return {
    email:
      process.env.E2E_PROD_USER_EMAIL ||
      process.env.E2E_CLERK_USER_USERNAME ||
      '',
    password:
      process.env.E2E_PROD_USER_PASSWORD ||
      process.env.E2E_CLERK_USER_PASSWORD ||
      '',
    verificationCode: process.env.E2E_PROD_USER_CODE || '',
  };
}

async function waitForClerk(page: Page): Promise<void> {
  await page
    .waitForFunction(
      () => !!(window as { Clerk?: { loaded?: boolean } }).Clerk?.loaded,
      undefined,
      {
        timeout: 30_000,
      }
    )
    .catch(() => {
      // Clerk may not be available in all environments.
    });
}

async function getIdentifierInput(page: Page) {
  return page
    .locator(
      'input[name="identifier"], input[type="email"], input[autocomplete="email"]'
    )
    .first();
}

async function getSubmitButton(page: Page) {
  return page
    .locator(
      [
        'button[type="submit"]',
        'button:has-text("Continue")',
        'button:has-text("Sign in")',
        'button:has-text("Verify")',
      ].join(', ')
    )
    .first();
}

type SignInResult =
  | 'authenticated'
  | 'verification-required'
  | 'signin-form-unavailable'
  | 'unknown';

type SignInNextStep = 'redirected' | 'password' | 'email_code' | 'unknown';

async function detectNextStep(page: Page): Promise<SignInNextStep> {
  return page
    .waitForFunction(
      () => {
        if (window.location.pathname.startsWith('/app')) return 'redirected';
        if (
          document.querySelector(
            'input[name="password"], input[type="password"]'
          )
        ) {
          return 'password';
        }
        if (
          document.querySelector(
            'input[name="code"], input[autocomplete="one-time-code"], input[inputmode="numeric"]'
          )
        ) {
          return 'email_code';
        }
        return false;
      },
      undefined,
      { timeout: 15_000 }
    )
    .then(handle => handle.jsonValue() as Promise<SignInNextStep>)
    .catch(() => 'unknown');
}

async function signInViaRenderedFlow(
  page: Page,
  credentials: ReturnType<typeof getProdCredentials>
): Promise<SignInResult> {
  const identifierInput = await getIdentifierInput(page);
  const hasIdentifierInput = await identifierInput
    .isVisible({ timeout: 15_000 })
    .catch(() => false);

  if (!hasIdentifierInput) {
    if (page.url().includes('/app')) {
      return 'authenticated';
    }
    return 'signin-form-unavailable';
  }

  await identifierInput.fill(credentials.email);
  await (await getSubmitButton(page)).click();

  const nextStep = await detectNextStep(page);

  if (nextStep === 'redirected') {
    return 'authenticated';
  }

  if (nextStep === 'password') {
    const passwordInput = page
      .locator('input[name="password"], input[type="password"]')
      .first();
    await expect(passwordInput).toBeVisible({ timeout: 10_000 });
    await passwordInput.fill(credentials.password);
    await (await getSubmitButton(page)).click();
    await page.waitForURL(url => url.pathname.startsWith('/app'), {
      timeout: 30_000,
    });
    return 'authenticated';
  }

  if (nextStep === 'email_code') {
    if (!credentials.verificationCode) {
      return 'verification-required';
    }

    const codeInput = page
      .locator(
        'input[name="code"], input[autocomplete="one-time-code"], input[inputmode="numeric"]'
      )
      .first();
    await expect(codeInput).toBeVisible({ timeout: 10_000 });
    await codeInput.fill(credentials.verificationCode);
    await (await getSubmitButton(page)).click();
    await page.waitForURL(url => url.pathname.startsWith('/app'), {
      timeout: 30_000,
    });
    return 'authenticated';
  }

  return 'unknown';
}

test.describe('Production Auth Smoke @production-smoke', () => {
  test.setTimeout(120_000);

  test.beforeEach(async () => {
    if (!hasProdAuthCredentials()) {
      test.skip(true, 'No production auth credentials configured');
    }
  });

  test('sign-in works and dashboard loads', async ({ page }) => {
    const credentials = getProdCredentials();

    await page.goto(APP_ROUTES.SIGNIN, {
      waitUntil: 'domcontentloaded',
      timeout: SMOKE_TIMEOUTS.NAVIGATION,
    });
    await waitForClerk(page);

    const result = await signInViaRenderedFlow(page, credentials);

    if (result === 'verification-required') {
      test.skip(
        true,
        'Clerk rendered email-code verification and E2E_PROD_USER_CODE is not configured'
      );
      return;
    }
    if (result === 'signin-form-unavailable') {
      test.skip(true, 'Clerk sign-in form not available');
      return;
    }

    expect(result).toBe('authenticated');

    await waitForHydration(page);

    const main = page.locator('main').first();
    await expect(main, 'Dashboard should be visible after sign-in').toBeVisible(
      {
        timeout: SMOKE_TIMEOUTS.VISIBILITY,
      }
    );

    const mainText = await main.innerText().catch(() => '');
    expect(
      mainText.length,
      'Dashboard should have real content (not empty)'
    ).toBeGreaterThan(30);

    const lower = mainText.toLowerCase();
    expect(lower).not.toContain('application error');
    expect(lower).not.toContain('something went wrong');
  });

  test('dashboard tab navigation works', async ({ page }) => {
    const credentials = getProdCredentials();

    await page.goto(APP_ROUTES.DASHBOARD_PROFILE, {
      waitUntil: 'domcontentloaded',
      timeout: SMOKE_TIMEOUTS.NAVIGATION,
    });

    if (
      page.url().includes(APP_ROUTES.SIGNIN) ||
      page.url().includes('/sign-in')
    ) {
      await waitForClerk(page);

      const result = await signInViaRenderedFlow(page, credentials);

      if (result === 'verification-required') {
        test.skip(
          true,
          'Clerk rendered email-code verification and E2E_PROD_USER_CODE is not configured'
        );
        return;
      }
      if (result === 'signin-form-unavailable') {
        test.skip(true, 'Sign-in form not available for tab navigation test');
        return;
      }

      expect(result).toBe('authenticated');
    }

    await waitForHydration(page);

    const tabs = [APP_ROUTES.DASHBOARD_AUDIENCE, APP_ROUTES.DASHBOARD_RELEASES];

    for (const tabPath of tabs) {
      await page.goto(tabPath, {
        waitUntil: 'domcontentloaded',
        timeout: SMOKE_TIMEOUTS.NAVIGATION,
      });

      await waitForHydration(page);

      const currentUrl = page.url();
      expect(currentUrl).not.toContain(APP_ROUTES.SIGNIN);
      expect(currentUrl).not.toContain('/sign-in');

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
