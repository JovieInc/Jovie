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

async function expectNoHorizontalOverflow(
  page: import('@playwright/test').Page
) {
  const metrics = await page.evaluate(() => ({
    innerWidth: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));

  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.innerWidth + 1);
}

test.describe('Artist Notifications Landing', () => {
  test.beforeEach(async ({ page }) => {
    await interceptAnalytics(page);
    await page.goto('/artist-notifications', { waitUntil: 'domcontentloaded' });
    await waitForHydration(page);
  });

  test('hero renders with the new promise and Pro CTA', async ({ page }) => {
    await expect(
      page.getByRole('heading', {
        name: /reach every fan\.\s*automatically\./i,
      })
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: /start pro trial/i }).first()
    ).toBeVisible();
  });

  test('shared sections render with notifications-specific copy', async ({
    page,
  }) => {
    await expect(page.getByTestId('homepage-trust')).toBeVisible();
    await expect(page.getByText('Trusted by artists on')).toBeVisible();
    await expect(
      page.getByRole('heading', { name: /capture every fan\./i })
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: /notify them automatically\./i })
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: /bring fans back when it matters\./i })
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: /new music first/i })
    ).toBeVisible();
    await expect(
      page.getByText('How does Jovie bring fans back?')
    ).toBeVisible();
    await expect(page.getByTestId('final-cta-headline')).toBeVisible();
    await expect(
      page.getByRole('heading', { name: /ready to amplify\?/i })
    ).toBeVisible();
    await expect(page.getByTestId('final-cta-action')).toHaveAttribute(
      'href',
      '/signup?plan=pro'
    );
    await expect(page.getByText('Owned audience')).toHaveCount(0);
    await expect(page.getByText('Automatic reactivation')).toHaveCount(0);
    await expect(page.getByText('Fan outcomes')).toHaveCount(0);
    await expect(page.getByText('Power features')).toHaveCount(0);
  });

  test('stays intact on mobile without horizontal overflow', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 });

    await expect(
      page.getByRole('heading', {
        name: /reach every fan\.\s*automatically\./i,
      })
    ).toBeVisible({
      timeout: SMOKE_TIMEOUTS.VISIBILITY,
    });

    await expectNoHorizontalOverflow(page);

    await page.getByTestId('final-cta-action').scrollIntoViewIfNeeded();
    await expect(page.getByTestId('final-cta-action')).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });
});
