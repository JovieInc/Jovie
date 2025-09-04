import { expect, test } from '@playwright/test';

/**
 * Billing smoke tests - verify billing flow works without crashing
 * @smoke tag for fast-path deployment eligibility
 */

test.describe('Billing Smoke Tests', () => {
  test('Billing dashboard loads without errors @smoke', async ({ page }) => {
    // Monitor console errors
    const errors: string[] = [];
    const failedResponses: {
      url: string;
      status: number;
      statusText: string;
    }[] = [];

    page.on('response', res => {
      const status = res.status();
      if (status >= 400) {
        failedResponses.push({
          url: res.url(),
          status,
          statusText: res.statusText(),
        });
      }
    });

    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    // Navigate to billing page (will redirect to sign-in if not authenticated)
    await page.goto('/billing');

    // Wait for page to load
    await page.waitForLoadState('networkidle');

    // Check if we're on sign-in page (expected for unauthenticated user)
    const currentUrl = page.url();
    const isOnSignIn =
      currentUrl.includes('/sign-in') || currentUrl.includes('/sign-up');
    const isOnBilling = currentUrl.includes('/billing');

    // Either should be on sign-in (redirect) or billing page (if authenticated)
    expect(isOnSignIn || isOnBilling).toBe(true);

    // Verify no critical console errors
    const criticalErrors = errors.filter(
      error =>
        !error.includes('Warning:') &&
        !error.includes('PostHog') &&
        !error.includes('analytics')
    );

    if (criticalErrors.length > 0) {
      console.log('Critical errors found:', criticalErrors);
    }
    expect(criticalErrors.length).toBe(0);

    // Verify no failed API responses (except auth-related 401s which are expected)
    const criticalFailures = failedResponses.filter(
      res => res.status !== 401 && res.status !== 403
    );

    if (criticalFailures.length > 0) {
      console.log('Critical API failures:', criticalFailures);
    }
    expect(criticalFailures.length).toBe(0);
  });

  test('Account dashboard loads without errors @smoke', async ({ page }) => {
    // Monitor console errors
    const errors: string[] = [];
    const failedResponses: {
      url: string;
      status: number;
      statusText: string;
    }[] = [];

    page.on('response', res => {
      const status = res.status();
      if (status >= 400) {
        failedResponses.push({
          url: res.url(),
          status,
          statusText: res.statusText(),
        });
      }
    });

    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    // Navigate to account page (will redirect to sign-in if not authenticated)
    await page.goto('/account');

    // Wait for page to load
    await page.waitForLoadState('networkidle');

    // Check if we're on sign-in page (expected for unauthenticated user)
    const currentUrl = page.url();
    const isOnSignIn =
      currentUrl.includes('/sign-in') || currentUrl.includes('/sign-up');
    const isOnAccount = currentUrl.includes('/account');

    // Either should be on sign-in (redirect) or account page (if authenticated)
    expect(isOnSignIn || isOnAccount).toBe(true);

    // Verify no critical console errors
    const criticalErrors = errors.filter(
      error =>
        !error.includes('Warning:') &&
        !error.includes('PostHog') &&
        !error.includes('analytics')
    );

    if (criticalErrors.length > 0) {
      console.log('Critical errors found:', criticalErrors);
    }
    expect(criticalErrors.length).toBe(0);

    // Verify no failed API responses (except auth-related 401s which are expected)
    const criticalFailures = failedResponses.filter(
      res => res.status !== 401 && res.status !== 403
    );

    if (criticalFailures.length > 0) {
      console.log('Critical API failures:', criticalFailures);
    }
    expect(criticalFailures.length).toBe(0);
  });

  test('Billing success page loads without errors @smoke', async ({ page }) => {
    // Monitor console errors
    const errors: string[] = [];

    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    // Navigate to billing success page
    await page.goto('/billing/success');

    // Wait for page to load
    await page.waitForLoadState('networkidle');

    // Should be on success page or redirected to sign-in
    const currentUrl = page.url();
    const isOnSignIn =
      currentUrl.includes('/sign-in') || currentUrl.includes('/sign-up');
    const isOnSuccess = currentUrl.includes('/billing/success');

    expect(isOnSignIn || isOnSuccess).toBe(true);

    // If on success page, verify content loads
    if (isOnSuccess) {
      // Should have success messaging
      const hasSuccessContent =
        (await page.locator('text=Welcome to Pro').isVisible()) ||
        (await page.locator('text=subscription').isVisible());
      expect(hasSuccessContent).toBe(true);
    }

    // Verify no critical console errors
    const criticalErrors = errors.filter(
      error =>
        !error.includes('Warning:') &&
        !error.includes('PostHog') &&
        !error.includes('analytics')
    );

    expect(criticalErrors.length).toBe(0);
  });

  test('Billing cancel page loads without errors @smoke', async ({ page }) => {
    // Monitor console errors
    const errors: string[] = [];

    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    // Navigate to billing cancel page
    await page.goto('/billing/cancel');

    // Wait for page to load
    await page.waitForLoadState('networkidle');

    // Should be on cancel page or redirected to sign-in
    const currentUrl = page.url();
    const isOnSignIn =
      currentUrl.includes('/sign-in') || currentUrl.includes('/sign-up');
    const isOnCancel = currentUrl.includes('/billing/cancel');

    expect(isOnSignIn || isOnCancel).toBe(true);

    // If on cancel page, verify content loads
    if (isOnCancel) {
      // Should have cancel messaging
      const hasCancelContent =
        (await page.locator('text=Checkout Cancelled').isVisible()) ||
        (await page.locator('text=cancelled').isVisible());
      expect(hasCancelContent).toBe(true);
    }

    // Verify no critical console errors
    const criticalErrors = errors.filter(
      error =>
        !error.includes('Warning:') &&
        !error.includes('PostHog') &&
        !error.includes('analytics')
    );

    expect(criticalErrors.length).toBe(0);
  });
});
