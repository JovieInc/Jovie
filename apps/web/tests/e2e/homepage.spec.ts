import { PUBLIC_WAITLIST_URL } from '@/data/homepageFrontDoorCta';
import { FEATURE_FLAGS } from '@/lib/flags/marketing-static';
import { expect, test } from './setup';
import { waitForHydration } from './utils/smoke-test-utils';

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

  test('renders the canonical identity hero with the one primary action', async ({
    page,
  }) => {
    const hero = page.getByTestId('marketing-section-hero');

    await expect(hero).toBeVisible();
    await expect(
      hero.getByRole('heading', {
        level: 1,
        name: 'A living identity for the internet.',
      })
    ).toBeVisible();
    await expect(
      hero.getByText(
        'Your work, your links, your next chapter. Together in your Jovie profile.'
      )
    ).toBeVisible();
    await expect(hero.getByText('Jovie / Identity, connected')).toBeVisible();
    if (FEATURE_FLAGS.WAITLIST_ENABLED) {
      await expect(
        hero.getByRole('link', { name: 'Request access', exact: true })
      ).toHaveAttribute('href', PUBLIC_WAITLIST_URL);
      await expect(hero.getByRole('link')).toHaveCount(1);
      await expect(hero.getByRole('combobox')).toHaveCount(0);
      await expect(hero.getByRole('button')).toHaveCount(0);
    } else {
      await expect(hero.getByPlaceholder('Search your name')).toBeVisible();
      await expect(
        hero.getByRole('button', { name: 'Find me', exact: true })
      ).toBeEnabled();
      await expect(hero.getByRole('link')).toHaveCount(0);
    }

    // Illustrative specimen, labeled as such, with a real portrait.
    const specimen = hero.getByTestId('homepage-profile-specimen');
    await expect(specimen.getByText('Avery Chen')).toBeVisible();
    await expect(
      specimen.getByText('Your Jovie profile · Illustrative preview')
    ).toBeVisible();
    await expect(specimen.getByRole('img')).toHaveJSProperty('complete', true);

    // The hero texture bleeds under the docked header to y=0.
    const heroBox = await hero.boundingBox();
    expect(heroBox?.y ?? 1).toBeLessThanOrEqual(0);
    await expect(
      hero.getByTestId('homepage-identity-hero-texture')
    ).toHaveAttribute('aria-hidden', 'true');
  });

  test('header is the canonical docked shell with the Customers flyout', async ({
    page,
  }) => {
    const header = page.getByTestId('header-nav');

    await expect(header).toBeVisible();
    await expect(header).toHaveAttribute(
      'data-presentation',
      'marketing-glass'
    );
    await expect(header.getByRole('link', { name: 'Product' })).toHaveAttribute(
      'href',
      '/product'
    );
    await expect(header.getByRole('link', { name: 'Pricing' })).toHaveAttribute(
      'href',
      '/pricing'
    );
    await expect(header.getByRole('link', { name: 'Log in' })).toHaveAttribute(
      'href',
      '/signin'
    );
    await expect(
      header.getByRole('link', { name: 'Request access' })
    ).toHaveAttribute('href', '/signup');

    const viewport = page.viewportSize();
    test.skip(
      (viewport?.width ?? 0) < 1024,
      'The Customers flyout is a desktop navigation affordance'
    );
    const trigger = header.getByRole('button', { name: /Customers/ });
    await trigger.hover();
    const flyout = page.locator('#marketing-header-flyout-customers');
    await expect(flyout).toBeVisible();
    await expect(
      flyout.getByRole('link', { name: 'Investors' })
    ).toHaveAttribute('href', '/investors');
    await expect(flyout.getByRole('link', { name: 'Artists' })).toHaveAttribute(
      'href',
      '/artist-profiles'
    );
    await expect(flyout.getByRole('link')).toHaveCount(2);
    await page.keyboard.press('Escape');
    await expect(flyout).toHaveCount(0);
  });

  test('mounts presence, structure, close, and the full footer in order', async ({
    page,
  }) => {
    const ids = await page
      .locator('main section[data-homepage-testid]')
      .evaluateAll(sections =>
        sections.map(section => section.getAttribute('data-homepage-testid'))
      );
    expect(ids).toEqual([
      'homepage-hero-shell',
      'homepage-section-presence',
      'homepage-section-structure',
      'homepage-close',
    ]);

    const close = page.getByTestId('marketing-section-cta');
    await expect(
      close.getByRole('heading', { name: 'Make it your Jovie profile.' })
    ).toBeVisible();
    if (FEATURE_FLAGS.WAITLIST_ENABLED) {
      await expect(
        close.getByRole('link', { name: 'Request access', exact: true })
      ).toHaveAttribute('href', PUBLIC_WAITLIST_URL);
    }

    // Each background image appears once on the page.
    const backgrounds = await page
      .locator('[data-background-image]')
      .evaluateAll(nodes =>
        nodes.map(node => node.getAttribute('data-background-image'))
      );
    expect(backgrounds).toHaveLength(2);
    expect(new Set(backgrounds).size).toBe(2);

    const footer = page.getByTestId('marketing-footer');
    await expect(footer).toBeVisible();
    await expect(
      footer.getByRole('link', { name: 'Developers' })
    ).toHaveAttribute('href', '/developers');
  });

  test('keeps the hero still under reduced motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await gotoHomepage(page);
    const animation = await page
      .getByTestId('homepage-identity-hero-texture')
      .evaluate(node => getComputedStyle(node).animationName);
    expect(animation).toBe('none');
  });

  test('has no horizontal overflow across common viewports', async ({
    page,
  }) => {
    test.setTimeout(240_000);

    const viewports = [
      { width: 320, height: 568 },
      { width: 375, height: 812 },
      { width: 390, height: 844 },
      { width: 430, height: 932 },
      { width: 736, height: 863 },
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
   * JOV-6436: Public Get started CTAs land on same-origin /signup.
   * /start remains the post-auth capture chat; /waitlist is the receipt.
   */
  test('all data-cta-sign-up elements navigate to signup (JOV-6436)', async ({
    page,
  }) => {
    await gotoHomepage(page);

    const ctaLinks = page.locator('[data-cta-sign-up="true"]');
    const count = await ctaLinks.count();

    // The homepage converts through one Request access action (name search
    // while the waitlist is off); any sign-up anchors must route to /signup.
    await expect(
      page.getByRole('button', { name: 'Find me', exact: true })
    ).toHaveCount(FEATURE_FLAGS.WAITLIST_ENABLED ? 0 : 1);

    for (let i = 0; i < count; i += 1) {
      const cta = ctaLinks.nth(i);
      const tagName = await cta.evaluate(el => el.tagName.toLowerCase());

      if (tagName === 'a') {
        const href = await cta.getAttribute('href');
        const isSignupRoute =
          href === PUBLIC_WAITLIST_URL ||
          href === '/signup' ||
          (href?.startsWith('/signup?') ?? false);
        expect(
          isSignupRoute,
          `CTA at index ${i} (href="${href}") must route to /signup`
        ).toBe(true);
      }
    }
  });
});
