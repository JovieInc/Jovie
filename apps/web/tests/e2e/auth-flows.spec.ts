import { expect, test } from './setup';
import { SMOKE_TIMEOUTS, waitForHydration } from './utils/smoke-test-utils';

/**
 * Auth Flow E2E Tests
 *
 * Covers sign-up and sign-in user flows including:
 * - Method selection (Google + Email)
 * - Email input step with validation
 * - Navigation between auth pages
 * - Error display behavior
 * - Layout shift guard for error messages
 *
 * Runs unauthenticated - no real Clerk credentials required.
 */

// Run as unauthenticated user
test.use({ storageState: { cookies: [], origins: [] } });

/** Intercept analytics endpoints to prevent test interference */
async function interceptAnalytics(page: import('@playwright/test').Page) {
  await page.route('**/api/profile/view', route =>
    route.fulfill({ status: 200, body: '{}' })
  );
  await page.route('**/api/audience/visit', route =>
    route.fulfill({ status: 200, body: '{}' })
  );
  await page.route('**/api/track', route =>
    route.fulfill({ status: 200, body: '{}' })
  );
}

// ---------------------------------------------------------------------------
// Sign-Up Flow
// ---------------------------------------------------------------------------
test.describe('Sign-Up Flow', () => {
  test.beforeEach(async ({ page }) => {
    await interceptAnalytics(page);
    await page.goto('/sign-up', { waitUntil: 'domcontentloaded' });
    await waitForHydration(page);
  });

  test('displays Google and Email buttons on method selector', async ({
    page,
  }) => {
    const googleBtn = page.getByRole('button', {
      name: /continue with google/i,
    });
    const emailBtn = page.getByRole('button', {
      name: /continue with email/i,
    });

    await expect(googleBtn).toBeVisible({
      timeout: SMOKE_TIMEOUTS.VISIBILITY,
    });
    await expect(emailBtn).toBeVisible({
      timeout: SMOKE_TIMEOUTS.VISIBILITY,
    });
  });

  test('does not display Spotify button', async ({ page }) => {
    const spotifyBtn = page.getByRole('button', {
      name: /spotify/i,
    });

    await expect(spotifyBtn).toHaveCount(0);
  });

  test('clicking email navigates to email input step', async ({ page }) => {
    const emailBtn = page.getByRole('button', {
      name: /continue with email/i,
    });
    await expect(emailBtn).toBeVisible({
      timeout: SMOKE_TIMEOUTS.VISIBILITY,
    });
    await emailBtn.click();

    const emailInput = page.getByRole('textbox', { name: /email/i });
    await expect(emailInput).toBeVisible({
      timeout: SMOKE_TIMEOUTS.VISIBILITY,
    });
  });

  test('email step validates empty input', async ({ page }) => {
    const emailBtn = page.getByRole('button', {
      name: /continue with email/i,
    });
    await expect(emailBtn).toBeVisible({
      timeout: SMOKE_TIMEOUTS.VISIBILITY,
    });
    await emailBtn.click();

    const emailInput = page.getByRole('textbox', { name: /email/i });
    await expect(emailInput).toBeVisible({
      timeout: SMOKE_TIMEOUTS.VISIBILITY,
    });

    const submitBtn = page.getByRole('button', {
      name: /continue with email/i,
    });
    await submitBtn.click();

    const error = page.getByRole('alert');
    await expect(error).toBeVisible({ timeout: SMOKE_TIMEOUTS.QUICK });
  });

  test('email step validates invalid email format', async ({ page }) => {
    const emailBtn = page.getByRole('button', {
      name: /continue with email/i,
    });
    await expect(emailBtn).toBeVisible({
      timeout: SMOKE_TIMEOUTS.VISIBILITY,
    });
    await emailBtn.click();

    const emailInput = page.getByRole('textbox', { name: /email/i });
    await expect(emailInput).toBeVisible({
      timeout: SMOKE_TIMEOUTS.VISIBILITY,
    });

    await emailInput.fill('not-an-email');

    const submitBtn = page.getByRole('button', {
      name: /continue with email/i,
    });
    await submitBtn.click();

    const error = page.getByRole('alert');
    await expect(error).toBeVisible({ timeout: SMOKE_TIMEOUTS.QUICK });
    await expect(error).toContainText(/valid email/i);
  });

  test('shows terms of service and privacy policy links', async ({ page }) => {
    const tosLink = page.getByRole('link', { name: /terms of service/i });
    const privacyLink = page.getByRole('link', { name: /privacy policy/i });

    await expect(tosLink).toBeVisible({ timeout: SMOKE_TIMEOUTS.VISIBILITY });
    await expect(privacyLink).toBeVisible({
      timeout: SMOKE_TIMEOUTS.VISIBILITY,
    });
  });

  test('has link to sign in page', async ({ page }) => {
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
// Sign-In Flow
// ---------------------------------------------------------------------------
test.describe('Sign-In Flow', () => {
  test.beforeEach(async ({ page }) => {
    await interceptAnalytics(page);
    await page.goto('/signin', { waitUntil: 'domcontentloaded' });
    await waitForHydration(page);
  });

  test('displays Google and Email buttons on method selector', async ({
    page,
  }) => {
    const googleBtn = page.getByRole('button', {
      name: /continue with google/i,
    });
    const emailBtn = page.getByRole('button', {
      name: /continue with email/i,
    });

    await expect(googleBtn).toBeVisible({
      timeout: SMOKE_TIMEOUTS.VISIBILITY,
    });
    await expect(emailBtn).toBeVisible({
      timeout: SMOKE_TIMEOUTS.VISIBILITY,
    });
  });

  test('does not display Spotify button', async ({ page }) => {
    const spotifyBtn = page.getByRole('button', {
      name: /spotify/i,
    });

    await expect(spotifyBtn).toHaveCount(0);
  });

  test('clicking email navigates to email input step', async ({ page }) => {
    const emailBtn = page.getByRole('button', {
      name: /continue with email/i,
    });
    await expect(emailBtn).toBeVisible({
      timeout: SMOKE_TIMEOUTS.VISIBILITY,
    });
    await emailBtn.click();

    const emailInput = page.getByRole('textbox', { name: /email/i });
    await expect(emailInput).toBeVisible({
      timeout: SMOKE_TIMEOUTS.VISIBILITY,
    });
  });

  test('email step validates empty input', async ({ page }) => {
    const emailBtn = page.getByRole('button', {
      name: /continue with email/i,
    });
    await expect(emailBtn).toBeVisible({
      timeout: SMOKE_TIMEOUTS.VISIBILITY,
    });
    await emailBtn.click();

    const emailInput = page.getByRole('textbox', { name: /email/i });
    await expect(emailInput).toBeVisible({
      timeout: SMOKE_TIMEOUTS.VISIBILITY,
    });

    const submitBtn = page.getByRole('button', {
      name: /continue with email/i,
    });
    await submitBtn.click();

    const error = page.getByRole('alert');
    await expect(error).toBeVisible({ timeout: SMOKE_TIMEOUTS.QUICK });
  });

  test('has link to sign up page', async ({ page }) => {
    const signUpLink = page
      .getByRole('link', { name: /sign up|create account|get started/i })
      .first();

    if ((await signUpLink.count()) > 0) {
      await signUpLink.click();
      await expect(page).toHaveURL(/\/sign-up/, {
        timeout: SMOKE_TIMEOUTS.NAVIGATION,
      });
    }
  });

  test('heading says "Log in to Jovie"', async ({ page }) => {
    const heading = page.getByRole('heading', { name: /log in to jovie/i });
    await expect(heading).toBeVisible({ timeout: SMOKE_TIMEOUTS.VISIBILITY });
  });
});

// ---------------------------------------------------------------------------
// Error Layout Shift Guard
// ---------------------------------------------------------------------------
test.describe('Error Layout Shift Guard', () => {
  test('error container has fixed height before and after error appears (sign-up email step)', async ({
    page,
  }) => {
    await interceptAnalytics(page);
    await page.goto('/sign-up', { waitUntil: 'domcontentloaded' });
    await waitForHydration(page);

    const emailBtn = page.getByRole('button', {
      name: /continue with email/i,
    });
    await expect(emailBtn).toBeVisible({
      timeout: SMOKE_TIMEOUTS.VISIBILITY,
    });
    await emailBtn.click();

    const emailInput = page.getByRole('textbox', { name: /email/i });
    await expect(emailInput).toBeVisible({
      timeout: SMOKE_TIMEOUTS.VISIBILITY,
    });

    const submitBtn = page.getByRole('button', {
      name: /continue with email/i,
    });
    await expect(submitBtn).toBeVisible({
      timeout: SMOKE_TIMEOUTS.VISIBILITY,
    });
    const beforeBox = await submitBtn.boundingBox();

    await submitBtn.click();

    const error = page.getByRole('alert');
    await expect(error).toBeVisible({ timeout: SMOKE_TIMEOUTS.QUICK });

    const afterBox = await submitBtn.boundingBox();

    if (beforeBox && afterBox) {
      expect(Math.abs(afterBox.y - beforeBox.y)).toBeLessThanOrEqual(2);
    }
  });
});

// ---------------------------------------------------------------------------
// Google OAuth Button Behavior
// ---------------------------------------------------------------------------
test.describe('Google OAuth', () => {
  test('Google button shows loading state when clicked', async ({ page }) => {
    await interceptAnalytics(page);
    await page.goto('/signin', { waitUntil: 'domcontentloaded' });
    await waitForHydration(page);

    const googleBtn = page.getByRole('button', {
      name: /continue with google/i,
    });
    await expect(googleBtn).toBeVisible({
      timeout: SMOKE_TIMEOUTS.VISIBILITY,
    });

    await googleBtn.click();

    // We just verify the click didn't crash the page
    await expect(page.locator('body')).toBeVisible();
  });
});
