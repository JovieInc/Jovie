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

const AUTH_UNAVAILABLE_PHRASES = [
  'auth unavailable',
  'authentication unavailable',
  'temporarily unavailable',
  'clerk is not configured',
];

function hasAuthUnavailableCopy(text: string | null | undefined): boolean {
  const normalized = (text ?? '').toLowerCase();
  return AUTH_UNAVAILABLE_PHRASES.some(phrase => normalized.includes(phrase));
}

async function isAuthUnavailable(page: Page): Promise<boolean> {
  const bodyText = await page
    .locator('body')
    .textContent()
    .catch(() => '');
  return hasAuthUnavailableCopy(bodyText);
}

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
  await Promise.race([
    page.waitForFunction(
      () => !!(window as { Clerk?: { loaded?: boolean } }).Clerk?.loaded,
      undefined,
      {
        timeout: AUTH_UI_TIMEOUT,
      }
    ),
    page.waitForFunction(
      () => {
        const bodyText = (document.body?.innerText || '').toLowerCase();
        return [
          'auth unavailable',
          'authentication unavailable',
          'temporarily unavailable',
          'clerk is not configured',
        ].some(phrase => bodyText.includes(phrase));
      },
      undefined,
      {
        timeout: AUTH_UI_TIMEOUT,
      }
    ),
  ]).catch(() => {
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

      const bodyText = (document.body?.innerText || '').toLowerCase();
      return (
        [
          'auth unavailable',
          'authentication unavailable',
          'temporarily unavailable',
          'clerk is not configured',
        ].some(phrase => bodyText.includes(phrase)) ||
        bodyText.includes('continue') ||
        bodyText.includes('google') ||
        bodyText.includes('sign in to jovie') ||
        bodyText.includes('request access')
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

  if (await isAuthUnavailable(page)) {
    await expect(
      page.getByRole('heading', { name: /temporarily unavailable/i })
    ).toBeVisible({ timeout: AUTH_UI_TIMEOUT });
    const bodyText = await page.locator('body').textContent();
    expect(bodyText).not.toContain('Error boundary');
    expect(bodyText).not.toContain('Something went wrong');
    expect(bodyText).not.toContain('Unhandled Runtime Error');
    return;
  }

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

  // Clerk → Better Auth migration: setupClerkTestingToken removed.

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
      if (await isAuthUnavailable(page)) {
        await assertNoCriticalErrors(getContext(), testInfo);
        return;
      }
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
      if (await isAuthUnavailable(page)) {
        await assertNoCriticalErrors(getContext(), testInfo);
        return;
      }

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

  test('signup sign-in navigation preserves redirect_url and uses canonical login recovery', async ({
    browser,
  }, testInfo) => {
    const page = await createFreshAuthPage(browser);
    const { getContext, cleanup } = setupPageMonitoring(page);
    const redirectUrl = APP_ROUTES.ONBOARDING;

    try {
      await openAuthPage(
        page,
        `${APP_ROUTES.SIGNUP}?redirect_url=${encodeURIComponent(redirectUrl)}`
      );
      const signup = page.locator('[data-auth-shell-mode="sign-up"]');
      await expect(signup).toHaveCount(1);
      await expect(signup).toHaveAttribute('data-auth-shell-hydrated', 'true');
      const signinLink = signup
        .locator('[data-auth-mode-switch]')
        .getByRole('link', { name: 'Sign in', exact: true });
      await expect(signinLink).toHaveCount(1);
      await expect(signinLink).toBeVisible();
      await expect(signinLink).toHaveAttribute(
        'href',
        `${APP_ROUTES.SIGNIN}?redirect_url=${encodeURIComponent(redirectUrl)}`
      );
      await signinLink.focus();
      await page.keyboard.press('Enter');
      await expect(page).toHaveURL(
        url =>
          url.pathname === APP_ROUTES.SIGNIN &&
          url.searchParams.get('redirect_url') === redirectUrl,
        { timeout: SMOKE_TIMEOUTS.NAVIGATION }
      );
      await expect(page.locator('[data-auth-shell]')).toHaveCount(1);
      await expect(page.locator('[data-auth-shell-mode]')).toHaveCount(1);
      await expect(
        page.locator('[data-auth-shell-mode="sign-up"]')
      ).toHaveCount(0);
      await expect(
        page.locator('[data-auth-shell-compact="true"]')
      ).toHaveCount(0);
      const signin = page.locator('[data-auth-shell-mode="sign-in"]');
      await expect(signin).toHaveCount(1);
      await expect(signin).toHaveAttribute('data-auth-shell-hydrated', 'true');
      await expect(
        signin
          .locator('[data-auth-mode-switch]')
          .getByRole('link', { name: 'Trouble signing in?', exact: true })
      ).toHaveAttribute('href', APP_ROUTES.SUPPORT);
      await assertNoCriticalErrors(getContext(), testInfo);
    } finally {
      cleanup();
      await page.context().close();
    }
  });
});

/**
 * JOV-2065 / JOV-2066: Auth page content and CTA routing
 *
 * Covers:
 * - /sign-up page contains signup copy, signup form, link to /sign-in
 * - /signin exposes email entry and the canonical support recovery link
 * - Signup → signin preserves return context; signin → support remains reachable
 * - Public CTAs with data-cta-sign-up="true" navigate to /signup or a dialog[data-auth-mode="sign-up"]
 */
test.describe('Auth pages: content and CTA routing (JOV-2065, JOV-2066)', () => {
  test.skip(
    FAST_ITERATION,
    'Auth CTA routing coverage runs in the standard gate, not fast-iteration gate'
  );

  test('/signup page contains signup copy and a link back to /signin', async ({
    browser,
  }, testInfo) => {
    const page = await createFreshAuthPage(browser);
    const { getContext, cleanup } = setupPageMonitoring(page);

    try {
      await openAuthPage(page, APP_ROUTES.SIGNUP);

      // Should remain on /signup
      await expect(page).toHaveURL(url => url.pathname === APP_ROUTES.SIGNUP, {
        timeout: SMOKE_TIMEOUTS.NAVIGATION,
      });

      // Signup page must contain signup-oriented copy
      const bodyText = await page.locator('body').textContent();
      if (await isAuthUnavailable(page)) {
        expect(bodyText).toContain('temporarily unavailable');
        await assertNoCriticalErrors(getContext(), testInfo);
        return;
      }

      const hasSignupCopy =
        (bodyText ?? '').toLowerCase().includes('sign up') ||
        (bodyText ?? '').toLowerCase().includes('request access') ||
        (bodyText ?? '').toLowerCase().includes('create') ||
        (bodyText ?? '').toLowerCase().includes('get started');
      expect(
        hasSignupCopy,
        'Signup page must contain signup-oriented copy'
      ).toBe(true);

      // Must have a cross-link to /signin — Clerk renders a "Sign in" link in its footer
      const signinLink = page
        .getByRole('link', { name: /sign in|log in/i })
        .first();
      await expect(signinLink).toBeVisible({
        timeout: SMOKE_TIMEOUTS.VISIBILITY,
      });

      await assertNoCriticalErrors(getContext(), testInfo);
    } finally {
      cleanup();
      await page.context().close();
    }
  });

  test('/signin page contains email entry and a canonical recovery link', async ({
    browser,
  }, testInfo) => {
    const page = await createFreshAuthPage(browser);
    const { getContext, cleanup } = setupPageMonitoring(page);

    try {
      await openAuthPage(page, APP_ROUTES.SIGNIN);
      await expect(page).toHaveURL(url => url.pathname === APP_ROUTES.SIGNIN, {
        timeout: SMOKE_TIMEOUTS.NAVIGATION,
      });
      const signin = page.locator('[data-auth-shell-mode="sign-in"]');
      await expect(signin).toHaveCount(1);
      await expect(signin).toHaveAttribute('data-auth-shell-hydrated', 'true');
      await expect(
        signin.getByRole('heading', { name: 'Log in to Jovie', exact: true })
      ).toBeVisible();
      await expect(
        signin.getByRole('textbox', { name: 'Email', exact: true })
      ).toBeEditable();
      const modeSwitch = signin.locator('[data-auth-mode-switch]');
      const recovery = modeSwitch.getByRole('link', {
        name: 'Trouble signing in?',
        exact: true,
      });
      await expect(recovery).toHaveCount(1);
      await expect(recovery).toBeVisible();
      await expect(recovery).toHaveAttribute('href', APP_ROUTES.SUPPORT);
      await expect(modeSwitch.locator('a[href^="/signup"]')).toHaveCount(0);
      await assertNoCriticalErrors(getContext(), testInfo);
    } finally {
      cleanup();
      await page.context().close();
    }
  });

  test('signup → signin cross-link navigates to /signin and preserves redirect_url', async ({
    browser,
  }, testInfo) => {
    const page = await createFreshAuthPage(browser);
    const { getContext, cleanup } = setupPageMonitoring(page);
    const redirectUrl = APP_ROUTES.DASHBOARD;

    try {
      await openAuthPage(
        page,
        `${APP_ROUTES.SIGNUP}?redirect_url=${encodeURIComponent(redirectUrl)}`
      );
      const signup = page.locator('[data-auth-shell-mode="sign-up"]');
      await expect(signup).toHaveCount(1);
      await expect(signup).toHaveAttribute('data-auth-shell-hydrated', 'true');
      const signinLink = signup
        .locator('[data-auth-mode-switch]')
        .getByRole('link', { name: 'Sign in', exact: true });
      await expect(signinLink).toHaveCount(1);
      await expect(signinLink).toBeVisible();
      await expect(signinLink).toHaveAttribute(
        'href',
        `${APP_ROUTES.SIGNIN}?redirect_url=${encodeURIComponent(redirectUrl)}`
      );
      await signinLink.click();
      await expect(page).toHaveURL(
        url =>
          url.pathname === APP_ROUTES.SIGNIN &&
          url.searchParams.get('redirect_url') === redirectUrl,
        { timeout: SMOKE_TIMEOUTS.NAVIGATION }
      );
      await expect(page.locator('[data-auth-shell]')).toHaveCount(1);
      await expect(page.locator('[data-auth-shell-mode]')).toHaveCount(1);
      await expect(
        page.locator('[data-auth-shell-mode="sign-up"]')
      ).toHaveCount(0);
      await expect(
        page.locator('[data-auth-shell-compact="true"]')
      ).toHaveCount(0);
      const signin = page.locator('[data-auth-shell-mode="sign-in"]');
      await expect(signin).toHaveCount(1);
      await expect(signin).toHaveAttribute('data-auth-shell-hydrated', 'true');
      await assertNoCriticalErrors(getContext(), testInfo);
    } finally {
      cleanup();
      await page.context().close();
    }
  });

  test('signin → support recovery navigates to /support', async ({
    browser,
  }, testInfo) => {
    const page = await createFreshAuthPage(browser);
    const { getContext, cleanup } = setupPageMonitoring(page);

    try {
      await openAuthPage(page, APP_ROUTES.SIGNIN);
      const signin = page.locator('[data-auth-shell-mode="sign-in"]');
      await expect(signin).toHaveCount(1);
      await expect(signin).toHaveAttribute('data-auth-shell-hydrated', 'true');
      const recovery = signin
        .locator('[data-auth-mode-switch]')
        .getByRole('link', { name: 'Trouble signing in?', exact: true });
      await expect(recovery).toHaveCount(1);
      await expect(recovery).toBeVisible();
      await expect(recovery).toHaveAttribute('href', APP_ROUTES.SUPPORT);
      await recovery.focus();
      await page.keyboard.press('Enter');
      await expect(page).toHaveURL(url => url.pathname === APP_ROUTES.SUPPORT, {
        timeout: SMOKE_TIMEOUTS.NAVIGATION,
      });
      await assertNoCriticalErrors(getContext(), testInfo);
    } finally {
      cleanup();
      await page.context().close();
    }
  });
});
