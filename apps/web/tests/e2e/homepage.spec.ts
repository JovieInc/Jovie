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
    await expect(hero.getByText('Release operating system')).toBeVisible();
    await expect(
      hero.getByRole('heading', { name: 'Release more music with less work' })
    ).toBeVisible();
    await expect(
      hero.getByText(
        'Plan the drop, route every fan, and keep the next release moving.'
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
      'marketing-glass'
    );
    await expect(header.locator('a[href="/"]').first()).toBeVisible();
    await expect(
      header.getByRole('button', { name: 'Features' })
    ).toBeVisible();
    await expect(
      header.getByRole('button', { name: 'Resources' })
    ).toBeVisible();
    await expect(header.getByRole('link', { name: 'Pricing' })).toHaveAttribute(
      'href',
      '/pricing'
    );
    await expect(header.getByRole('link', { name: 'Sign in' })).toHaveCount(1);
    await expect(
      header.getByRole('link', { name: 'Start Free Trial' })
    ).toHaveAttribute('href', '/signup');
  });

  test('product carousel exposes desktop and mobile proof slides', async ({
    page,
  }) => {
    const carousel = page.getByTestId('homepage-hero-command-center');

    await expect(carousel).toBeVisible();
    await expect(
      carousel.getByAltText('The Deep End release page with fan action buttons')
    ).toBeVisible();
    await expect(
      carousel.getByAltText(
        'Jovie releases page with release status, assets, and launch progress'
      )
    ).toBeVisible();
    await expect(
      carousel.getByAltText(
        'Tim White artist profile with release and fan actions'
      )
    ).toBeVisible();
    await page.waitForFunction(() => {
      const releaseImage = document.querySelector<HTMLImageElement>(
        'img[alt="Jovie releases page with release status, assets, and launch progress"]'
      );
      if (!releaseImage) return false;
      const rect = releaseImage.getBoundingClientRect();
      const imageCenter = rect.left + rect.width / 2;
      return Math.abs(imageCenter - window.innerWidth / 2) < 12;
    });
    await expect(
      carousel.getByRole('button', { name: 'Next product preview' })
    ).toBeVisible();
    await expect(
      carousel.getByRole('button', { name: 'Previous product preview' })
    ).toBeVisible();
    await page.waitForFunction(() => {
      const carouselEl = document.querySelector(
        '[data-testid="homepage-hero-command-center"]'
      );
      if (!carouselEl) return false;
      const visibleImages = Array.from(
        carouselEl.querySelectorAll<HTMLImageElement>('img')
      ).filter(img => {
        const rect = img.getBoundingClientRect();
        return rect.width > 0 && rect.right > 0 && rect.left < innerWidth;
      });
      return (
        visibleImages.length >= 3 &&
        visibleImages.every(img => img.complete && img.naturalWidth > 0)
      );
    });

    const visibleImageQuality = await carousel
      .locator('img')
      .evaluateAll(images =>
        images
          .map(img => {
            const rect = img.getBoundingClientRect();
            return {
              alt: img.alt,
              clientWidth: rect.width,
              naturalWidth: img.naturalWidth,
              visible:
                rect.width > 0 && rect.right > 0 && rect.left < innerWidth,
              requiredWidth: Math.ceil(rect.width * devicePixelRatio),
            };
          })
          .filter(image => image.visible)
      );

    expect(visibleImageQuality.length).toBeGreaterThanOrEqual(3);
    for (const image of visibleImageQuality) {
      expect(
        image.naturalWidth,
        `${image.alt} should be loaded at device pixel ratio quality`
      ).toBeGreaterThanOrEqual(image.requiredWidth);
    }
  });

  test('trust, product statement, workspace, Friday, profile proof, pricing, FAQ, and final CTA render', async ({
    page,
  }) => {
    await expect(page.getByTestId('homepage-trust')).toHaveAttribute(
      'data-presentation',
      'inline-strip'
    );
    await expect(page.getByTestId('homepage-story-stack')).toHaveAttribute(
      'data-proof-transition',
      'true'
    );
    await expect(page.getByTestId('homepage-workspace-section')).toBeVisible();
    const proofParallaxAnimation = await page.evaluate(() => {
      const supportsScrollTimeline = CSS.supports('animation-timeline: view()');
      const logoGrid = document.querySelector('.homepage-trust-logo-grid');
      return supportsScrollTimeline && logoGrid
        ? getComputedStyle(logoGrid).animationName
        : 'unsupported';
    });
    if (proofParallaxAnimation !== 'unsupported') {
      expect(proofParallaxAnimation).toBe('homepage-proof-logos-parallax');
    }
    await expect(page.getByTestId('homepage-product-statement')).toBeVisible();
    await expect(page.getByText('Meet Jovie')).toBeVisible();
    await expect(
      page.getByRole('heading', {
        name: /A release operating system for serious artists\./,
      })
    ).toBeVisible();
    await expect(page.getByText('Go live. In 60 seconds.')).toBeVisible();
    await expect(
      page.getByRole('heading', {
        name: 'One workspace. For every release.',
      })
    ).toBeVisible();
    await expect(
      page.getByTestId('homepage-workspace-screenshot').locator('img')
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Import the release' })
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Generate the plan' })
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Run the tasks' })
    ).toBeVisible();
    await expect(page.getByTestId('homepage-product-depth-band')).toHaveCount(
      0
    );
    await expect(page.getByTestId('homepage-workflow-strip')).toHaveCount(0);
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
      page.getByRole('heading', { name: 'Release more music with less work' })
    ).toBeVisible({
      timeout: SMOKE_TIMEOUTS.VISIBILITY,
    });
    await expect(page.getByTestId('header-nav')).toBeVisible();

    const heroProductRail = page.getByTestId('homepage-hero-command-center');
    const heroShotBounds = await heroProductRail.boundingBox();
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
      mobilePanel.getByRole('link', { name: 'Artist Profiles', exact: true })
    ).toBeVisible();
    await expect(
      mobilePanel.getByRole('link', {
        name: 'Smart Release Links',
        exact: true,
      })
    ).toBeVisible();
    await expect(
      mobilePanel.getByRole('link', { name: 'Pricing', exact: true })
    ).toBeVisible();
    await expect(
      mobilePanel.getByRole('link', { name: 'Blog', exact: true })
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
