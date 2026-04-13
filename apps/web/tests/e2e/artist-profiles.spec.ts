import { expect, test } from './setup';
import { SMOKE_TIMEOUTS, waitForHydration } from './utils/smoke-test-utils';

test.use({ storageState: { cookies: [], origins: [] } });

async function interceptAnalytics(page: import('@playwright/test').Page) {
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

test.describe('Artist Profiles Landing', () => {
  test.beforeEach(async ({ page }) => {
    await interceptAnalytics(page);
    await page.goto('/artist-profiles', { waitUntil: 'domcontentloaded' });
    await waitForHydration(page);
  });

  test('hero renders with headline and CTAs', async ({ page }) => {
    await expect(
      page.getByRole('heading', {
        name: /one link\. every release\./i,
      })
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: /claim your profile/i })
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: /see a live example/i })
    ).toBeVisible();
  });

  test('final CTA renders with claim form', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: /claim your profile now/i })
    ).toBeVisible();
  });

  test('hero stays intact on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });

    await expect(
      page.getByRole('heading', {
        name: /one link\. every release\./i,
      })
    ).toBeVisible({
      timeout: SMOKE_TIMEOUTS.VISIBILITY,
    });
    await expect(
      page.getByRole('link', { name: /claim your profile/i })
    ).toBeVisible({
      timeout: SMOKE_TIMEOUTS.VISIBILITY,
    });
  });
});
