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

  test('renders the static Frame-style hero and CTAs', async ({ page }) => {
    const hero = page.getByTestId('homepage-hero-shell');

    await expect(hero).toBeVisible();
    await expect(hero.getByText('Meet Jovie')).toBeVisible();
    await expect(
      hero.getByRole('heading', { name: 'Drop more music, with less work.' })
    ).toBeVisible();
    await expect(
      hero.getByText(
        'Release music faster and grow your audience effortlessly.'
      )
    ).toBeVisible();
    await expect(
      hero.getByRole('link', { name: 'Start Free Trial', exact: true })
    ).toHaveAttribute('href', '/signup');
    await expect(
      hero.getByRole('link', { name: 'Explore Profiles', exact: true })
    ).toHaveAttribute('href', '/artist-profiles');
    await expect(hero.getByPlaceholder('Ask Jovie...')).toHaveCount(0);
  });

  test('header uses compact homepage presentation and signup CTA', async ({
    page,
  }) => {
    const header = page.getByTestId('header-nav');

    await expect(header).toBeVisible();
    await expect(header).toHaveAttribute(
      'data-presentation',
      'homepage-embedded'
    );
    await expect(header.locator('[data-testid="site-logo"]')).toHaveCount(1);
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
    await expect(header.getByRole('link', { name: 'Log in' })).toHaveCount(1);
    await expect(
      header.getByRole('link', { name: 'Start Free Trial' })
    ).toHaveAttribute('href', '/signup');
  });

  test('product carousel exposes desktop and mobile proof slides', async ({
    page,
  }) => {
    const carousel = page.getByTestId('homepage-hero-carousel');

    await expect(carousel).toBeVisible();
    await expect(
      page.getByTestId('homepage-hero-shot-profile-presence')
    ).toHaveAttribute('data-active', 'true');
    await page.getByRole('button', { name: 'Go to next slide' }).click();
    await expect(
      page.getByTestId('homepage-hero-shot-release-command')
    ).toHaveAttribute('data-active', 'true');
    await page.getByRole('tab', { name: 'Show Audience Signal' }).click();
    await expect(
      page.getByTestId('homepage-hero-shot-release-signal')
    ).toHaveAttribute('data-active', 'true');
  });

  test('trust, workflow, Friday, profile proof, pricing, FAQ, and final CTA render', async ({
    page,
  }) => {
    await expect(page.getByTestId('homepage-trust')).toHaveAttribute(
      'data-presentation',
      'inline-strip'
    );
    await expect(
      page.getByRole('heading', {
        name: 'Connect, preview, and publish from one release workspace.',
      })
    ).toBeVisible();
    await expect(page.getByTestId('homepage-product-depth-band')).toBeVisible();
    await expect(
      page.getByRole('heading', {
        name: 'Plan the release around the page fans will actually see.',
      })
    ).toBeVisible();
    await expect(page.getByTestId('friday-rhythm-section')).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Make Every Friday Count' })
    ).toBeVisible();
    await expect(page.getByTestId('homepage-profile-proof-band')).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Artist profiles built to convert.' })
    ).toBeVisible();
    await expect(page.getByTestId('homepage-v2-pricing')).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Simple Pricing.' })
    ).toBeVisible();
    await expect(page.getByTestId('homepage-v2-pricing-free')).toHaveCount(0);
    await expect(page.getByTestId('homepage-v2-pricing-pro')).toBeVisible();
    await expect(page.getByTestId('homepage-faq')).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Questions Artists Ask Before Launch' })
    ).toBeVisible();

    const finalCta = page.getByTestId('homepage-v2-final-cta');
    await finalCta.scrollIntoViewIfNeeded();
    await expect(finalCta).toBeVisible();
    await expect(page.getByTestId('homepage-v2-final-cta-heading')).toHaveText(
      'Keep Your Music Moving.'
    );
    await expect(
      page.getByTestId('homepage-v2-final-cta-primary')
    ).toHaveAttribute('href', '/signup');
    await expect(
      page.getByTestId('homepage-v2-final-cta-secondary')
    ).toHaveCount(0);
  });

  test('mobile keeps hero and carousel inside the viewport and uses signup in drawer', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await waitForHydration(page);

    await expect(
      page.getByRole('heading', { name: 'Drop more music, with less work.' })
    ).toBeVisible({
      timeout: SMOKE_TIMEOUTS.VISIBILITY,
    });
    await expect(page.getByRole('link', { name: 'Log in' })).toHaveCount(1);

    const activeHeroShot = page
      .locator('.homepage-hero-slide[data-active="true"]')
      .first();
    const heroShotBounds = await activeHeroShot.boundingBox();
    const viewportWidth = page.viewportSize()?.width ?? 0;

    expect(heroShotBounds?.x ?? -1).toBeGreaterThanOrEqual(0);
    expect(
      (heroShotBounds?.x ?? 0) + (heroShotBounds?.width ?? 0)
    ).toBeLessThanOrEqual(viewportWidth + 1);

    await page.evaluate(() => {
      const closeDevTools = document.querySelector<HTMLButtonElement>(
        'button[aria-label="Close Next.js Dev Tools"]'
      );
      closeDevTools?.click();
    });

    const openMenu = page.getByRole('button', { name: 'Open menu' });
    await openMenu.click();
    const mobilePanel = page.locator('#mobile-nav-panel');

    await expect(mobilePanel).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Close menu' })
    ).toBeVisible();
    await expect(
      mobilePanel.getByRole('link', { name: 'Product', exact: true })
    ).toBeVisible();
    await expect(
      mobilePanel.getByRole('link', { name: 'Solutions', exact: true })
    ).toBeVisible();
    await expect(
      mobilePanel.getByRole('link', { name: 'Pricing', exact: true })
    ).toBeVisible();
    await expect(
      mobilePanel.getByRole('link', { name: 'Resources', exact: true })
    ).toBeVisible();
    await expect(
      mobilePanel.getByRole('link', { name: 'Start Free', exact: true })
    ).toHaveAttribute('href', '/signup');
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
