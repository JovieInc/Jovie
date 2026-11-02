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

  test('hero renders with the new promise and claim CTA', async ({ page }) => {
    // One door (EVENT 2026-10-20): every marketing CTA claims a page and the
    // trial is in-app only, so the hero sells the claim entry, not a trial.
    const hero = page.getByTestId('artist-notifications-section-hero');
    await expect(
      hero.getByRole('heading', {
        name: /reach listeners\.\s*on autopilot\./i,
      })
    ).toBeVisible();
    await expect(
      hero.getByRole('link', { name: 'Claim your page' })
    ).toHaveAttribute('href', '/start');
  });

  test('shared sections render with notifications-specific copy', async ({
    page,
  }) => {
    await expect(page.getByTestId('homepage-trust')).toHaveCount(0);
    await expect(
      page.getByText('Trusted by artists and teams releasing on')
    ).toHaveCount(0);
    await expect(
      page.getByRole('heading', { name: /capture every listener\./i })
    ).toBeVisible();
    await expect(
      page.getByRole('heading', {
        name: /notify listeners for you\./i,
      })
    ).toBeVisible();
    await expect(
      page.getByRole('heading', {
        name: /bring listeners back when it matters\./i,
      })
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: /new music first/i })
    ).toBeVisible();
    await expect(
      page.getByText('How does Jovie bring listeners back?')
    ).toBeVisible();
    await expect(page.getByTestId('final-cta-headline')).toBeVisible();
    await expect(
      page.getByRole('heading', { name: /ready to reach your audience\?/i })
    ).toBeVisible();
    await expect(page.getByTestId('final-cta-action')).toHaveAttribute(
      'href',
      '/start'
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
        name: /reach listeners\.\s*on autopilot\./i,
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
