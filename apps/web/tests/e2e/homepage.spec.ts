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
      page.getByRole('heading', { name: 'Your AI Artist Manager.' })
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
    await expect(page.getByRole('link', { name: 'Product' })).toHaveAttribute(
      'href',
      '/artist-profiles'
    );
    await expect(page.getByRole('link', { name: 'Solutions' })).toHaveAttribute(
      'href',
      '/artist-notifications'
    );
    await expect(page.getByRole('link', { name: 'Pricing' })).toHaveAttribute(
      'href',
      '/pricing'
    );
    await expect(page.getByRole('link', { name: 'Resources' })).toHaveAttribute(
      'href',
      '/blog'
    );
    await expect(page.getByRole('button', { name: 'Sign in' })).toHaveCount(1);
    await expect(page.getByRole('link', { name: 'Sign up' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Log in' })).toHaveCount(0);
  });

  test('trust strip ships live with the refreshed label and logos', async ({
    page,
  }) => {
    await expect(page.getByTestId('homepage-trust')).toBeVisible();
    await expect(page.getByText('Trusted by artists')).toBeVisible();
    await expect(page.getByLabel('Universal Music Group')).toBeVisible();
    await expect(page.getByLabel('AWAL')).toBeVisible();
    await expect(page.getByAltText('Black Hole Recordings')).toBeVisible();
    await expect(page.getByLabel('disco:wax')).toBeVisible();
  });

  test('mobile keeps the hero readable and avoids duplicate auth in the nav drawer', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await waitForHydration(page);

    await expect(
      page.getByRole('heading', { name: 'Your AI Artist Manager.' })
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
    await expect(page.getByRole('link', { name: 'Product' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Solutions' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Pricing' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Resources' })).toBeVisible();
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
