/**
 * Intercepted auth modal E2E tests.
 *
 * Covers soft navigations from the homepage into the root `@auth` parallel
 * route. Hard reloads are covered by auth-pages.spec.ts.
 *
 * Run: pnpm run test:web:e2e -- tests/e2e/auth-modal.spec.ts
 */
import { setupClerkTestingToken } from '@clerk/testing/playwright';
import { expect, test } from '@playwright/test';
import { APP_ROUTES } from '@/constants/routes';
import { waitForHydration } from './utils/smoke-test-utils';

test.use({ storageState: { cookies: [], origins: [] } });

const AUTH_MODAL_TIMEOUT = 120_000;

function expectedDialogName(mode: 'signin' | 'signup') {
  const clerkUnavailable =
    process.env.E2E_USE_TEST_AUTH_BYPASS === '1' ||
    process.env.NEXT_PUBLIC_CLERK_MOCK === '1';

  if (clerkUnavailable) {
    return 'Authentication unavailable';
  }

  return mode === 'signin' ? 'Sign in to Jovie' : 'Request access to Jovie';
}

async function blockAnalytics(page: import('@playwright/test').Page) {
  await page.route('**/api/profile/view', r =>
    r.fulfill({ status: 200, body: '{}' })
  );
  await page.route('**/api/audience/visit', r =>
    r.fulfill({ status: 200, body: '{}' })
  );
  await page.route('**/api/track', r => r.fulfill({ status: 200, body: '{}' }));
}

async function prepareHomepage(page: import('@playwright/test').Page) {
  await blockAnalytics(page);

  if (process.env.CLERK_TESTING_SETUP_SUCCESS === 'true') {
    await setupClerkTestingToken({ page }).catch((err: unknown) => {
      console.warn(
        '[auth-modal.spec] setupClerkTestingToken skipped:',
        err instanceof Error ? err.message : String(err)
      );
    });
  }

  await page.goto('/', {
    waitUntil: 'domcontentloaded',
    timeout: AUTH_MODAL_TIMEOUT,
  });
  await waitForHydration(page, { timeout: AUTH_MODAL_TIMEOUT });

  const bodyText = await page
    .locator('body')
    .innerText()
    .catch(() => '');
  if (bodyText.includes('Manifest file is empty')) {
    await page.reload({
      waitUntil: 'domcontentloaded',
      timeout: AUTH_MODAL_TIMEOUT,
    });
    await waitForHydration(page, { timeout: AUTH_MODAL_TIMEOUT });
  }
}

async function openInterceptedModal(
  page: import('@playwright/test').Page,
  mode: 'signin' | 'signup'
) {
  await prepareHomepage(page);

  if (mode === 'signin') {
    await page
      .getByRole('link', { name: /^sign in$/i })
      .first()
      .click({ noWaitAfter: true, timeout: AUTH_MODAL_TIMEOUT });
  } else {
    await page
      .locator('[data-cta-sign-up="true"]')
      .first()
      .click({ noWaitAfter: true, timeout: AUTH_MODAL_TIMEOUT });
  }

  await expect(page).toHaveURL(
    url =>
      url.pathname ===
      (mode === 'signin' ? APP_ROUTES.SIGNIN : APP_ROUTES.SIGNUP),
    { timeout: AUTH_MODAL_TIMEOUT }
  );

  await expect(page.getByRole('dialog')).toBeVisible({
    timeout: AUTH_MODAL_TIMEOUT,
  });
}

async function isAuthUnavailable(page: import('@playwright/test').Page) {
  const bodyText = await page
    .locator('body')
    .innerText()
    .catch(() => '');
  return /auth unavailable|authentication unavailable|clerk is not configured/i.test(
    bodyText
  );
}

async function expectSharedAuthSurface(page: import('@playwright/test').Page) {
  if (await isAuthUnavailable(page)) {
    return;
  }

  const dialog = page.getByRole('dialog');
  await expect(
    dialog.getByRole('button', { name: /continue with google/i })
  ).toBeVisible({ timeout: AUTH_MODAL_TIMEOUT });
  await expect(
    dialog.getByRole('button', { name: /continue with apple/i })
  ).toBeVisible({ timeout: AUTH_MODAL_TIMEOUT });
  await expect(
    dialog.getByRole('link', { name: /terms of service/i })
  ).toHaveAttribute('href', /terms/);
  await expect(
    dialog.getByRole('link', { name: /privacy policy/i })
  ).toHaveAttribute('href', /privacy/);
}

test.describe('Intercepted auth modal', () => {
  test('opens sign-in from the homepage header', async ({ page }) => {
    await openInterceptedModal(page, 'signin');

    await expect(page).toHaveURL(url => url.pathname === APP_ROUTES.SIGNIN, {
      timeout: AUTH_MODAL_TIMEOUT,
    });
    await expect(page.getByRole('dialog')).toHaveAccessibleName(
      expectedDialogName('signin')
    );
  });

  test('opens sign-up from the homepage primary CTA', async ({ page }) => {
    await openInterceptedModal(page, 'signup');

    await expect(page).toHaveURL(url => url.pathname === APP_ROUTES.SIGNUP, {
      timeout: AUTH_MODAL_TIMEOUT,
    });
    await expect(page.getByRole('dialog')).toHaveAccessibleName(
      expectedDialogName('signup')
    );
    await expectSharedAuthSurface(page);
  });

  test('request access opens the same shared sign-up auth surface', async ({
    page,
  }) => {
    await prepareHomepage(page);

    await page
      .getByRole('link', { name: /request access/i })
      .first()
      .click({ noWaitAfter: true, timeout: AUTH_MODAL_TIMEOUT });

    await expect(page).toHaveURL(url => url.pathname === APP_ROUTES.SIGNUP, {
      timeout: AUTH_MODAL_TIMEOUT,
    });
    await expect(page.getByRole('dialog')).toHaveAccessibleName(
      expectedDialogName('signup')
    );
    await expectSharedAuthSurface(page);
  });

  test('renders the intercepted sign-up surface full-screen on mobile', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openInterceptedModal(page, 'signup');

    const dialogBox = await page.getByRole('dialog').boundingBox();
    expect(dialogBox?.x).toBeLessThanOrEqual(1);
    expect(dialogBox?.y).toBeLessThanOrEqual(1);
    expect(dialogBox?.width).toBeGreaterThanOrEqual(389);
    expect(dialogBox?.height).toBeGreaterThanOrEqual(843);
    await expectSharedAuthSurface(page);
  });

  test('slow Clerk readiness keeps stable provider slots visible immediately', async ({
    page,
  }) => {
    await page.route(/clerk|__clerk/, async route => {
      await new Promise(resolve => setTimeout(resolve, 2_500));
      await route.continue();
    });

    await openInterceptedModal(page, 'signup');
    if (await isAuthUnavailable(page)) {
      return;
    }

    const slots = page.locator('[data-auth-provider-slots]').first();
    await expect(slots).toBeVisible({ timeout: 1_000 });
    await expect(
      slots.locator('[data-auth-provider-slot="google"]')
    ).toContainText('Continue with Google');
    await expect(
      slots.locator('[data-auth-provider-slot="apple"]')
    ).toContainText('Continue with Apple');

    const before = await slots.boundingBox();
    await page.waitForTimeout(800);
    const after = await slots.boundingBox();
    expect(Math.abs((before?.height ?? 0) - (after?.height ?? 0))).toBeLessThan(
      1
    );
  });

  test('Escape dismisses the intercepted modal', async ({ page }) => {
    await openInterceptedModal(page, 'signin');

    await page.keyboard.press('Escape');

    await expect(page.getByRole('dialog')).not.toBeVisible({
      timeout: 5_000,
    });
    await expect(page).toHaveURL(url => url.pathname === '/', {
      timeout: 5_000,
    });
  });

  test('back button dismisses the intercepted modal', async ({ page }) => {
    await openInterceptedModal(page, 'signin');

    await page.getByRole('button', { name: 'Go back' }).click();

    await expect(page.getByRole('dialog')).not.toBeVisible({
      timeout: 5_000,
    });
    await expect(page).toHaveURL(url => url.pathname === '/', {
      timeout: 5_000,
    });
  });

  test('keyboard focus stays inside the intercepted modal', async ({
    page,
  }) => {
    await openInterceptedModal(page, 'signin');

    const dialog = page.getByRole('dialog');
    await page.keyboard.press('Tab');

    const focusedInsideDialog = await dialog.evaluate(dialogElement =>
      dialogElement.contains(document.activeElement)
    );
    expect(focusedInsideDialog).toBe(true);
  });
});
