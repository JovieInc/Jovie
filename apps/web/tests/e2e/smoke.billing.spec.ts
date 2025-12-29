import { expect, test } from '@playwright/test';
import {
  assertNoCriticalErrors,
  assertValidPageState,
  isCriticalNetworkFailure,
  setupPageMonitoring,
  smokeNavigate,
  waitForUrlStable,
} from './utils/smoke-test-utils';

/**
 * Billing smoke tests - verify billing flow works without crashing
 * @smoke tag for fast-path deployment eligibility
 */
test.describe('Billing Smoke Tests @smoke', () => {
  test('Billing dashboard loads without errors @smoke', async ({
    page,
  }, testInfo) => {
    const { getContext, cleanup } = setupPageMonitoring(page);

    try {
      // Navigate to billing page (will redirect to sign-in if not authenticated)
      await smokeNavigate(page, '/billing');

      // Wait for URL to stabilize (redirect may happen)
      await waitForUrlStable(
        page,
        url =>
          url.pathname.includes('/signin') ||
          url.pathname.includes('/signup') ||
          url.pathname.includes('/sign-in') ||
          url.pathname.includes('/sign-up') ||
          url.pathname.includes('/billing')
      );

      // Assert we're on a valid page (billing or auth redirect)
      const { isOnAuthPage } = await assertValidPageState(page, {
        expectedPaths: ['/billing'],
        allowAuthRedirect: true,
      });

      // In mock Clerk mode, redirect to sign-in is sufficient for smoke
      if (isOnAuthPage) {
        await expect(page.locator('body')).toBeVisible();
        return;
      }

      // Get context and check for critical errors
      const context = getContext();

      // Check for critical network failures
      const criticalFailures =
        context.networkDiagnostics.failedResponses.filter(
          isCriticalNetworkFailure
        );
      expect(
        criticalFailures.length,
        `Critical API failures: ${JSON.stringify(criticalFailures)}`
      ).toBe(0);

      await assertNoCriticalErrors(context, testInfo);
    } finally {
      cleanup();
    }
  });

  test('Account dashboard loads without errors @smoke', async ({
    page,
  }, testInfo) => {
    const { getContext, cleanup } = setupPageMonitoring(page);

    try {
      // Navigate to account page (will redirect to sign-in if not authenticated)
      await smokeNavigate(page, '/account');

      // Wait for URL to stabilize
      await waitForUrlStable(
        page,
        url =>
          url.pathname.includes('/signin') ||
          url.pathname.includes('/signup') ||
          url.pathname.includes('/sign-in') ||
          url.pathname.includes('/sign-up') ||
          url.pathname.includes('/account')
      );

      // Assert we're on a valid page
      const { isOnAuthPage } = await assertValidPageState(page, {
        expectedPaths: ['/account'],
        allowAuthRedirect: true,
      });

      // In mock Clerk mode, redirect to sign-in is sufficient
      if (isOnAuthPage) {
        await expect(page.locator('body')).toBeVisible();
        return;
      }

      const context = getContext();
      const criticalFailures =
        context.networkDiagnostics.failedResponses.filter(
          isCriticalNetworkFailure
        );
      expect(criticalFailures.length).toBe(0);

      await assertNoCriticalErrors(context, testInfo);
    } finally {
      cleanup();
    }
  });

  test('Billing success page loads without errors @smoke', async ({
    page,
  }, testInfo) => {
    const { getContext, cleanup } = setupPageMonitoring(page);

    try {
      await smokeNavigate(page, '/billing/success');

      await waitForUrlStable(
        page,
        url =>
          url.pathname.includes('/signin') ||
          url.pathname.includes('/signup') ||
          url.pathname.includes('/sign-in') ||
          url.pathname.includes('/sign-up') ||
          url.pathname.includes('/billing/success')
      );

      const { isOnAuthPage, isOnExpectedPath } = await assertValidPageState(
        page,
        {
          expectedPaths: ['/billing/success'],
          allowAuthRedirect: true,
        }
      );

      if (isOnAuthPage) {
        await expect(page.locator('body')).toBeVisible();
        return;
      }

      // If on success page, verify content loads
      if (isOnExpectedPath) {
        await page.waitForLoadState('domcontentloaded');
        const bodyText = await page.textContent('body');
        expect(bodyText).toBeTruthy();
        expect(
          bodyText?.length,
          'Page should have meaningful content'
        ).toBeGreaterThan(100);
      }

      const context = getContext();
      await assertNoCriticalErrors(context, testInfo);
    } finally {
      cleanup();
    }
  });

  test('Billing cancel page loads without errors @smoke', async ({
    page,
  }, testInfo) => {
    const { getContext, cleanup } = setupPageMonitoring(page);

    try {
      await smokeNavigate(page, '/billing/cancel');

      await waitForUrlStable(
        page,
        url =>
          url.pathname.includes('/signin') ||
          url.pathname.includes('/signup') ||
          url.pathname.includes('/sign-in') ||
          url.pathname.includes('/sign-up') ||
          url.pathname.includes('/billing/cancel')
      );

      const { isOnAuthPage, isOnExpectedPath } = await assertValidPageState(
        page,
        {
          expectedPaths: ['/billing/cancel'],
          allowAuthRedirect: true,
        }
      );

      if (isOnAuthPage) {
        await expect(page.locator('body')).toBeVisible();
        return;
      }

      // If on cancel page, verify content
      if (isOnExpectedPath) {
        const bodyText = await page.textContent('body');
        const hasCancelContent =
          bodyText !== null &&
          (bodyText.toLowerCase().includes('cancel') ||
            bodyText.toLowerCase().includes('dashboard') ||
            bodyText.toLowerCase().includes('worry'));
        expect(
          hasCancelContent,
          'Cancel page should have relevant content'
        ).toBe(true);
      }

      const context = getContext();
      await assertNoCriticalErrors(context, testInfo);
    } finally {
      cleanup();
    }
  });
});
