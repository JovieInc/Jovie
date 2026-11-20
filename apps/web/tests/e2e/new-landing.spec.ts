import { APP_ROUTES } from '@/constants/routes';
import {
  HOMEPAGE_EDITORIAL_COPY as COPY,
  HOMEPAGE_INVITE_ANCHOR,
} from '@/data/homepageEditorialCopy';
import { getClaimProfileIntent } from '@/data/marketingCtaIntents';
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
      hero.getByRole('heading', { level: 1, name: COPY.hero.headline })
    ).toBeVisible();
    await expect(
      headerNav.getByRole('link', { name: 'Product', exact: true })
    ).toHaveAttribute('href', APP_ROUTES.PRODUCT);
    await expect(
      headerNav.getByRole('link', { name: 'Pricing', exact: true })
    ).toHaveAttribute('href', APP_ROUTES.PRICING);
    await expect(page.locator('body')).not.toContainText('Page not found');
  });

  test('uses the claim action as the primary action', async ({ page }) => {
    await gotoLegacyNewLanding(page);

    const claim = getClaimProfileIntent();
    const cta = page.getByTestId('homepage-primary-cta');
    await expect(cta).toBeVisible();
    await expect(cta).toHaveText(claim.label);
    await expect(cta).toHaveAttribute('href', claim.href);
  });

  test('mounts the homepage sections after the redirect', async ({ page }) => {
    await gotoLegacyNewLanding(page);

    const headings = await page
      .locator('main h1:visible, main h2:visible')
      .evaluateAll(nodes => nodes.map(node => node.textContent?.trim()));
    expect(headings.filter(Boolean)[0]).toBe(COPY.hero.headline);
    await expect(
      page
        .locator(`#${HOMEPAGE_INVITE_ANCHOR}`)
        .getByTestId('homepage-close-cta')
    ).toBeAttached();
  });

  test('keeps the editorial hero on the redirected homepage', async ({
    page,
  }) => {
    await gotoLegacyNewLanding(page);

    const hero = page.getByTestId('marketing-section-hero');
    await expect(
      hero.getByRole('heading', { level: 1, name: COPY.hero.headline })
    ).toBeVisible();
    await expect(hero.getByText(/Tim White|Founder, Jovie/)).toHaveCount(0);
    await expect(page.getByPlaceholder('Search your name')).toHaveCount(0);
    await expect(page.getByTestId('homepage-v2-pricing')).toHaveCount(0);
    await expect(page.getByTestId('homepage-v2-hero')).toHaveCount(0);
  });

  test('keeps the hero and claim action visible on mobile', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await gotoLegacyNewLanding(page);

    await expect(page.getByTestId('marketing-section-hero')).toBeVisible();
    await expect(page.getByTestId('homepage-primary-cta')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Open menu' })).toBeVisible();
  });
});
