import { expect, test } from '@playwright/test';

/**
 * Billing smoke tests - verify billing flow works without crashing
 * @smoke tag for fast-path deployment eligibility
 */

test.describe('Billing Smoke Tests', () => {
  function isCriticalFailedResponse(res: {
    url: string;
    status: number;
  }): boolean {
    const { url, status } = res;

    // 5xx is always critical
    if (status >= 500) return true;

    // Ignore expected auth failures
    if (status === 401 || status === 403) return false;

    // Only treat same-origin API failures as critical.
    // (Asset 404s and third-party noise should not fail smoke.)
    try {
      const parsed = new URL(url);
      const isLocalhost =
        parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
      if (!isLocalhost) return false;

      const path = parsed.pathname;
      const isApiRoute = path.startsWith('/api/') || path.startsWith('/trpc/');
      return isApiRoute && status >= 400;
    } catch {
      return false;
    }
  }

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
    // Use waitUntil: 'networkidle' to ensure redirect completes
    await page.goto('/billing', { waitUntil: 'networkidle', timeout: 15000 });

    // Wait for URL to stabilize (redirect may happen)
    try {
      await page.waitForURL(
        url =>
          url.pathname.includes('/signin') ||
          url.pathname.includes('/signup') ||
          url.pathname.includes('/billing'),
        { timeout: 5000 }
      );
    } catch {
      // URL didn't change, continue with current URL
    }

    // Check if we're on sign-in page (expected for unauthenticated user)
    // In mock Clerk mode, may redirect to Clerk handshake URL
    const currentUrl = page.url();
    const isOnSignIn =
      currentUrl.includes('/signin') ||
      currentUrl.includes('/signup') ||
      currentUrl.includes('/sign-in') ||
      currentUrl.includes('/sign-up');
    const isOnBilling = currentUrl.includes('/billing');
    const isOnClerkHandshake =
      currentUrl.includes('clerk') && currentUrl.includes('handshake');

    // Either should be on sign-in (redirect), Clerk handshake (auth flow), or billing page (if authenticated)
    // If neither, log the actual URL for debugging
    if (!isOnSignIn && !isOnBilling && !isOnClerkHandshake) {
      console.log(`Unexpected URL: ${currentUrl}`);
    }
    expect(isOnSignIn || isOnBilling || isOnClerkHandshake).toBe(true);

    // In mock Clerk mode, /signin is not expected to fully function (we bypass ClerkProvider).
    // For smoke purposes, a successful redirect to sign-in is sufficient.
    if (isOnSignIn) {
      await expect(page.locator('body')).toBeVisible();
      return;
    }

    // Verify no critical console errors
    // Filter out expected errors in test/mock environments
    const criticalErrors = errors.filter(
      error =>
        !error.includes('Warning:') &&
        !error.includes('analytics') &&
        !error.includes('Clerk') &&
        !error.includes('handshake') &&
        !error.includes('Failed to load resource') &&
        !error.includes('test-pass-53.clerk.accounts.dev')
    );

    if (criticalErrors.length > 0) {
      console.log('Critical errors found:', criticalErrors);
    }
    expect(criticalErrors.length).toBe(0);

    // Verify no failed API responses (except auth-related 401s which are expected)
    const criticalFailures = failedResponses.filter(isCriticalFailedResponse);

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
    // Use waitUntil: 'networkidle' to ensure redirect completes
    await page.goto('/account', { waitUntil: 'networkidle', timeout: 15000 });

    // Wait for URL to stabilize (redirect may happen)
    try {
      await page.waitForURL(
        url =>
          url.pathname.includes('/signin') ||
          url.pathname.includes('/signup') ||
          url.pathname.includes('/account'),
        { timeout: 5000 }
      );
    } catch {
      // URL didn't change, continue with current URL
    }

    // Check if we're on sign-in page (expected for unauthenticated user)
    // In mock Clerk mode, may redirect to Clerk handshake URL
    const currentUrl = page.url();
    const isOnSignIn =
      currentUrl.includes('/signin') ||
      currentUrl.includes('/signup') ||
      currentUrl.includes('/sign-in') ||
      currentUrl.includes('/sign-up');
    const isOnAccount = currentUrl.includes('/account');
    const isOnClerkHandshake =
      currentUrl.includes('clerk') && currentUrl.includes('handshake');

    // Either should be on sign-in (redirect), Clerk handshake (auth flow), or account page (if authenticated)
    // If neither, log the actual URL for debugging
    if (!isOnSignIn && !isOnAccount && !isOnClerkHandshake) {
      console.log(`Unexpected URL: ${currentUrl}`);
    }
    expect(isOnSignIn || isOnAccount || isOnClerkHandshake).toBe(true);

    // In mock Clerk mode, /signin is not expected to fully function (we bypass ClerkProvider).
    // For smoke purposes, a successful redirect to sign-in is sufficient.
    if (isOnSignIn) {
      await expect(page.locator('body')).toBeVisible();
      return;
    }

    // Verify no critical console errors
    // Filter out expected errors in test/mock environments
    const criticalErrors = errors.filter(
      error =>
        !error.includes('Warning:') &&
        !error.includes('analytics') &&
        !error.includes('Clerk') &&
        !error.includes('handshake') &&
        !error.includes('Failed to load resource') &&
        !error.includes('test-pass-53.clerk.accounts.dev')
    );

    if (criticalErrors.length > 0) {
      console.log('Critical errors found:', criticalErrors);
    }
    expect(criticalErrors.length).toBe(0);

    // Verify no failed API responses (except auth-related 401s which are expected)
    const criticalFailures = failedResponses.filter(isCriticalFailedResponse);

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
    // Use waitUntil: 'networkidle' to ensure redirect completes
    await page.goto('/billing/success', {
      waitUntil: 'networkidle',
      timeout: 15000,
    });

    // Wait for URL to stabilize (redirect may happen)
    try {
      await page.waitForURL(
        url =>
          url.pathname.includes('/signin') ||
          url.pathname.includes('/signup') ||
          url.pathname.includes('/billing/success'),
        { timeout: 5000 }
      );
    } catch {
      // URL didn't change, continue with current URL
    }

    // Should be on success page or redirected to sign-in
    // In mock Clerk mode, may redirect to Clerk handshake URL
    const currentUrl = page.url();
    const isOnSignIn =
      currentUrl.includes('/signin') ||
      currentUrl.includes('/signup') ||
      currentUrl.includes('/sign-in') ||
      currentUrl.includes('/sign-up');
    const isOnSuccess = currentUrl.includes('/billing/success');
    const isOnClerkHandshake =
      currentUrl.includes('clerk') && currentUrl.includes('handshake');

    // If neither, log the actual URL for debugging
    if (!isOnSignIn && !isOnSuccess && !isOnClerkHandshake) {
      console.log(`Unexpected URL: ${currentUrl}`);
    }
    expect(isOnSignIn || isOnSuccess || isOnClerkHandshake).toBe(true);

    // In mock Clerk mode, /signin is not expected to fully function (we bypass ClerkProvider).
    // For smoke purposes, a successful redirect to sign-in is sufficient.
    if (isOnSignIn) {
      await expect(page.locator('body')).toBeVisible();
      return;
    }

    // If on success page, verify content loads
    if (isOnSuccess) {
      // Should have success messaging
      const hasSuccessContent =
        (await page.locator('text=Welcome to Pro').isVisible()) ||
        (await page.locator('text=subscription').isVisible());
      expect(hasSuccessContent).toBe(true);
    }

    // Verify no critical console errors
    // Filter out expected errors in test/mock environments
    const criticalErrors = errors.filter(
      error =>
        !error.includes('Warning:') &&
        !error.includes('analytics') &&
        !error.includes('Clerk') &&
        !error.includes('handshake') &&
        !error.includes('Failed to load resource') &&
        !error.includes('test-pass-53.clerk.accounts.dev')
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
    // Use waitUntil: 'networkidle' to ensure redirect completes
    await page.goto('/billing/cancel', {
      waitUntil: 'networkidle',
      timeout: 15000,
    });

    // Wait for URL to stabilize (redirect may happen)
    try {
      await page.waitForURL(
        url =>
          url.pathname.includes('/signin') ||
          url.pathname.includes('/signup') ||
          url.pathname.includes('/billing/cancel'),
        { timeout: 5000 }
      );
    } catch {
      // URL didn't change, continue with current URL
    }

    // Should be on cancel page or redirected to sign-in
    // In mock Clerk mode, may redirect to Clerk handshake URL
    const currentUrl = page.url();
    const isOnSignIn =
      currentUrl.includes('/signin') ||
      currentUrl.includes('/signup') ||
      currentUrl.includes('/sign-in') ||
      currentUrl.includes('/sign-up');
    const isOnCancel = currentUrl.includes('/billing/cancel');
    const isOnClerkHandshake =
      currentUrl.includes('clerk') && currentUrl.includes('handshake');

    // If neither, log the actual URL for debugging
    if (!isOnSignIn && !isOnCancel && !isOnClerkHandshake) {
      console.log(`Unexpected URL: ${currentUrl}`);
    }
    expect(isOnSignIn || isOnCancel || isOnClerkHandshake).toBe(true);

    // In mock Clerk mode, /signin is not expected to fully function (we bypass ClerkProvider).
    // For smoke purposes, a successful redirect to sign-in is sufficient.
    if (isOnSignIn) {
      await expect(page.locator('body')).toBeVisible();
      return;
    }

    // If on cancel page, verify content loads
    if (isOnCancel) {
      // Should have cancel messaging
      const hasCancelContent =
        (await page.locator('text=Checkout Cancelled').isVisible()) ||
        (await page.locator('text=cancelled').isVisible());
      expect(hasCancelContent).toBe(true);
    }

    // Verify no critical console errors
    // Filter out expected errors in test/mock environments
    const criticalErrors = errors.filter(
      error =>
        !error.includes('Warning:') &&
        !error.includes('analytics') &&
        !error.includes('Clerk') &&
        !error.includes('handshake') &&
        !error.includes('Failed to load resource') &&
        !error.includes('test-pass-53.clerk.accounts.dev')
    );

    expect(criticalErrors.length).toBe(0);
  });
});
