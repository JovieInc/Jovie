import type { Page } from '@playwright/test';
import { expect, test } from './setup';
import { SMOKE_TIMEOUTS, waitForHydration } from './utils/smoke-test-utils';

/**
 * Auth Flow E2E Tests
 *
 * Smoke tests that verify auth forms render correctly and basic interactions work.
 * These tests run unauthenticated and do NOT require real Clerk credentials.
 *
 * @smoke
 */

// Run as unauthenticated user
test.use({ storageState: { cookies: [], origins: [] } });

/** Intercept common analytics endpoints to prevent test interference */
async function interceptAnalytics(page: Page): Promise<void> {
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

test.describe('Auth Flows - Sign Up', () => {
  test.beforeEach(async ({ page }) => {
    await interceptAnalytics(page);
    await page.goto('/sign-up', { waitUntil: 'domcontentloaded' });
    await waitForHydration(page);
  });

  test('renders Google OAuth button as primary action', async ({ page }) => {
    const googleButton = page.getByRole('button', {
      name: /continue with google/i,
    });
    await expect(googleButton).toBeVisible({
      timeout: SMOKE_TIMEOUTS.VISIBILITY,
    });
  });

  test('renders email button as secondary action', async ({ page }) => {
    const emailButton = page.getByRole('button', {
      name: /continue with email/i,
    });
    await expect(emailButton).toBeVisible({
      timeout: SMOKE_TIMEOUTS.VISIBILITY,
    });
  });

  test('does not show Spotify or other OAuth providers', async ({ page }) => {
    const spotifyButton = page.getByRole('button', {
      name: /spotify/i,
    });
    await expect(spotifyButton).toHaveCount(0);

    const appleButton = page.getByRole('button', { name: /apple/i });
    await expect(appleButton).toHaveCount(0);

    const githubButton = page.getByRole('button', { name: /github/i });
    await expect(githubButton).toHaveCount(0);
  });

  test('clicking email button shows email input step', async ({ page }) => {
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
  });

  test('email step shows validation error for invalid email', async ({
    page,
  }) => {
    // Navigate to email step
    const emailButton = page.getByRole('button', {
      name: /continue with email/i,
    });
    await emailButton.click();

    const emailInput = page
      .getByLabel(/email/i)
      .or(page.locator('#email-input'));
    await emailInput.first().fill('not-an-email');

    // Submit the form
    const submitButton = page.getByRole('button', {
      name: /continue with email/i,
    });
    await submitButton.click();

    // Should show an error
    const errorMessage = page.getByRole('alert');
    await expect(errorMessage.first()).toBeVisible({
      timeout: SMOKE_TIMEOUTS.VISIBILITY,
    });
  });

  test('has terms of service and privacy policy links', async ({ page }) => {
    const tosLink = page.getByRole('link', { name: /terms of service/i });
    const privacyLink = page.getByRole('link', { name: /privacy policy/i });
    await expect(tosLink).toBeVisible({ timeout: SMOKE_TIMEOUTS.VISIBILITY });
    await expect(privacyLink).toBeVisible({
      timeout: SMOKE_TIMEOUTS.VISIBILITY,
    });
  });
});

test.describe('Auth Flows - Sign In', () => {
  test.beforeEach(async ({ page }) => {
    await interceptAnalytics(page);
    await page.goto('/signin', { waitUntil: 'domcontentloaded' });
    await waitForHydration(page);
  });

  test('renders Google OAuth button', async ({ page }) => {
    const googleButton = page.getByRole('button', {
      name: /continue with google/i,
    });
    await expect(googleButton).toBeVisible({
      timeout: SMOKE_TIMEOUTS.VISIBILITY,
    });
  });

  test('renders email button', async ({ page }) => {
    const emailButton = page.getByRole('button', {
      name: /continue with email/i,
    });
    await expect(emailButton).toBeVisible({
      timeout: SMOKE_TIMEOUTS.VISIBILITY,
    });
  });

  test('clicking email button navigates to email input', async ({ page }) => {
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
  });

  test('email step has back navigation', async ({ page }) => {
    // Navigate to email step
    const emailButton = page.getByRole('button', {
      name: /continue with email/i,
    });
    await emailButton.click();

    // Should have a back button
    const backButton = page.getByRole('button', { name: /back/i });
    await expect(backButton).toBeVisible({
      timeout: SMOKE_TIMEOUTS.VISIBILITY,
    });

    // Clicking back should return to method selection
    await backButton.click();
    const googleButton = page.getByRole('button', {
      name: /continue with google/i,
    });
    await expect(googleButton).toBeVisible({
      timeout: SMOKE_TIMEOUTS.VISIBILITY,
    });
  });

  test('shows sign-in heading', async ({ page }) => {
    const heading = page.getByRole('heading', { name: /log in to jovie/i });
    await expect(heading).toBeVisible({
      timeout: SMOKE_TIMEOUTS.VISIBILITY,
    });
  });
});

test.describe('Auth Flows - Error Layout Stability', () => {
  test('error messages do not cause layout shift on sign-up email step', async ({
    page,
  }) => {
    await interceptAnalytics(page);
    await page.goto('/sign-up', { waitUntil: 'domcontentloaded' });
    await waitForHydration(page);

    // Navigate to email step
    const emailButton = page.getByRole('button', {
      name: /continue with email/i,
    });
    await emailButton.click();

    // Get initial position of submit button
    const submitButton = page.getByRole('button', {
      name: /continue with email/i,
    });
    await expect(submitButton).toBeVisible({
      timeout: SMOKE_TIMEOUTS.VISIBILITY,
    });
    const initialBox = await submitButton.boundingBox();

    // Submit empty form to trigger error
    await submitButton.click();

    // Wait for error to appear
    const errorMessage = page.getByRole('alert');
    await expect(errorMessage.first()).toBeVisible({
      timeout: SMOKE_TIMEOUTS.VISIBILITY,
    });

    // Check that submit button position hasn't shifted significantly (within 5px)
    const afterErrorBox = await submitButton.boundingBox();
    if (initialBox && afterErrorBox) {
      const yShift = Math.abs(afterErrorBox.y - initialBox.y);
      expect(
        yShift,
        `Submit button shifted ${yShift}px vertically when error appeared`
      ).toBeLessThan(5);
    }
  });
});
