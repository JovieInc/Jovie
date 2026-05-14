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
    await expect(hero.getByText('Release operating system')).toHaveCount(0);
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
    await expect(header.getByRole('button', { name: 'Features' })).toHaveCount(
      0
    );
    await expect(header.getByRole('button', { name: 'Resources' })).toHaveCount(
      0
    );
    await expect(header.getByRole('link', { name: 'Pricing' })).toHaveCount(0);
    await expect(header.getByRole('link', { name: 'Contact' })).toHaveCount(0);
    await expect(header.getByRole('link', { name: 'Sign in' })).toHaveCount(1);
    await expect(
      header.getByRole('link', { name: 'Start Free Trial' })
    ).toHaveAttribute('href', '/signup');
  });

  test('header flyouts are not mounted by default', async ({ page }) => {
    const header = page.getByTestId('header-nav');
    const featuresFlyout = page.locator('#marketing-header-flyout-features');

    await expect(header.getByRole('button', { name: 'Features' })).toHaveCount(
      0
    );
    await expect(featuresFlyout).toHaveCount(0);
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

  test('trust, product statement, workspace, artist profiles, pricing, FAQ, and final CTA render', async ({
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
        name: /A new kind of operating system\s+Built for music artists/,
      })
    ).toBeVisible();
    const aiComposer = page.getByTestId('homepage-ai-composer-demo');
    await expect(aiComposer).toBeVisible();
    await expect(
      aiComposer.getByRole('heading', {
        name: 'Ask once. Get the launch plan',
      })
    ).toBeVisible();
    const aiComposerBefore = await aiComposer.boundingBox();
    await page.waitForTimeout(5600);
    const aiComposerAfter = await aiComposer.boundingBox();
    expect(
      Math.abs((aiComposerAfter?.height ?? 0) - (aiComposerBefore?.height ?? 0))
    ).toBeLessThanOrEqual(2);
    await expect(page.getByTestId('homepage-go-live-section')).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Go live in 60 seconds' })
    ).toBeVisible();
    const productStatement = page.getByTestId('homepage-product-statement');
    const goLiveSection = page.getByTestId('homepage-go-live-section');
    const workspaceSection = page.getByTestId('homepage-workspace-section');
    for (const outcome of [
      'Import the drop automatically',
      'Generate the launch plan',
      'Run the next action',
    ]) {
      await expect(
        goLiveSection.getByRole('heading', { name: outcome })
      ).toBeVisible();
    }
    const sectionOrder = await page.evaluate(() => {
      const product = document.querySelector(
        '[data-testid="homepage-product-statement"]'
      );
      const goLive = document.querySelector(
        '[data-testid="homepage-go-live-section"]'
      );
      const workspace = document.querySelector(
        '[data-testid="homepage-workspace-section"]'
      );
      if (!product || !goLive || !workspace) return [];
      return [
        product.compareDocumentPosition(goLive),
        goLive.compareDocumentPosition(workspace),
      ];
    });
    expect(sectionOrder).toEqual([4, 4]);
    await expect(productStatement).toBeVisible();
    await expect(goLiveSection).toBeVisible();
    await expect(workspaceSection).toBeVisible();
    await expect(
      page.getByRole('heading', {
        name: 'One workspace For every release',
      })
    ).toBeVisible();
    await expect(
      page.getByTestId('homepage-workspace-screenshot').locator('img')
    ).toBeVisible();
    await expect(
      workspaceSection.getByRole('heading', {
        name: 'Import the drop automatically',
      })
    ).toBeVisible();
    await expect(
      workspaceSection.getByRole('heading', {
        name: 'Generate the launch plan',
      })
    ).toBeVisible();
    await expect(
      workspaceSection.getByRole('heading', { name: 'Run the next action' })
    ).toBeVisible();
    await expect(page.getByTestId('homepage-product-depth-band')).toHaveCount(
      0
    );
    await expect(page.getByTestId('homepage-workflow-strip')).toHaveCount(0);
    await expect(page.getByTestId('friday-rhythm-section')).toHaveCount(0);
    await expect(
      page.getByRole('heading', { name: 'Make Every Friday Count' })
    ).toHaveCount(0);
    await expect(page.getByTestId('homepage-profile-proof-band')).toHaveCount(
      0
    );
    const artistProfiles = page.getByTestId('homepage-artist-profiles-section');
    await expect(artistProfiles).toBeVisible();
    await expect(
      artistProfiles.getByRole('heading', {
        name: 'Artist profiles Built to convert',
      })
    ).toBeVisible();
    await expect(
      artistProfiles.getByText('Streams. Fans. Shows. Payments. Drops.')
    ).toBeVisible();
    await expect(
      artistProfiles.getByRole('link', { name: 'Claim your profile' })
    ).toHaveAttribute('href', '/signup');
    await expect(
      artistProfiles.getByRole('link', { name: 'View example' })
    ).toHaveAttribute('href', '/artist-profiles');
    for (const outcome of [
      'Get Paid',
      'Drive Streams',
      'Capture Fans',
      'Sell Out',
      'Drop Music',
    ]) {
      await expect(
        artistProfiles.getByRole('heading', { name: outcome })
      ).toBeVisible();
    }
    await artistProfiles.scrollIntoViewIfNeeded();
    const profileCards = artistProfiles.locator(
      '.homepage-artist-profile-card'
    );
    for (let index = 0; index < (await profileCards.count()); index += 1) {
      await profileCards.nth(index).scrollIntoViewIfNeeded();
    }
    await page.waitForFunction(() => {
      const section = document.querySelector(
        '[data-testid="homepage-artist-profiles-section"]'
      );
      if (!section) return false;
      return Array.from(
        section.querySelectorAll<HTMLImageElement>('img')
      ).every(img => img.complete && img.naturalWidth > 0);
    });
    const profileImageQuality = await artistProfiles
      .locator('img')
      .evaluateAll(images =>
        images.map(img => {
          const rect = img.getBoundingClientRect();
          return {
            alt: img.alt,
            clientWidth: rect.width,
            naturalWidth: img.naturalWidth,
            requiredWidth: Math.ceil(rect.width * devicePixelRatio),
          };
        })
      );

    expect(profileImageQuality).toHaveLength(5);
    for (const image of profileImageQuality) {
      expect(
        image.naturalWidth,
        `${image.alt} should be loaded at device pixel ratio quality`
      ).toBeGreaterThanOrEqual(image.requiredWidth);
    }
    // Spec wall section removed — JOV-2073
    const pricing = page.getByTestId('homepage-v2-pricing');
    await expect(pricing).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Simple pricing' })
    ).toBeVisible();
    const freePricingCard = page.getByTestId('marketing-pricing-plan-free');
    await expect(freePricingCard).toBeVisible();
    await expect(
      freePricingCard.getByText('Free forever', { exact: true })
    ).toBeVisible();
    await expect(
      pricing.getByText('Artist profiles are free forever.')
    ).toBeVisible();
    await expect(page.getByTestId('marketing-pricing-plan-pro')).toBeVisible();
    await expect(
      page.getByTestId('marketing-pricing-plan-enterprise')
    ).toHaveCount(0);
    await expect(page.getByTestId('marketing-pricing-plan-team')).toHaveCount(
      0
    );
    await expect(
      page
        .getByTestId('marketing-pricing-plan-pro')
        .getByRole('link', { name: 'Request Access' })
    ).toHaveAttribute('href', '/signup?plan=pro');
    const pricingCtasOnGrid = await pricing
      .locator('.marketing-pricing-plan-card')
      .evaluateAll(cards =>
        cards.map(card => {
          const cta = card.querySelector<HTMLElement>(
            '.marketing-pricing-plan-card__cta'
          );
          const cardRect = card.getBoundingClientRect();
          const ctaRect = cta?.getBoundingClientRect();
          if (!ctaRect) return false;
          return (
            Math.abs(
              cardRect.left +
                cardRect.width / 2 -
                (ctaRect.left + ctaRect.width / 2)
            ) <= 1 && ctaRect.right <= cardRect.right
          );
        })
      );
    expect(pricingCtasOnGrid).toEqual([true, true]);
    await expect(page.getByTestId('homepage-faq')).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Frequently Asked Questions' })
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
    const footer = page.getByTestId('marketing-footer');
    await expect(footer).toBeVisible();
    await expect(footer.getByRole('link', { name: 'Privacy' })).toHaveAttribute(
      'href',
      '/legal/privacy'
    );
    await expect(footer.getByRole('link', { name: 'Terms' })).toHaveAttribute(
      'href',
      '/legal/terms'
    );
    await expect(footer.getByRole('link', { name: 'Pricing' })).toHaveCount(0);
    await expect(footer.getByRole('link', { name: 'Investors' })).toHaveCount(
      0
    );
  });

  test('mobile keeps hero and carousel inside the viewport with direct auth CTAs', async ({
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

    const header = page.getByTestId('header-nav');
    await expect(page.getByRole('button', { name: 'Open menu' })).toHaveCount(
      0
    );
    await expect(
      header.getByRole('link', { name: 'Start Free Trial', exact: true })
    ).toHaveAttribute('href', '/signup');
    await expect(
      header.getByRole('link', { name: 'Sign in', exact: true })
    ).toHaveAttribute('href', '/signin');
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

  /**
   * JOV-2065: Public CTAs with data-cta-sign-up="true" must route to /signup.
   *
   * Finds every element marked with data-cta-sign-up="true" and verifies it
   * has an href starting with /signup, or opens a dialog with
   * data-auth-mode="sign-up".
   */
  test('all data-cta-sign-up elements navigate to /signup (JOV-2065)', async ({
    page,
  }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await waitForHydration(page);

    const ctaLinks = page.locator('[data-cta-sign-up="true"]');
    const count = await ctaLinks.count();

    // Must have at least one CTA on the homepage
    expect(
      count,
      'Homepage must have at least one data-cta-sign-up CTA'
    ).toBeGreaterThan(0);

    // Every anchor CTA must point to /signup (or /signup?...)
    for (let i = 0; i < count; i += 1) {
      const cta = ctaLinks.nth(i);
      const tagName = await cta.evaluate(el => el.tagName.toLowerCase());

      if (tagName === 'a') {
        const href = await cta.getAttribute('href');
        const isSignupRoute = href?.startsWith('/signup') ?? false;
        expect(
          isSignupRoute,
          `CTA at index ${i} (href="${href}") must route to /signup`
        ).toBe(true);
      }
    }
  });

  /**
   * JOV-2066: Trust logo bar contains SVG or img elements (not text-only logos)
   */
  test('trust logo bar contains visual logo elements (SVG or img)', async ({
    page,
  }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await waitForHydration(page);

    const trustSection = page.getByTestId('homepage-trust');
    await expect(trustSection).toBeVisible({
      timeout: SMOKE_TIMEOUTS.VISIBILITY,
    });

    const svgCount = await trustSection.locator('svg').count();
    const imgCount = await trustSection.locator('img').count();

    expect(
      svgCount + imgCount,
      'Trust logo bar must contain SVG or img logo elements'
    ).toBeGreaterThan(0);
  });
});
