import { expect, test } from './setup';
import { SMOKE_TIMEOUTS, waitForHydration } from './utils/smoke-test-utils';

const isFastIteration = process.env.E2E_FAST_ITERATION === '1';
const HOMEPAGE_NAVIGATION_TIMEOUT = 60_000;
type PlaywrightPage = import('@playwright/test').Page;

test.use({ storageState: { cookies: [], origins: [] } });
test.skip(
  isFastIteration,
  'Homepage coverage runs in the lighter smoke-public and content-gate fast lanes'
);

async function interceptAnalytics(page: PlaywrightPage) {
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

async function hasNextDevTransientOverlay(page: PlaywrightPage) {
  return page
    .getByText(
      /Runtime SyntaxError|Unexpected end of JSON input|Manifest file is empty/
    )
    .first()
    .isVisible({ timeout: 1_000 })
    .catch(() => false);
}

async function gotoHomepage(page: PlaywrightPage) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await page.goto('/', {
      waitUntil: 'domcontentloaded',
      timeout: HOMEPAGE_NAVIGATION_TIMEOUT,
    });
    await waitForHydration(page);

    if (!(await hasNextDevTransientOverlay(page))) {
      return;
    }

    await page.waitForTimeout(1_000);
  }

  throw new Error('Homepage rendered a transient Next.js dev overlay');
}

test.describe('Homepage', () => {
  test.beforeEach(async ({ page }) => {
    await interceptAnalytics(page);
    await gotoHomepage(page);
  });

  test('renders the System B poster hero and CTA', async ({ page }) => {
    const hero = page.getByTestId('homepage-hero-shell');

    await expect(hero).toBeVisible();
    await expect(hero.getByText('operating system')).toHaveCount(0);
    await expect(
      hero.getByRole('heading', {
        name: 'Jovie runs your music career.',
      })
    ).toBeVisible();
    await expect(hero.getByText('You make the music.')).toBeVisible();
    await expect(
      hero.getByRole('link', { name: 'Get started', exact: true })
    ).toHaveAttribute('href', /\/start\?starter_prompt=/);
    // Secondary CTA hidden while WAITLIST_ENABLED is on.
    await expect(
      hero.getByRole('link', { name: 'See a live profile', exact: true })
    ).toHaveCount(0);
    await expect(hero.getByPlaceholder('Ask Jovie...')).toHaveCount(0);
  });

  test('header uses compact homepage presentation and waitlist CTA', async ({
    page,
  }) => {
    const header = page.getByTestId('header-nav');

    await expect(header).toBeVisible();
    await expect(header).toHaveAttribute(
      'data-presentation',
      'homepage-embedded'
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
    await expect(header.getByRole('link', { name: 'Log in' })).toHaveAttribute(
      'href',
      '/signin'
    );
    await expect(
      header.getByRole('link', { name: 'Get started' })
    ).toHaveAttribute('href', /\/start\?starter_prompt=/);

    await page.evaluate(() =>
      window.scrollTo({ top: 320, behavior: 'instant' })
    );
    const floatingShell = header.locator('nav > div');
    await expect
      .poll(async () =>
        floatingShell.evaluate(
          element => element.getBoundingClientRect().height
        )
      )
      .toBeLessThanOrEqual(44);

    const floatingRadius = await floatingShell.evaluate(element =>
      Number.parseFloat(getComputedStyle(element).borderRadius)
    );
    const ctaHeight = await header
      .getByRole('link', { name: 'Get started' })
      .evaluate(element => element.getBoundingClientRect().height);
    expect(floatingRadius).toBe(22);
    expect(ctaHeight).toBe(36);
  });

  test('header flyouts are not mounted by default', async ({ page }) => {
    const header = page.getByTestId('header-nav');
    const featuresFlyout = page.locator('#marketing-header-flyout-features');

    await expect(header.getByRole('button', { name: 'Features' })).toHaveCount(
      0
    );
    await expect(featuresFlyout).toHaveCount(0);
  });

  test('hero exposes one centered release workspace at source quality', async ({
    page,
  }) => {
    const commandCenter = page.getByTestId('homepage-hero-command-center');

    await expect(commandCenter).toBeVisible();
    await expect(
      commandCenter.getByAltText(
        'Jovie release workspace with release status, assets, and launch progress'
      )
    ).toBeVisible();
    await expect(commandCenter.locator('img')).toHaveCount(1);
    await expect(commandCenter.getByRole('button')).toHaveCount(0);
    await page.waitForFunction(() => {
      const commandCenterEl = document.querySelector(
        '[data-testid="homepage-hero-command-center"]'
      );
      const image = commandCenterEl?.querySelector<HTMLImageElement>('img');
      if (!image) return false;
      const rect = image.getBoundingClientRect();
      const imageCenter = rect.left + rect.width / 2;
      return (
        image.complete &&
        image.naturalWidth > 0 &&
        Math.abs(imageCenter - window.innerWidth / 2) < 12
      );
    });

    const visibleImageQuality = await commandCenter
      .locator('img')
      .evaluateAll(images =>
        images
          .map(img => {
            const rect = img.getBoundingClientRect();
            const sourceWidth =
              Number(
                new URL(img.currentSrc, window.location.href).searchParams.get(
                  'w'
                )
              ) || img.naturalWidth;
            return {
              alt: img.alt,
              clientWidth: rect.width,
              naturalWidth: img.naturalWidth,
              sourceWidth,
              visible:
                rect.width > 0 && rect.right > 0 && rect.left < innerWidth,
              requiredWidth: Math.ceil(rect.width * devicePixelRatio),
            };
          })
          .filter(image => image.visible)
      );

    expect(visibleImageQuality).toHaveLength(1);
    for (const image of visibleImageQuality) {
      expect(
        image.sourceWidth,
        `${image.alt} should be loaded at device pixel ratio quality`
      ).toBeGreaterThanOrEqual(image.requiredWidth);
    }
  });

  test('electric seam keeps hero geometry stable and respects reduced motion', async ({
    page,
  }) => {
    const seamSlot = page.getByTestId('homepage-poster-hero-seam');
    const mediaSlot = page.getByTestId('homepage-poster-hero-media');
    const initialSeam = await seamSlot.boundingBox();
    const initialMedia = await mediaSlot.boundingBox();

    await page.getByTestId('homepage-electric-seam').evaluate(async element => {
      await Promise.all(
        element
          .getAnimations({ subtree: true })
          .map(animation => animation.finished.catch(() => undefined))
      );
    });

    const settledSeam = await seamSlot.boundingBox();
    const settledMedia = await mediaSlot.boundingBox();
    expect(initialSeam).not.toBeNull();
    expect(initialMedia).not.toBeNull();
    expect(
      Math.abs((settledSeam?.height ?? 0) - (initialSeam?.height ?? 0))
    ).toBeLessThanOrEqual(1);
    expect(
      Math.abs((settledMedia?.y ?? 0) - (initialMedia?.y ?? 0))
    ).toBeLessThanOrEqual(1);
    expect(
      Math.abs((settledMedia?.height ?? 0) - (initialMedia?.height ?? 0))
    ).toBeLessThanOrEqual(1);

    await page.emulateMedia({ reducedMotion: 'reduce' });
    await gotoHomepage(page);

    const reducedMotionSeam = page.getByTestId('homepage-electric-seam');
    await expect(reducedMotionSeam.locator('[data-seam-glow]')).toHaveCount(1);
    await expect(
      reducedMotionSeam.locator('path[stroke-dasharray]')
    ).toHaveCount(0);
    await expect(page.getByTestId('homepage-poster-hero-media')).toBeVisible();
  });

  test('renders the System B narrative in order through the footer CTA', async ({
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
    const opportunity = page.getByTestId('homepage-opportunity-section');
    const workspace = page.getByTestId('homepage-workspace-section');
    const outcomes = page.getByTestId('homepage-artist-outcomes');
    const closedLoop = page.getByTestId('homepage-closed-loop');

    await expect(opportunity).toBeVisible();
    await expect(workspace).toBeVisible();
    await expect(outcomes).toBeVisible();
    await expect(closedLoop).toBeVisible();
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
    await expect(
      page.getByRole('heading', {
        name: 'Release day is not the finish line.',
      })
    ).toBeVisible();
    await expect(page.getByTestId('homepage-ai-composer-demo')).toBeVisible();
    const sectionOrder = await page.evaluate(() => {
      const testIds = [
        'homepage-opportunity-section',
        'homepage-workspace-section',
        'homepage-artist-outcomes',
        'homepage-closed-loop',
        'homepage-v2-pricing',
        'homepage-faq',
        'homepage-v2-final-cta',
      ];
      return testIds.map(testId => {
        const element = document.querySelector(`[data-testid="${testId}"]`);
        return element?.getBoundingClientRect().top ?? -1;
      });
    });
    expect(sectionOrder.every(top => top >= 0)).toBe(true);
    expect(sectionOrder).toEqual([...sectionOrder].sort((a, b) => a - b));
    await expect(
      page.getByRole('heading', {
        name: 'All your music. Working while you sleep.',
      })
    ).toBeVisible();
    await expect(
      page.getByTestId('homepage-workspace-screenshot').locator('img')
    ).toBeVisible();
    for (const outcome of [
      'Your catalog, in one place',
      'Opportunities surfaced',
      'Launch the next one',
    ]) {
      await expect(
        workspace.getByRole('heading', { name: outcome })
      ).toBeVisible();
    }
    await expect(page.getByTestId('homepage-product-statement')).toHaveCount(0);
    await expect(page.getByTestId('homepage-go-live-section')).toHaveCount(0);
    await expect(page.getByTestId('homepage-product-depth-band')).toHaveCount(
      0
    );
    await expect(page.getByTestId('homepage-workflow-strip')).toHaveCount(0);
    await expect(page.getByTestId('friday-rhythm-section')).toHaveCount(0);
    await expect(page.getByTestId('homepage-profile-proof-band')).toHaveCount(
      0
    );
    await expect(
      outcomes.getByRole('heading', { name: 'Every fan has a next move.' })
    ).toBeVisible();
    for (const outcome of ['Drive Streams', 'Capture Fans', 'Get Paid']) {
      await expect(
        outcomes.getByRole('heading', { name: outcome })
      ).toBeVisible();
    }
    await outcomes.scrollIntoViewIfNeeded();
    await page.waitForFunction(() => {
      const section = document.querySelector(
        '[data-testid="homepage-artist-outcomes"]'
      );
      if (!section) return false;
      return Array.from(
        section.querySelectorAll<HTMLImageElement>('img')
      ).every(img => img.complete && img.naturalWidth > 0);
    });
    const profileImageQuality = await outcomes
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

    expect(profileImageQuality).toHaveLength(3);
    for (const image of profileImageQuality) {
      expect(
        image.naturalWidth,
        `${image.alt} should be loaded at device pixel ratio quality`
      ).toBeGreaterThanOrEqual(image.requiredWidth);
    }
    await expect(page.getByText('2.9x')).toHaveCount(0);
    await expect(
      closedLoop.getByRole('heading', {
        name: 'Every release makes the next move clearer.',
      })
    ).toBeVisible();
    await expect(
      closedLoop.getByTestId('homepage-closed-loop-step')
    ).toHaveCount(5);
    // Spec wall section removed — JOV-2073
    await expect(page.getByTestId('homepage-v2-pricing')).toBeVisible();
    await expect(page.getByTestId('homepage-faq')).toBeVisible();
    const finalCta = page.getByTestId('homepage-v2-final-cta');
    await finalCta.scrollIntoViewIfNeeded();
    await expect(finalCta).toBeVisible();
    await expect(page.getByTestId('homepage-v2-final-cta-heading')).toHaveText(
      'Keep your music moving.'
    );
    await expect(page.getByTestId('homepage-v2-final-cta-primary')).toHaveText(
      'Get started'
    );
    await expect(
      page.getByTestId('homepage-v2-final-cta-primary')
    ).toHaveAttribute('href', /\/start\?starter_prompt=/);
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

  test('mobile keeps hero and product proof inside the viewport with direct auth CTAs', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoHomepage(page);

    await expect(
      page.getByRole('heading', {
        name: 'Jovie runs your music career.',
      })
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
      header.getByRole('link', { name: 'Get started', exact: true })
    ).toHaveCount(0);
    await expect(
      header.getByRole('link', { name: 'Log in', exact: true })
    ).toHaveAttribute('href', '/signin');
  });

  test('has no horizontal overflow across common viewports', async ({
    page,
  }) => {
    test.setTimeout(240_000);

    const viewports = [
      { width: 390, height: 844 },
      { width: 430, height: 932 },
      { width: 768, height: 1024 },
      { width: 1024, height: 768 },
      { width: 1280, height: 800 },
      { width: 1440, height: 900 },
      { width: 1512, height: 982 },
    ];

    await page.setViewportSize(viewports[0]);
    await gotoHomepage(page);

    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      await page.evaluate(
        () =>
          new Promise<void>(resolve => {
            requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
          })
      );

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

    await gotoHomepage(page);

    expect(errors).toEqual([]);
  });

  /**
   * JOV-2065: Public CTAs with data-cta-sign-up="true" route through the
   * canonical /start product entry before authenticated signup.
   *
   * Finds every element marked with data-cta-sign-up="true" and verifies it
   * has an href starting with /start.
   */
  test('all data-cta-sign-up elements navigate to /start (JOV-2065)', async ({
    page,
  }) => {
    await gotoHomepage(page);

    const ctaLinks = page.locator('[data-cta-sign-up="true"]');
    const count = await ctaLinks.count();

    // Must have at least one CTA on the homepage
    expect(
      count,
      'Homepage must have at least one data-cta-sign-up CTA'
    ).toBeGreaterThan(0);

    // Every anchor CTA must point to /start (or /start?...)
    for (let i = 0; i < count; i += 1) {
      const cta = ctaLinks.nth(i);
      const tagName = await cta.evaluate(el => el.tagName.toLowerCase());

      if (tagName === 'a') {
        const href = await cta.getAttribute('href');
        const isStartRoute = href?.startsWith('/start') ?? false;
        expect(
          isStartRoute,
          `CTA at index ${i} (href="${href}") must route to /start`
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
    await gotoHomepage(page);

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
