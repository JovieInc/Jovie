/**
 * E2E smoke: Opportunity Inbox home surface (JOV-3386).
 *
 * @smoke
 */

import { expect, test } from '@playwright/test';
import { APP_ROUTES } from '@/constants/routes';
import { setTestAuthBypassSession } from '../helpers/clerk-auth';
import { installAppFlagOverrides } from './helpers/app-flag-overrides';
import { smokeNavigateWithRetry } from './utils/smoke-test-utils';

test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Opportunity Inbox', () => {
  test('authenticated home renders the inbox surface', async ({ page }) => {
    await setTestAuthBypassSession(page, 'creator-ready');
    await smokeNavigateWithRetry(page, APP_ROUTES.DASHBOARD, {
      waitUntil: 'domcontentloaded',
    });

    await expect(page.getByTestId('opportunity-inbox-page')).toBeVisible({
      timeout: 30_000,
    });
    await expect(
      page.getByRole('heading', { name: 'Inbox', exact: true })
    ).toBeVisible();

    const feed = page.getByTestId('opportunity-inbox-feed');
    const emptyState = page.getByTestId('opportunity-inbox-empty-state');
    await expect(feed.or(emptyState)).toBeVisible();
  });

  test('customer home keeps founder review out of the shell and API', async ({
    page,
  }) => {
    await installAppFlagOverrides(page, { INBOX_HOME: true });
    await setTestAuthBypassSession(page, 'creator-ready');
    await smokeNavigateWithRetry(page, APP_ROUTES.DASHBOARD, {
      waitUntil: 'domcontentloaded',
    });

    await expect(
      page.getByRole('heading', { name: 'Your Inbox Is Clear' })
    ).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Start A Brain Dump')).not.toBeVisible();
    await expect(page.getByText('Founder Review')).not.toBeVisible();

    const founderReviews = await page.request.get(
      new URL('/api/inbox/founder-reviews', page.url()).toString()
    );
    expect(founderReviews.status()).toBe(403);

    const screenshotPath = process.env.FOUNDER_REVIEW_QA_SCREENSHOT;
    if (screenshotPath) {
      await page.screenshot({ path: screenshotPath, fullPage: true });
    }
  });
});
