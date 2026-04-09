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
        name: /the artist page your music deserves/i,
      })
    ).toBeVisible();
    await expect(page.getByTestId('artist-profiles-hero-cta')).toBeVisible();
    await expect(page.getByTestId('artist-profiles-hero-media')).toBeVisible();
    await expect(
      page.getByText(/one clean destination for every release/i)
    ).toBeVisible();
    await expect(page.getByText('Own Your Audience')).toBeVisible();
    await expect(page.getByText('One Link')).toBeVisible();
    await expect(page.getByText('Switch Modes')).toBeVisible();
  });

  test('hero stays intact on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });

    await expect(
      page.getByRole('heading', { name: /the artist page/i })
    ).toBeVisible({
      timeout: SMOKE_TIMEOUTS.VISIBILITY,
    });
    await expect(page.getByTestId('artist-profiles-hero-cta')).toBeVisible({
      timeout: SMOKE_TIMEOUTS.VISIBILITY,
    });
    await expect(
      page.getByTestId('artist-profiles-hero-screenshot')
    ).toBeVisible({
      timeout: SMOKE_TIMEOUTS.VISIBILITY,
    });
  });
});
