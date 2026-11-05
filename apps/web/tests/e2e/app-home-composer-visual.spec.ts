/**
 * Visual smoke: Home opens on the chat composer, not the inbox empty state.
 *
 * @smoke
 */

import { expect, test } from '@playwright/test';
import { APP_ROUTES } from '@/constants/routes';
import { setTestAuthBypassSession } from '../helpers/auth';
import { smokeNavigateWithRetry } from './utils/smoke-test-utils';

test.use({ storageState: { cookies: [], origins: [] } });

test.describe('App Home composer (visual)', () => {
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
  ]) {
    test(`home shows the composer at ${viewport.width}px`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await setTestAuthBypassSession(page, 'creator-ready');
      await smokeNavigateWithRetry(page, APP_ROUTES.DASHBOARD, {
        waitUntil: 'domcontentloaded',
      });
      await expect(
        page.locator('textarea[data-testid="chat-input"]')
      ).toBeVisible({ timeout: 30_000 });
      await expect(page.getByTestId('opportunity-inbox-page')).toHaveCount(0);
      const overflow = await page.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth
      );
      expect(overflow).toBeLessThanOrEqual(0);
    });
  }
});
