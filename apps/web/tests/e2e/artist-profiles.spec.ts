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

  test('hero renders with shared marketing layout and profile proof', async ({
    page,
  }) => {
    await expect(
      page.getByRole('heading', {
        name: /a profile that looks like you meant it/i,
      })
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: /get started free/i })
    ).toBeVisible();
    await expect(
      page.getByTestId('artist-profiles-hero-surface')
    ).toBeVisible();
    await expect(
      page.getByText(/give every fan one clean destination/i)
    ).toBeVisible();
    await expect(page.getByText('Own every contact')).toBeVisible();
    await expect(page.getByText('Show the right release first')).toBeVisible();
    await expect(page.getByText('One link for every fan action')).toBeVisible();
  });

  test('hero stays intact on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });

    await expect(
      page.getByRole('heading', {
        name: /a profile that looks like you meant it/i,
      })
    ).toBeVisible({
      timeout: SMOKE_TIMEOUTS.VISIBILITY,
    });
    await expect(
      page.getByRole('link', { name: /get started free/i })
    ).toBeVisible({
      timeout: SMOKE_TIMEOUTS.VISIBILITY,
    });
    await expect(page.getByTestId('artist-profiles-hero-surface')).toBeVisible({
      timeout: SMOKE_TIMEOUTS.VISIBILITY,
    });
  });
});
