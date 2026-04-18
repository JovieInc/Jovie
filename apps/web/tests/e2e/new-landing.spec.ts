import { APP_ROUTES } from '@/constants/routes';
import { expect, test } from './setup';

test.use({ storageState: { cookies: [], origins: [] } });

async function gotoLanding(page: import('@playwright/test').Page) {
  await page.goto(APP_ROUTES.LANDING_NEW, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('domcontentloaded');
  await page.getByTestId('homepage-v2-hero').waitFor({ state: 'visible' });
}

async function blockAnalytics(page: import('@playwright/test').Page) {
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

test.describe('/new landing page', () => {
  test.beforeEach(async ({ page }) => {
    await blockAnalytics(page);
  });

  test('renders the staged homepage v2 sections and product nav', async ({
    page,
  }) => {
    await gotoLanding(page);

    await expect(page.getByTestId('homepage-v2-shell')).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Artist Profiles', exact: true })
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Pricing', exact: true })
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Support', exact: true })
    ).toBeVisible();
    await expect(page.getByTestId('homepage-v2-hero')).toBeVisible();
    await expect(
      page.getByTestId('homepage-v2-hero-primary-cta')
    ).toBeVisible();

    await expect(
      page.getByRole('heading', { name: /make every release feel bigger/i })
    ).toBeVisible();
    await expect(
      page.getByText(
        /artist profiles, smart links, fan capture, and reactivation/i
      )
    ).toBeVisible();

    await expect(page.getByTestId('homepage-v2-system-overview')).toBeVisible();
    await expect(page.getByTestId('homepage-v2-spotlight')).toBeVisible();
    await expect(
      page.getByTestId('homepage-v2-capture-reactivate')
    ).toBeVisible();
    await expect(page.getByTestId('homepage-v2-power-grid')).toBeVisible();
    await expect(page.getByTestId('homepage-v2-pricing')).toBeVisible();

    await expect(
      page.getByRole('heading', {
        name: 'One system for the whole release cycle.',
      })
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Artist profiles built to convert.' })
    ).toBeVisible();
    await expect(
      page.getByRole('heading', {
        name: 'Capture every fan. Send them every release automatically.',
      })
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Open menu' })).toHaveCount(
      0
    );

    await expect(
      page.getByTestId('homepage-v2-release-pages-preview')
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'See Artist Profiles' })
    ).toHaveAttribute('href', APP_ROUTES.ARTIST_PROFILES);
    await expect(
      page.getByRole('link', { name: 'See audience features' })
    ).toHaveAttribute(
      'href',
      `${APP_ROUTES.ARTIST_PROFILES}#capture-every-fan`
    );
    await expect(page.locator('body')).not.toContainText('Page not found');

    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      'content',
      /noindex, nofollow/
    );
  });

  test('navigates hero CTA to signup', async ({ page }) => {
    await gotoLanding(page);

    await page.getByTestId('homepage-v2-hero-primary-cta').click();

    await expect(page).toHaveURL(/\/signup$/);
  });

  test('routes deep links to artist profiles anchors', async ({ page }) => {
    await gotoLanding(page);
    await page.getByRole('link', { name: 'See audience features' }).click();
    await expect(page).toHaveURL(/\/artist-profiles#capture-every-fan$/);
  });

  test('shows canonical pricing teaser and no live link for release pages', async ({
    page,
  }) => {
    await gotoLanding(page);

    await expect(page.getByTestId('homepage-v2-pricing-free')).toContainText(
      'Free'
    );
    await expect(page.getByTestId('homepage-v2-pricing-free')).toContainText(
      '$0'
    );
    await expect(page.getByTestId('homepage-v2-pricing-pro')).toContainText(
      'Pro'
    );
    await expect(page.getByTestId('homepage-v2-pricing-pro')).toContainText(
      '$39/mo'
    );
    await expect(
      page.getByTestId('homepage-v2-release-pages-preview')
    ).toContainText('Preview');
    await expect(page.getByRole('link', { name: 'Release Pages' })).toHaveCount(
      0
    );
  });

  test('keeps the hero and pricing visible on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await gotoLanding(page);

    await expect(page.getByTestId('homepage-v2-shell')).toBeVisible();
    await expect(
      page.getByTestId('homepage-v2-hero-primary-cta')
    ).toBeVisible();
    await expect(page.getByTestId('homepage-v2-pricing')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Open menu' })).toBeVisible();
  });
});
