import { APP_ROUTES } from '@/constants/routes';
import { HOMEPAGE_IDENTITY_COPY } from '@/data/homepageIdentityCopy';
import { expect, test } from './setup';

test.use({ storageState: { cookies: [], origins: [] } });

async function gotoLegacyNewLanding(page: import('@playwright/test').Page) {
  const response = await page.goto(APP_ROUTES.LANDING_NEW, {
    waitUntil: 'domcontentloaded',
  });
  await page.waitForLoadState('domcontentloaded');
  return response;
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

  test('redirects to the live homepage and keeps product nav', async ({
    page,
  }) => {
    const response = await gotoLegacyNewLanding(page);

    expect(new URL(page.url()).pathname).toBe(APP_ROUTES.HOME);
    expect(response?.request().redirectedFrom()).toBeTruthy();

    const headerNav = page.getByTestId('header-nav');
    const hero = page.getByTestId('marketing-section-hero');

    await expect(hero).toBeVisible();
    await expect(
      hero.getByRole('heading', {
        level: 1,
        name: /Be found\.\s*Be understood\./,
      })
    ).toBeVisible();
    await expect(
      headerNav.getByRole('link', { name: 'Product', exact: true })
    ).toHaveAttribute('href', APP_ROUTES.PRODUCT);
    await expect(
      headerNav.getByRole('link', { name: 'Pricing', exact: true })
    ).toHaveAttribute('href', APP_ROUTES.PRICING);
    await expect(page.locator('body')).not.toContainText('Page not found');
  });

  test('uses the claim form as the primary action', async ({ page }) => {
    await gotoLegacyNewLanding(page);

    const cta = page.getByTestId('homepage-primary-cta');
    await expect(cta).toBeVisible();
    await expect(cta).toHaveText(HOMEPAGE_IDENTITY_COPY.hero.claim.action);
    await expect(page.getByTestId('homepage-claim-form')).toHaveAttribute(
      'action',
      '/start'
    );
  });

  test('mounts the identity homepage sections after the redirect', async ({
    page,
  }) => {
    await gotoLegacyNewLanding(page);

    const headings = await page
      .locator('main h1:visible, main h2:visible')
      .evaluateAll(nodes => nodes.map(node => node.textContent?.trim()));
    expect(headings.filter(Boolean)).toEqual([
      'Be found.Be understood.',
      'Your presence, resolved.',
      'Structure that travels.',
      'Make it your Jovie profile.',
    ]);
    await expect(page.getByTestId('homepage-close-claim-cta')).toHaveText(
      'Claim'
    );
  });

  test('keeps the claim card identity on the redirected homepage', async ({
    page,
  }) => {
    await gotoLegacyNewLanding(page);

    // JOV-7750 (#22180): the card shows the visitor's jov.ie/you identity.
    const identity = page
      .getByTestId('marketing-section-hero')
      .getByTestId('homepage-hero-identity');
    const { preview, claim } = HOMEPAGE_IDENTITY_COPY.hero;
    await expect(
      identity.getByText(preview.label, { exact: true })
    ).toBeVisible();
    await expect(identity).toContainText(`${claim.domain}${preview.name}`);
    await expect(page.getByTestId('homepage-v2-pricing')).toHaveCount(0);
    await expect(page.getByTestId('homepage-v2-hero')).toHaveCount(0);
  });

  test('keeps the hero and claim visible on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await gotoLegacyNewLanding(page);

    await expect(page.getByTestId('marketing-section-hero')).toBeVisible();
    await expect(page.getByTestId('homepage-primary-cta')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Open menu' })).toBeVisible();
  });
});
