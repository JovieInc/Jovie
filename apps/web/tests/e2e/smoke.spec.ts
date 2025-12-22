import { expect, test } from '@playwright/test';

/**
 * Smoke tests - verify the app runs without crashing
 */

test.describe('Smoke Tests', () => {
  test('Homepage loads without errors @smoke', async ({ page }) => {
    // Monitor console errors
    const errors: string[] = [];
    // Collect network diagnostics
    const failedResponses: {
      url: string;
      status: number;
      statusText: string;
    }[] = [];
    const failedRequests: { url: string; failureText: string }[] = [];
    const consoleNetworkErrors: string[] = [];

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

    page.on('requestfailed', req => {
      failedRequests.push({
        url: req.url(),
        failureText: req.failure()?.errorText || 'unknown',
      });
    });

    page.on('console', msg => {
      if (msg.type() === 'error') {
        const text = msg.text();
        if (text.includes('Failed to load resource')) {
          consoleNetworkErrors.push(text);
        }
        // Ignore specific expected errors in test environment
        const isClerkError = text.toLowerCase().includes('clerk');
        const isNetworkResourceError = text.includes('Failed to load resource');
        const isExpectedTestError =
          text.includes('Test environment') || text.includes('Mock data');

        if (!isClerkError && !isNetworkResourceError && !isExpectedTestError) {
          errors.push(text);
        }
      }
    });

    // Navigate to homepage
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    // Allow for potential redirects and resource loading without waiting for full network idle
    await page.waitForLoadState('load');

    // Should eventually land on a page (either homepage or Clerk handshake)
    const url = page.url();
    expect(url).toBeTruthy();

    // Check for any content to ensure page renders
    const mainContent = await page.locator('main, [role="main"], body').first();
    await expect(mainContent).toBeVisible();

    // Small buffer to capture late resource responses (without full network idle)
    await page.waitForTimeout(500);

    // Attach network diagnostics for debugging (helps identify 404/500 assets like /og/default.png)
    const networkReport = {
      pageUrl: url,
      failedResponses,
      failedRequests,
      consoleNetworkErrors,
    };
    await test.info().attach('homepage-network-report', {
      body: JSON.stringify(networkReport, null, 2),
      contentType: 'application/json',
    });

    if (
      failedResponses.length ||
      failedRequests.length ||
      consoleNetworkErrors.length
    ) {
      // Emit a concise warning in test output as well
      // eslint-disable-next-line no-console
      console.warn('Network issues detected on homepage', networkReport);
    }

    // No critical console errors
    expect(errors).toHaveLength(0);
  });

  test('App handles unknown routes gracefully @smoke', async ({ page }) => {
    // Navigate to a non-existent route
    await page.goto('/non-existent-route-123', {
      waitUntil: 'domcontentloaded',
    });

    // Should show 404 page or redirect, not crash
    const pageContent = await page.textContent('body');
    expect(pageContent).toBeTruthy();

    // Should not have server error
    await expect(page.locator('text=500')).not.toBeVisible();
    await expect(page.locator('text=Internal Server Error')).not.toBeVisible();
  });

  test('Critical pages respond without 500 errors @smoke', async ({ page }) => {
    const routes = ['/', '/sign-up', '/pricing'];

    for (const route of routes) {
      const response = await page.goto(route, {
        waitUntil: 'domcontentloaded',
      });

      // Should not return 500 error
      expect(response?.status()).toBeLessThan(500);
    }
  });
});
