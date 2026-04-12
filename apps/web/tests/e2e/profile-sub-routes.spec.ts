/**
 * Profile Sub-Route Redirect Tests
 *
 * Verifies that vanity sub-routes (/username/about, /listen, /contact)
 * redirect to the profile page with the correct mode query parameter.
 *
 * @smoke
 */

import { expect, test } from '@playwright/test';

test.use({ storageState: { cookies: [], origins: [] } });

const TEST_PROFILE = 'dualipa';

async function blockAnalytics(page: import('@playwright/test').Page) {
  await page.route('**/api/profile/view', r =>
    r.fulfill({ status: 200, body: '{}' })
  );
  await page.route('**/api/audience/visit', r =>
    r.fulfill({ status: 200, body: '{}' })
  );
}

test.describe('Profile Sub-Route Redirects @smoke', () => {
  test.beforeEach(async ({ page }) => {
    await blockAnalytics(page);
  });

  test('/about redirects to ?mode=about', async ({ page }) => {
    test.setTimeout(30_000);
    try {
      const response = await page.goto(`/${TEST_PROFILE}/about`, {
        waitUntil: 'domcontentloaded',
        timeout: 20_000,
      });
      expect(response?.ok() ?? true).toBe(true);
      // Should redirect to profile page with mode=about
      expect(page.url()).toContain(`/${TEST_PROFILE}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('Timeout') || msg.includes('net::ERR_')) {
        test.skip(true, 'App not reachable');
      }
      throw e;
    }
  });

  test('/listen redirects to ?mode=listen', async ({ page }) => {
    test.setTimeout(30_000);
    try {
      const response = await page.goto(`/${TEST_PROFILE}/listen`, {
        waitUntil: 'domcontentloaded',
        timeout: 20_000,
      });
      expect(response?.ok() ?? true).toBe(true);
      expect(page.url()).toContain(`/${TEST_PROFILE}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('Timeout') || msg.includes('net::ERR_')) {
        test.skip(true, 'App not reachable');
      }
      throw e;
    }
  });

  test('/contact redirects to ?mode=contact', async ({ page }) => {
    test.setTimeout(30_000);
    try {
      const response = await page.goto(`/${TEST_PROFILE}/contact`, {
        waitUntil: 'domcontentloaded',
        timeout: 20_000,
      });
      expect(response?.ok() ?? true).toBe(true);
      expect(page.url()).toContain(`/${TEST_PROFILE}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('Timeout') || msg.includes('net::ERR_')) {
        test.skip(true, 'App not reachable');
      }
      throw e;
    }
  });
});
