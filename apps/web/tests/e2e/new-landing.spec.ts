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

    const headerNav = page.getByTestId('header-nav');

    await expect(page.getByTestId('homepage-v2-shell')).toBeVisible();
    await expect(
      headerNav.getByRole('button', { name: 'Features', exact: true })
    ).toBeVisible();
    await expect(
      headerNav.getByRole('button', { name: 'Resources', exact: true })
    ).toBeVisible();
    await expect(
      headerNav.getByRole('link', { name: 'Pricing', exact: true })
    ).toHaveAttribute('href', APP_ROUTES.PRICING);
    await expect(page.getByTestId('homepage-v2-hero')).toBeVisible();
    await expect(
      page.getByTestId('homepage-v2-hero-primary-cta')
    ).toBeVisible();

    await expect(
      page.getByRole('heading', { name: /your ai artist manager/i })
    ).toBeVisible();
    await expect(
      page.getByText(/plan releases, create assets, draft pitches/i)
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
        name: 'What Jovie Handles for You.',
      })
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'One Link. Always In Sync.' })
    ).toBeVisible();
    await expect(
      page.getByRole('heading', {
        name: 'Build the List Once. Keep It Working.',
      })
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Open menu' })).toHaveCount(
      0
    );

    await expect(
      page.getByRole('link', { name: 'Explore Artist Profiles' })
    ).toHaveAttribute('href', APP_ROUTES.ARTIST_PROFILES);
    await expect(page.locator('body')).not.toContainText('Page not found');

    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      'content',
      /noindex, nofollow/
    );
  });

  test('navigates hero CTA to signup', async ({ page }) => {
    await gotoLanding(page);

    await expect(
      page.getByTestId('homepage-v2-hero-primary-cta')
    ).toHaveAttribute('href', APP_ROUTES.SIGNUP);
  });

  test('routes deep links to artist profiles anchors', async ({ page }) => {
    await gotoLanding(page);
    await expect(
      page.getByRole('link', { name: 'Explore Artist Profiles' })
    ).toHaveAttribute('href', APP_ROUTES.ARTIST_PROFILES);
  });

  test('shows canonical pricing teaser and no live link for release pages', async ({
    page,
  }) => {
    await gotoLanding(page);

    await expect(page.getByTestId('marketing-pricing-plan-free')).toContainText(
      'Free'
    );
    await expect(page.getByTestId('marketing-pricing-plan-free')).toContainText(
      '$0'
    );
    await expect(page.getByTestId('marketing-pricing-plan-pro')).toContainText(
      'Pro'
    );
    await expect(page.getByTestId('marketing-pricing-plan-pro')).toContainText(
      '$39'
    );
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
