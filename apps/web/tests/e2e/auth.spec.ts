import type { Page } from '@playwright/test';
import { APP_ROUTES } from '@/constants/routes';
import { expect, test } from './setup';
import { SMOKE_TIMEOUTS, waitForHydration } from './utils/smoke-test-utils';

/**
 * Auth E2E Tests (consolidated from auth-flows + auth-ui)
 *
 * Verifies sign-in and sign-up pages render correctly, interactive flows
 * work (email step, validation, navigation between pages), and error
 * states don't cause layout shift.
 *
 * Runs unauthenticated -- no real Clerk credentials required.
 */

test.use({ storageState: { cookies: [], origins: [] } });
const FAST_ITERATION = process.env.E2E_FAST_ITERATION === '1';

async function interceptAnalytics(page: Page): Promise<void> {
  await page.route('**/api/profile/view', r =>
    r.fulfill({ status: 200, body: '{}' })
  );
  await page.route('**/api/audience/visit', r =>
    r.fulfill({ status: 200, body: '{}' })
  );
  await page.route('**/api/track', r => r.fulfill({ status: 200, body: '{}' }));
}

// ---------------------------------------------------------------------------
// Sign Up
// ---------------------------------------------------------------------------

test.describe('Auth - Sign Up', () => {
  test.skip(
    FAST_ITERATION,
    'Auth UI flows are covered by smoke-auth and golden-path in the fast gate'
  );

  test.beforeEach(async ({ page }) => {
    await interceptAnalytics(page);
    await page.goto(APP_ROUTES.SIGNUP, { waitUntil: 'domcontentloaded' });
    await waitForHydration(page);
  });

  test('renders Google OAuth and email buttons', async ({ page }) => {
    await expect(
      page.getByRole('button', { name: /continue with google/i })
    ).toBeVisible({ timeout: SMOKE_TIMEOUTS.VISIBILITY });

    await expect(
      page.getByRole('button', { name: /continue with email/i })
    ).toBeVisible({ timeout: SMOKE_TIMEOUTS.VISIBILITY });
  });

  test('does not show Spotify, Apple, or GitHub OAuth providers', async ({
    page,
  }) => {
    await expect(page.getByRole('button', { name: /spotify/i })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /apple/i })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /github/i })).toHaveCount(0);
  });

  test('clicking email button shows email input, invalid email shows error', async ({
    page,
  }) => {
    const emailButton = page.getByRole('button', {
      name: /continue with email/i,
    });
    await emailButton.click();

    const emailInput = page
      .getByLabel(/email/i)
      .or(page.locator('#email-input'));
    await expect(emailInput.first()).toBeVisible({
      timeout: SMOKE_TIMEOUTS.VISIBILITY,
    });

    // Submit invalid email
    await emailInput.first().fill('not-an-email');
    const submitButton = page.getByRole('button', {
      name: /continue with email/i,
    });
    await submitButton.click();

    // Should show validation error
    await expect(page.getByRole('alert').first()).toBeVisible({
      timeout: SMOKE_TIMEOUTS.VISIBILITY,
    });
  });

  test('has terms of service and privacy policy links', async ({ page }) => {
    await expect(
      page.getByRole('link', { name: /terms of service/i })
    ).toBeVisible({ timeout: SMOKE_TIMEOUTS.VISIBILITY });
    await expect(
      page.getByRole('link', { name: /privacy policy/i })
    ).toBeVisible({ timeout: SMOKE_TIMEOUTS.VISIBILITY });
  });

  test('page has title, meta description, and no error boundaries', async ({
    page,
  }) => {
    await expect(page).toHaveTitle(/Sign Up|Create|Jovie/i);

    const metaDescription = page.locator('meta[name="description"]');
    await expect(metaDescription).toHaveAttribute('content', /.+/);

    const bodyText = await page.locator('body').textContent();
    expect(bodyText).not.toContain('Error boundary');
    expect(bodyText).not.toContain('Something went wrong');
    expect(bodyText).not.toContain('Unhandled Runtime Error');
  });
});

// ---------------------------------------------------------------------------
// Sign In
// ---------------------------------------------------------------------------

test.describe('Auth - Sign In', () => {
  test.skip(
    FAST_ITERATION,
    'Auth UI flows are covered by smoke-auth and golden-path in the fast gate'
  );

  test.beforeEach(async ({ page }) => {
    await interceptAnalytics(page);
    await page.goto(APP_ROUTES.SIGNIN, { waitUntil: 'domcontentloaded' });
    await waitForHydration(page);
  });

  test('renders sign-in heading and auth buttons', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: /log in to jovie/i })
    ).toBeVisible({ timeout: SMOKE_TIMEOUTS.VISIBILITY });

    await expect(
      page.getByRole('button', { name: /continue with google/i })
    ).toBeVisible({ timeout: SMOKE_TIMEOUTS.VISIBILITY });

    await expect(
      page.getByRole('button', { name: /continue with email/i })
    ).toBeVisible({ timeout: SMOKE_TIMEOUTS.VISIBILITY });
  });

  test('email step works with back navigation', async ({ page }) => {
    const emailButton = page.getByRole('button', {
      name: /continue with email/i,
    });
    await emailButton.click();

    // Email input visible
    const emailInput = page
      .getByLabel(/email/i)
      .or(page.locator('#email-input'));
    await expect(emailInput.first()).toBeVisible({
      timeout: SMOKE_TIMEOUTS.VISIBILITY,
    });

    // Back button returns to method selection
    const backButton = page.getByRole('button', { name: /back/i });
    await expect(backButton).toBeVisible({
      timeout: SMOKE_TIMEOUTS.VISIBILITY,
    });
    await backButton.click();
    await expect(
      page.getByRole('button', { name: /continue with google/i })
    ).toBeVisible({ timeout: SMOKE_TIMEOUTS.VISIBILITY });
  });
});

// ---------------------------------------------------------------------------
// Navigation between sign-in and sign-up
// ---------------------------------------------------------------------------

test.describe('Auth - Navigation', () => {
  test.skip(
    FAST_ITERATION,
    'Auth UI flows are covered by smoke-auth and golden-path in the fast gate'
  );

  test('can navigate from sign in to sign up and back', async ({ page }) => {
    await interceptAnalytics(page);
    await page.goto('/signin', { waitUntil: 'domcontentloaded' });
    await waitForHydration(page);

    // Sign in -> sign up
    const signUpLink = page
      .getByRole('link', { name: /sign up|create account|get started/i })
      .first();
    if ((await signUpLink.count()) > 0) {
      await signUpLink.click();
      await expect(page).toHaveURL(/\/sign-up/, {
        timeout: SMOKE_TIMEOUTS.NAVIGATION,
      });
    }

    // Sign up -> sign in
    const signInLink = page
      .getByRole('link', { name: /sign in|log in|already have/i })
      .first();
    if ((await signInLink.count()) > 0) {
      await signInLink.click();
      await expect(page).toHaveURL(/\/signin/, {
        timeout: SMOKE_TIMEOUTS.NAVIGATION,
      });
    }
  });
});

// ---------------------------------------------------------------------------
// Error Layout Stability
// ---------------------------------------------------------------------------

test.describe('Auth - Error Layout Stability', () => {
  test.skip(
    FAST_ITERATION,
    'Auth UI flows are covered by smoke-auth and golden-path in the fast gate'
  );

  test('error messages do not cause layout shift on sign-up email step', async ({
    page,
  }) => {
    await interceptAnalytics(page);
    await page.goto(APP_ROUTES.SIGNUP, { waitUntil: 'domcontentloaded' });
    await waitForHydration(page);

    const emailButton = page.getByRole('button', {
      name: /continue with email/i,
    });
    await emailButton.click();

    const submitButton = page.getByRole('button', {
      name: /continue with email/i,
    });
    await expect(submitButton).toBeVisible({
      timeout: SMOKE_TIMEOUTS.VISIBILITY,
    });
    const initialBox = await submitButton.boundingBox();
    expect(initialBox).not.toBeNull();

    // Trigger error
    await submitButton.click();

    await expect(page.getByRole('alert').first()).toBeVisible({
      timeout: SMOKE_TIMEOUTS.VISIBILITY,
    });

    // Button position should not shift more than 5px
    const afterErrorBox = await submitButton.boundingBox();
    expect(afterErrorBox).not.toBeNull();
    const yShift = Math.abs(afterErrorBox!.y - initialBox!.y);
    expect(
      yShift,
      `Submit button shifted ${yShift}px vertically when error appeared`
    ).toBeLessThan(5);
  });
});
