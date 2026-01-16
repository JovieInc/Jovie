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
 * Billing Route Tests
 *
 * These tests verify billing-related routes load correctly.
 * Moved from smoke-auth.spec.ts to run only in full E2E suite (not smoke).
 *
 * Rationale: Billing routes are important but not critical for PR feedback.
 * They add ~30-60s to smoke tests without catching critical regressions.
 */
test.describe('Billing Routes', () => {
  test('/billing redirects or loads without errors', async ({
    page,
  }, testInfo) => {
    const { getContext, cleanup } = setupPageMonitoring(page);

    try {
      await smokeNavigate(page, '/billing');

      await waitForUrlStable(
        page,
        url =>
          url.pathname.includes('/signin') ||
          url.pathname.includes('/signup') ||
          url.pathname.includes('/billing')
      );

      const { isOnAuthPage } = await assertValidPageState(page, {
        expectedPaths: ['/billing'],
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
      expect(
        criticalFailures.length,
        `Critical API failures: ${JSON.stringify(criticalFailures)}`
      ).toBe(0);

      await assertNoCriticalErrors(context, testInfo);
    } finally {
      cleanup();
    }
  });

  test('/account redirects or loads without errors', async ({
    page,
  }, testInfo) => {
    const { getContext, cleanup } = setupPageMonitoring(page);

    try {
      await smokeNavigate(page, '/account');

      await waitForUrlStable(
        page,
        url =>
          url.pathname.includes('/signin') ||
          url.pathname.includes('/signup') ||
          url.pathname.includes('/account')
      );

      const { isOnAuthPage } = await assertValidPageState(page, {
        expectedPaths: ['/account'],
        allowAuthRedirect: true,
      });

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

  test('/billing/success redirects or loads without errors', async ({
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

  test('/billing/cancel redirects or loads without errors', async ({
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
