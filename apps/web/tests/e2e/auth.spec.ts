import { setupClerkTestingToken } from '@clerk/testing/playwright';
import type { Browser, Page } from '@playwright/test';
import { APP_ROUTES } from '@/constants/routes';
import { expect, test } from './setup';
import {
  assertNoCriticalErrors,
  SMOKE_TIMEOUTS,
  setupPageMonitoring,
  waitForHydration,
} from './utils/smoke-test-utils';

const FAST_ITERATION = process.env.E2E_FAST_ITERATION === '1';
const AUTH_UI_TIMEOUT = 60_000;
const EMPTY_STORAGE_STATE = {
  cookies: [],
  origins: [],
};

async function interceptAnalytics(page: Page): Promise<void> {
  await page.route('**/api/profile/view', r =>
    r.fulfill({ status: 200, body: '{}' })
  );
  await page.route('**/api/audience/visit', r =>
    r.fulfill({ status: 200, body: '{}' })
  );
  await page.route('**/api/track', r => r.fulfill({ status: 200, body: '{}' }));
}

async function waitForClerk(page: Page): Promise<void> {
  await page
    .waitForFunction(
      () => !!(window as { Clerk?: { loaded?: boolean } }).Clerk?.loaded,
      undefined,
      {
        timeout: AUTH_UI_TIMEOUT,
      }
    )
    .catch(() => {
      // Local dev can lag on Clerk bootstrap; the visible UI assertion below is the real gate.
    });
}

async function waitForClerkAuthUi(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {
    // Dev builds can keep background requests open; the DOM probe below is the real gate.
  });

  await page.waitForFunction(
    () => {
      const authForm = document.querySelector('#auth-form');
      if (!authForm) return false;

      if (authForm.querySelector('[data-clerk-component]')) {
        return true;
      }

      const bodyText = document.body.innerText || '';
      return (
        bodyText.includes('Continue') ||
        bodyText.includes('Google') ||
        bodyText.includes('Sign in to Jovie') ||
        bodyText.includes('Create your account')
      );
    },
    undefined,
    { timeout: AUTH_UI_TIMEOUT }
  );
}

async function expectClerkAuthUi(page: Page): Promise<void> {
  const authUi = page.locator(
    [
      'input[name="identifier"]',
      'input[type="email"]',
      'input[autocomplete="email"]',
      'button:has-text("Continue")',
      'button:has-text("Google")',
      'a:has-text("Sign up")',
      'a:has-text("Sign in")',
    ].join(', ')
  );

  await waitForClerkAuthUi(page);

  await expect(authUi.first()).toBeVisible({
    timeout: AUTH_UI_TIMEOUT,
  });

  const bodyText = await page.locator('body').textContent();
  expect(bodyText).not.toContain('Error boundary');
  expect(bodyText).not.toContain('Something went wrong');
  expect(bodyText).not.toContain('Unhandled Runtime Error');
}

async function openAuthPage(page: Page, route: string): Promise<void> {
  await interceptAnalytics(page);
  await page.goto(route, { waitUntil: 'load' });
  await waitForHydration(page);
  await waitForClerk(page);
  await expectClerkAuthUi(page);
}

async function createFreshAuthPage(browser: Browser): Promise<Page> {
  const context = await browser.newContext({
    storageState: EMPTY_STORAGE_STATE,
  });
  const page = await context.newPage();

  if (process.env.CLERK_TESTING_SETUP_SUCCESS === 'true') {
    await setupClerkTestingToken({ page }).catch(() => {
      // Signed-out auth-page assertions do not require the Clerk testing token.
    });
  }

  return page;
}

test.describe('Auth', () => {
  test.skip(
    FAST_ITERATION,
    'Auth UI flows are covered by smoke-auth and golden-path in the fast gate'
  );

  test('signin renders Clerk auth UI without runtime errors', async ({
    browser,
  }, testInfo) => {
    const page = await createFreshAuthPage(browser);
    const { getContext, cleanup } = setupPageMonitoring(page);

    try {
      await openAuthPage(page, APP_ROUTES.SIGNIN);
      await expect(page).toHaveURL(url => url.pathname === APP_ROUTES.SIGNIN, {
        timeout: SMOKE_TIMEOUTS.NAVIGATION,
      });
      await assertNoCriticalErrors(getContext(), testInfo);
    } finally {
      cleanup();
      await page.context().close();
    }
  });

  test('signup renders Clerk auth UI and legal links without runtime errors', async ({
    browser,
  }, testInfo) => {
    const page = await createFreshAuthPage(browser);
    const { getContext, cleanup } = setupPageMonitoring(page);

    try {
      await openAuthPage(page, APP_ROUTES.SIGNUP);
      await expect(
        page.getByRole('link', { name: /terms of service/i })
      ).toBeVisible({ timeout: SMOKE_TIMEOUTS.VISIBILITY });
      await expect(
        page.getByRole('link', { name: /privacy policy/i })
      ).toBeVisible({ timeout: SMOKE_TIMEOUTS.VISIBILITY });
      await assertNoCriticalErrors(getContext(), testInfo);
    } finally {
      cleanup();
      await page.context().close();
    }
  });

  test('signin and signup navigation stays on the canonical routes and preserves redirect_url', async ({
    browser,
  }, testInfo) => {
    const page = await createFreshAuthPage(browser);
    const { getContext, cleanup } = setupPageMonitoring(page);
    const redirectUrl = APP_ROUTES.ONBOARDING;

    try {
      await openAuthPage(
        page,
        `${APP_ROUTES.SIGNIN}?redirect_url=${encodeURIComponent(redirectUrl)}`
      );

      await page.getByRole('link', { name: /sign up|create account/i }).click();
      await expect(page).toHaveURL(
        url =>
          url.pathname === APP_ROUTES.SIGNUP &&
          url.searchParams.get('redirect_url') === redirectUrl,
        {
          timeout: SMOKE_TIMEOUTS.NAVIGATION,
        }
      );
      await expectClerkAuthUi(page);

      await page.getByRole('link', { name: /sign in|log in/i }).click();
      await expect(page).toHaveURL(
        url =>
          url.pathname === APP_ROUTES.SIGNIN &&
          url.searchParams.get('redirect_url') === redirectUrl,
        {
          timeout: SMOKE_TIMEOUTS.NAVIGATION,
        }
      );
      await expectClerkAuthUi(page);
      await assertNoCriticalErrors(getContext(), testInfo);
    } finally {
      cleanup();
      await page.context().close();
    }
  });
});
