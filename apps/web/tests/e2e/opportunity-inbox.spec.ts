/**
 * E2E smoke: Opportunity Inbox home surface (JOV-3386).
 *
 * @smoke
 */

import { expect, test } from '@playwright/test';
import { APP_ROUTES } from '@/constants/routes';
import { setTestAuthBypassSession } from '../helpers/clerk-auth';
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
    await expect(page.getByText('Home — the inbox')).toBeVisible();

    const feed = page.getByTestId('opportunity-inbox-feed');
    const emptyState = page.getByTestId('opportunity-inbox-empty-state');
    await expect(feed.or(emptyState)).toBeVisible();
  });
});
