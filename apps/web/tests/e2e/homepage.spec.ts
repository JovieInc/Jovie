import { expect, test } from './setup';
import { SMOKE_TIMEOUTS, waitForHydration } from './utils/smoke-test-utils';

const isFastIteration = process.env.E2E_FAST_ITERATION === '1';

test.use({ storageState: { cookies: [], origins: [] } });
test.skip(
  isFastIteration,
  'Homepage coverage runs in the lighter smoke-public and content-gate fast lanes'
);

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

test.describe('Homepage', () => {
  test.beforeEach(async ({ page }) => {
    await interceptAnalytics(page);
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await waitForHydration(page);
  });

  test('renders the premium hero surface and refreshed intent composer', async ({
    page,
  }) => {
    await expect(page.getByTestId('homepage-hero-shell')).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Release more music with less work.' })
    ).toBeVisible();
    await expect(
      page.getByText(
        'Plan releases, create assets, pitch playlists, and promote every drop from one AI workspace.'
      )
    ).toBeVisible();
    await expect(page.getByPlaceholder('Ask Jovie...')).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Plan a release' })
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Analyze momentum' })
    ).toBeVisible();
  });

  test('header shows the live nav map and a single Sign in pill', async ({
    page,
  }) => {
    const header = page.getByTestId('header-nav');

    await expect(header).toBeVisible();
    await expect(header.getByRole('link', { name: 'Product' })).toHaveAttribute(
      'href',
      '/artist-profiles'
    );
    await expect(
      header.getByRole('link', { name: 'Solutions' })
    ).toHaveAttribute('href', '/artist-notifications');
    await expect(header.getByRole('link', { name: 'Pricing' })).toHaveAttribute(
      'href',
      '/pricing'
    );
    await expect(
      header.getByRole('link', { name: 'Resources' })
    ).toHaveAttribute('href', '/blog');
    await expect(page.getByRole('button', { name: 'Sign in' })).toHaveCount(1);
    await expect(page.getByRole('link', { name: 'Sign up' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Log in' })).toHaveCount(0);
  });

  test('trust strip ships live with the refreshed label and logos', async ({
    page,
  }) => {
    const trust = page.getByTestId('homepage-trust');

    await expect(trust).toBeVisible();
    await expect(trust).toHaveAttribute('data-presentation', 'inline-strip');
    await expect(page.getByText('Trusted by artists')).toBeVisible();
    await expect(page.getByLabel('Universal Music Group')).toBeVisible();
    await expect(page.getByLabel('AWAL')).toBeVisible();
    await expect(page.getByAltText('Black Hole Recordings')).toBeVisible();
    await expect(page.getByLabel('disco:wax')).toBeVisible();

    const top = await trust.evaluate(node => node.getBoundingClientRect().top);
    const viewportHeight = page.viewportSize()?.height ?? 0;
    expect(top).toBeLessThan(viewportHeight);
  });

  test('staged story sections ship live with aligned homepage copy', async ({
    page,
  }) => {
    await expect(page.getByTestId('homepage-v2-system-overview')).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'What Jovie Handles for You.' })
    ).toBeVisible();
    await expect(page.getByTestId('homepage-v2-spotlight')).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'One Link. Always In Sync.' })
    ).toBeVisible();
    await expect(
      page.getByTestId('homepage-v2-capture-reactivate')
    ).toBeVisible();
    await expect(
      page.getByRole('heading', {
        name: 'Build the List Once. Keep It Working.',
      })
    ).toBeVisible();
    await expect(page.getByTestId('homepage-v2-pricing')).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Simple Pricing.' })
    ).toBeVisible();
    await expect(page.getByTestId('homepage-v2-pricing-free')).toHaveCount(0);
    await expect(page.getByTestId('homepage-v2-pricing-pro')).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Start 14-Day Free Trial' })
    ).toBeVisible();
  });

  test('footer CTA ships live above the legal footer', async ({ page }) => {
    const finalCta = page.getByTestId('homepage-v2-final-cta');

    await finalCta.scrollIntoViewIfNeeded();
    await expect(finalCta).toBeVisible();
    await expect(page.getByTestId('homepage-v2-final-cta-heading')).toHaveText(
      'Start With the Next Drop.'
    );
    await expect(
      page.getByTestId('homepage-v2-final-cta-primary')
    ).toHaveAttribute('href', '/signup');
    await expect(
      page.getByTestId('homepage-v2-final-cta-secondary')
    ).toHaveAttribute('href', '/pricing');
  });

  test('desktop prompt rail chevrons move the pill row', async ({ page }) => {
    await page.setViewportSize({ width: 700, height: 740 });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await waitForHydration(page);

    const rail = page.getByTestId('homepage-pill-rail');
    const scrollRight = page.getByTestId('homepage-pill-scroll-right');

    await expect(scrollRight).toBeVisible();
    await expect(scrollRight).toBeEnabled();

    const before = await rail.evaluate(node => node.scrollLeft);
    await scrollRight.click();

    await expect
      .poll(async () => rail.evaluate(node => node.scrollLeft))
      .toBeGreaterThan(before);
  });

  test('mobile keeps the hero readable and avoids duplicate auth in the nav drawer', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await waitForHydration(page);

    await expect(
      page.getByRole('heading', { name: 'Release more music with less work.' })
    ).toBeVisible({
      timeout: SMOKE_TIMEOUTS.VISIBILITY,
    });
    await expect(page.getByPlaceholder('Ask Jovie...')).toBeVisible({
      timeout: SMOKE_TIMEOUTS.VISIBILITY,
    });
    await expect(page.getByRole('button', { name: 'Sign in' })).toHaveCount(1);
    await expect(page.getByTestId('homepage-trust')).toBeVisible({
      timeout: SMOKE_TIMEOUTS.VISIBILITY,
    });

    await page.waitForTimeout(750);
    await page.evaluate(() => {
      const closeDevTools = document.querySelector<HTMLButtonElement>(
        'button[aria-label="Close Next.js Dev Tools"]'
      );
      closeDevTools?.click();
    });

    const openMenu = page.getByRole('button', { name: 'Open menu' });
    await openMenu.dispatchEvent('click');
    await expect(
      page.getByRole('button', { name: 'Close menu' })
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Product', exact: true })
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Solutions', exact: true })
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Pricing', exact: true })
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Resources', exact: true })
    ).toBeVisible();
    await expect(page.getByRole('link', { name: 'Log in' })).toHaveCount(0);
  });

  test('has no horizontal overflow across common viewports', async ({
    page,
  }) => {
    for (const viewport of [
      { width: 390, height: 844 },
      { width: 430, height: 932 },
      { width: 768, height: 1024 },
      { width: 1024, height: 768 },
      { width: 1280, height: 800 },
      { width: 1440, height: 900 },
      { width: 1512, height: 982 },
    ]) {
      await page.setViewportSize(viewport);
      await page.goto('/', { waitUntil: 'domcontentloaded' });
      await waitForHydration(page);

      const overflow = await page.evaluate(() => {
        return (
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth
        );
      });

      expect(overflow).toBeLessThanOrEqual(1);
    }
  });

  test('loads without critical console errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await waitForHydration(page);

    expect(errors).toEqual([]);
  });
});
