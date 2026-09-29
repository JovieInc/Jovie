import { PUBLIC_WAITLIST_URL } from '@/data/homepageFrontDoorCta';
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
    // Homepage conversion lock (JOV-5085): never Request access on /.
    await expect(
      header.getByRole('link', { name: 'Find yourself' })
    ).toHaveAttribute('href', '/start');
    await expect(
      header.getByRole('link', { name: 'Request access' })
    ).toHaveCount(0);

    const viewport = page.viewportSize();
    test.skip(
      (viewport?.width ?? 0) < 1024,
      'The Customers flyout is a desktop navigation affordance'
    );
    const trigger = header.getByRole('button', { name: /Customers/ });
    await trigger.hover();
    const flyout = page.locator('#marketing-header-flyout-customers');
    await expect(flyout).toBeVisible();
    await expect(flyout.getByRole('link', { name: 'Artists' })).toHaveAttribute(
      'href',
      '/solutions/artists'
    );
    await expect(flyout.getByRole('link')).toHaveCount(1);
    await page.keyboard.press('Escape');
    await expect(flyout).toHaveCount(0);
  });

  test('canonical header has only the Customers flyout', async ({ page }) => {
    const header = page.getByTestId('header-nav');

    await expect(header.getByRole('button', { name: 'For' })).toHaveCount(0);
    await expect(header.getByRole('button', { name: 'Tools' })).toHaveCount(0);
    await expect(page.locator('#marketing-header-flyout-tools')).toHaveCount(0);
  });

  test('keeps the hero still under reduced motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await gotoHomepage(page);
    const animation = await page
      .getByTestId('homepage-identity-hero-light')
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

  test('keeps the hero centered and unclipped at 200% zoom equivalents', async ({
    page,
  }) => {
    for (const viewport of [
      { width: 720, height: 450 },
      { width: 320, height: 406 },
    ]) {
      await page.setViewportSize(viewport);
      await gotoHomepage(page);
      await page.evaluate(() => document.fonts.ready);

      const copy = page.locator('.homepage-identity-hero__inner');
      const copyBox = await copy.boundingBox();
      const heroBox = await page
        .getByTestId('marketing-section-hero')
        .boundingBox();
      const copyCenter = (copyBox?.x ?? 0) + (copyBox?.width ?? 0) / 2;
      expect(Math.abs(copyCenter - viewport.width / 2)).toBeLessThanOrEqual(8);
      expect(copyBox?.y ?? -1).toBeGreaterThanOrEqual(heroBox?.y ?? 0);
      expect((copyBox?.y ?? 0) + (copyBox?.height ?? 0)).toBeLessThanOrEqual(
        (heroBox?.y ?? 0) + (heroBox?.height ?? 0) + 1
      );

      const horizontalOverflow = await page.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth
      );
      expect(horizontalOverflow).toBeLessThanOrEqual(1);

      const heading = page.getByRole('heading', {
        name: 'Your living identity on the internet.',
      });
      const headingLines = await heading.evaluate(element => {
        const style = getComputedStyle(element);
        return Math.ceil(
          element.getBoundingClientRect().height /
            Number.parseFloat(style.lineHeight) -
            0.05
        );
      });
      expect(headingLines).toBeLessThanOrEqual(3);
      await expect(page.getByTestId('homepage-primary-cta')).toBeVisible();
    }
  });

  test('optical polish keeps shared search geometry and a quiet hero field', async ({
    page,
  }) => {
    await page.evaluate(() => document.fonts.ready);

    const measureSearch = (root: string) =>
      page.locator(root).evaluate(element => {
        const field = element.querySelector<HTMLElement>(
          '.homepage-name-search__field'
        );
        const glow = element.querySelector<HTMLElement>(
          '.input-aura-frame__illumination'
        );
        const action = element.querySelector<HTMLElement>(
          'button[data-size="marketing"]'
        );
        if (!(field && glow && action)) return null;
        const fieldBox = field.getBoundingClientRect();
        const actionBox = action.getBoundingClientRect();
        const fieldStyle = getComputedStyle(field);
        const glowStyle = getComputedStyle(glow);
        return {
          fieldHeight: fieldBox.height,
          fieldBackground: fieldStyle.backgroundColor,
          insetTop: actionBox.top - fieldBox.top,
          insetBottom: fieldBox.bottom - actionBox.bottom,
          insetRight: fieldBox.right - actionBox.right,
          actionHeight: actionBox.height,
          glowTop: glow.getBoundingClientRect().top,
          fieldTop: fieldBox.top,
          maskComposite: glowStyle.maskComposite,
          treatment: element
            .querySelector('[data-aura-treatment]')
            ?.getAttribute('data-aura-treatment'),
        };
      });

    const heroSearch = await measureSearch(
      '[data-testid="homepage-editorial-hero-search"]'
    );
    // The close owns one focus-only action; the hero field is the sole
    // search surface, so a duplicated close-search node must stay absent.
    expect(await page.getByTestId('homepage-close-search').count()).toBe(0);
    expect(heroSearch).not.toBeNull();
    expect(heroSearch?.treatment).toBe('editorial');
    expect(heroSearch?.actionHeight).toBeCloseTo(28, 0);
    expect(heroSearch?.insetTop).toBeCloseTo(heroSearch?.insetBottom ?? 0, 0);
    expect(heroSearch?.insetTop).toBeCloseTo(heroSearch?.insetRight ?? 0, 0);

    const input = page
      .getByTestId('homepage-editorial-hero-search')
      .getByRole('combobox');
    const idleBackground = heroSearch?.fieldBackground;
    await input.focus();
    const focused = await measureSearch(
      '[data-testid="homepage-editorial-hero-search"]'
    );
    expect(focused?.fieldBackground).toBe(idleBackground);
    expect(focused?.fieldHeight).toBeCloseTo(heroSearch?.fieldHeight ?? 0, 0);

    await page.setViewportSize({ width: 900, height: 800 });
    await page.evaluate(() => document.fonts.ready);
    const heading = page.getByRole('heading', {
      name: 'Your living identity on the internet.',
    });
    const headingLines = await heading.evaluate(element => {
      const style = getComputedStyle(element);
      return Math.ceil(
        element.getBoundingClientRect().height /
          Number.parseFloat(style.lineHeight) -
          0.05
      );
    });
    // The canonical headline is a balanced two-line measure.
    expect(headingLines).toBeLessThanOrEqual(2);
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

    // The certified homepage converts through one Find me search. Header
    // sign-up anchors, when present, still land on /signup.
    await expect(
      page.getByRole('button', { name: 'Find me', exact: true })
    ).toHaveCount(1);

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
