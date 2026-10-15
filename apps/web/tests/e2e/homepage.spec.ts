import { PUBLIC_WAITLIST_URL } from '@/data/homepageFrontDoorCta';
import { HOMEPAGE_YOUTUBE_MVP as copy } from '@/data/homepageYoutubeMvp';
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

// JOV-5885: YouTube artist loop using the existing Find me search.
test.describe('Homepage', () => {
  test.beforeEach(async ({ page }) => {
    await interceptAnalytics(page);
    await gotoHomepage(page);
  });

  test('renders the YouTube upload loop with Find me as the primary action', async ({
    page,
  }) => {
    const hero = page.getByTestId('marketing-section-hero');
    await expect(
      hero.getByRole('heading', {
        level: 1,
        name: copy.hero.headline,
      })
    ).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);

    const cta = page.getByTestId('homepage-primary-cta');
    await expect(cta).toBeVisible();
    await expect(cta).toHaveText('Find me');
    await expect(hero.getByRole('combobox')).toHaveAttribute(
      'placeholder',
      copy.search.placeholder
    );
    await expect(page.getByText('Request access')).toHaveCount(0);
  });

  test('Find me hands the typed artist name to onboarding', async ({
    page,
  }) => {
    const handoff = page.waitForRequest(request => {
      const url = new URL(request.url());
      return (
        ['/start', '/signup'].includes(url.pathname) &&
        url.searchParams.get('starter_prompt')?.includes('Tim White') === true
      );
    });
    await page
      .getByTestId('marketing-section-hero')
      .getByRole('combobox')
      .fill('Tim White');
    await page.getByTestId('homepage-primary-cta').click();
    await handoff;
  });

  test('mounts the upload loop, founder proof, pricing, and close in order', async ({
    page,
  }) => {
    const headings = await page
      .locator('main h1:visible, main h2:visible')
      .evaluateAll(nodes => nodes.map(node => node.textContent?.trim()));
    expect(headings.filter(Boolean)).toEqual([
      copy.hero.headline,
      ...copy.features.map(feature => feature.headline),
      'From upload to the next release.',
      copy.proof.headline,
      copy.pricing.headline,
      copy.close.headline,
    ]);
    await expect(page.getByTestId('homepage-close-primary-cta')).toHaveText(
      'Find me'
    );
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
    // The homepage never shows Request access; the header front door is /start.
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

  test('keeps the hero copy and search inside the viewport on phones and at 200% zoom', async ({
    page,
  }) => {
    for (const viewport of [
      { width: 390, height: 844 },
      { width: 720, height: 450 },
      { width: 320, height: 406 },
    ]) {
      await page.setViewportSize(viewport);
      await gotoHomepage(page);
      await page.evaluate(() => document.fonts.ready);

      for (const locator of [
        page.getByRole('heading', { level: 1 }),
        page.locator('#homepage-hero-artist-search'),
        page.getByTestId('homepage-primary-cta'),
      ]) {
        await locator.scrollIntoViewIfNeeded();
        const box = await locator.boundingBox();
        expect(box, 'element renders').not.toBeNull();
        expect(box?.x ?? -1).toBeGreaterThanOrEqual(0);
        expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(
          viewport.width + 1
        );
      }
    }
  });

  test('renders the full headline and founder attribution at 390, 768, and 1440', async ({
    page,
  }) => {
    // getClientRects() on the element itself always returns exactly one
    // rect for a block box, no matter how many lines its text wraps to —
    // the fragmentation into lines only shows up on a Range over its text.
    const countVisualLines = (el: Element): number => {
      const range = document.createRange();
      range.selectNodeContents(el);
      return range.getClientRects().length;
    };

    const [firstSentence, secondSentence] = [copy.hero.headline, ''];
    const roleText = copy.proof.attribution;

    for (const viewport of [
      { width: 390, height: 844 },
      { width: 768, height: 1024 },
      { width: 1440, height: 900 },
    ]) {
      await page.setViewportSize(viewport);
      await gotoHomepage(page);
      await page.evaluate(() => document.fonts.ready);

      const heading = page.getByRole('heading', { level: 1 });
      await expect(heading).toBeVisible();
      await expect(heading).toHaveText(firstSentence + secondSentence);
      await expect(page.locator('#public-profile img')).toBeVisible();

      const secondLine = heading;
      const secondLineCount = await secondLine.evaluate(countVisualLines);
      expect(
        secondLineCount,
        `"${secondSentence}" wrapped to ${secondLineCount} lines at ${viewport.width}px, so the two-line clamp truncates it`
      ).toBeLessThanOrEqual(2);

      const headingBox = await heading.evaluate(el => ({
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth,
      }));
      expect(
        headingBox.scrollWidth,
        `headline overflows its own box at ${viewport.width}px: ${JSON.stringify(headingBox)}`
      ).toBeLessThanOrEqual(headingBox.clientWidth + 1);

      const role = page.getByText(roleText);
      await expect(role).toBeVisible();
      const roleLineCount = await role.evaluate(countVisualLines);
      expect(
        roleLineCount,
        `"${roleText}" wrapped to ${roleLineCount} lines at ${viewport.width}px`
      ).toBeLessThanOrEqual(3);
    }
  });

  test('aligns the hero with the shared page spine and desktop columns', async ({
    page,
  }) => {
    for (const viewport of [
      { width: 390, height: 844 },
      { width: 768, height: 1024 },
      { width: 1024, height: 900 },
      { width: 1440, height: 900 },
    ]) {
      await page.setViewportSize(viewport);
      await gotoHomepage(page);
      await page.evaluate(() => document.fonts.ready);

      const geometry = await page.evaluate(() => {
        const hero = document.querySelector<HTMLElement>(
          '[data-testid="marketing-section-hero"]'
        );
        const section = document.querySelector<HTMLElement>(
          '[data-testid="marketing-section-feature-split"] > div'
        );
        const sectionHeader = document.querySelector<HTMLElement>(
          '[data-testid="marketing-section-feature-split"] > div > div'
        );
        const heading = hero?.querySelector('h1');
        const card = hero?.querySelector(
          '[data-testid="homepage-editorial-hero-search"]'
        );
        if (!hero || !section || !sectionHeader || !heading || !card) {
          throw new Error(
            'The actual homepage hero and following section must render'
          );
        }
        const heroBox = hero.getBoundingClientRect();
        const sectionBox = section.getBoundingClientRect();
        const style = getComputedStyle(hero);
        const leftPadding = Number.parseFloat(style.paddingLeft);
        const rightPadding = Number.parseFloat(style.paddingRight);
        return {
          contentLeft: heroBox.x + leftPadding,
          contentWidth: heroBox.width - leftPadding - rightPadding,
          sectionLeft:
            sectionBox.x +
            Number.parseFloat(getComputedStyle(section).paddingLeft),
          sectionWidth:
            sectionBox.width -
            Number.parseFloat(getComputedStyle(section).paddingLeft) -
            Number.parseFloat(getComputedStyle(section).paddingRight),
          headingLeft: heading.getBoundingClientRect().x,
          cardLeft: card.getBoundingClientRect().x,
          columnGap: Number.parseFloat(
            getComputedStyle(sectionHeader).columnGap
          ),
        };
      });
      const atWidth = JSON.stringify({ width: viewport.width, ...geometry });
      expect(geometry.contentLeft, atWidth).toBeGreaterThanOrEqual(0);
      expect(
        geometry.contentLeft + geometry.contentWidth,
        atWidth
      ).toBeLessThanOrEqual(viewport.width);
      expect(geometry.headingLeft, atWidth).toBeGreaterThanOrEqual(
        geometry.contentLeft
      );
      expect(geometry.cardLeft, atWidth).toBeGreaterThanOrEqual(
        geometry.contentLeft
      );
    }
  });

  test('keeps layout shift under 0.1 while the hero loads', async ({
    page,
  }) => {
    await page.evaluate(() => document.fonts.ready);
    const cls = await page.evaluate(
      () =>
        new Promise<number>(resolve => {
          let total = 0;
          new PerformanceObserver(list => {
            for (const entry of list.getEntries() as (PerformanceEntry & {
              value: number;
              hadRecentInput: boolean;
            })[]) {
              if (!entry.hadRecentInput) total += entry.value;
            }
          }).observe({ type: 'layout-shift', buffered: true });
          setTimeout(() => resolve(total), 1_500);
        })
    );
    expect(cls).toBeLessThan(0.1);
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

    // The homepage converts through Find me (hero + close).
    // Header sign-up anchors, when present, still land on /signup.
    await expect(
      page.getByRole('button', { name: 'Find me', exact: true })
    ).toHaveCount(2);

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

// User input must survive the transition from native SSR form to client owner.
test.describe('Product claim readiness', () => {
  for (const entry of ['fill', 'keyboard'] as const) {
    test(`preserves server-entered handles through readiness (${entry})`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await interceptAnalytics(page);
      await page.route('**/api/journey/step', route =>
        route.fulfill({ status: 200, body: '{}' })
      );
      await page.route('**/api/handle/check?**', route =>
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: '{"available":true}',
        })
      );
      let releaseAssets = () => {};
      const assetsReleased = new Promise<void>(resolve => {
        releaseAssets = resolve;
      });
      await page.route('**/_next/static/**', async route => {
        if (route.request().resourceType() === 'script') await assetsReleased;
        await route.continue();
      });
      try {
        await page.goto('/product', {
          waitUntil: 'commit',
          timeout: HOMEPAGE_NAVIGATION_TIMEOUT,
        });
        const input = page.locator('#product-handle-input');
        await expect(input).toBeEditable();
        const draft =
          entry === 'fill' ? 'Jov6220EarlyFill' : 'jov6220earlykeys';
        if (entry === 'fill') await input.fill(draft);
        else await input.pressSequentially(draft);
        await expect(input).toHaveValue(draft);
        const normalized = draft.toLowerCase();
        const availability = page.waitForResponse(response => {
          const url = new URL(response.url());
          return (
            url.pathname === '/api/handle/check' &&
            url.searchParams.get('handle') === normalized
          );
        });
        releaseAssets();
        expect((await availability).status()).toBe(200);
        await expect(input).toHaveValue(normalized);
        await expect(page.getByTestId('product-handle-status')).toContainText(
          `@${normalized} is available`
        );
        const handoff = page.waitForRequest(request => {
          const url = new URL(request.url());
          return (
            ['/start', '/signup'].includes(url.pathname) &&
            url.searchParams.get('handle') === normalized
          );
        });
        if (entry === 'fill')
          await page.getByTestId('product-claim-cta').click();
        else await input.press('Enter');
        await handoff;
      } finally {
        releaseAssets();
      }
    });
  }

  test('preserves the native GET handle handoff without JavaScript', async ({
    browser,
    baseURL,
  }) => {
    const context = await browser.newContext({
      baseURL,
      javaScriptEnabled: false,
      viewport: { width: 390, height: 844 },
    });
    try {
      const page = await context.newPage();
      await page.goto('/product', {
        waitUntil: 'domcontentloaded',
        timeout: HOMEPAGE_NAVIGATION_TIMEOUT,
      });
      const form = page.getByTestId('product-claim-form');
      await expect(form).toHaveAttribute('action', '/start');
      await expect(form).toHaveAttribute('method', 'get');
      const input = page.locator('#product-handle-input');
      await expect(input).toHaveAttribute('name', 'handle');
      await input.fill('jov6220native');
      const handoff = page.waitForRequest(request => {
        const url = new URL(request.url());
        return (
          request.method() === 'GET' &&
          url.pathname === '/start' &&
          url.searchParams.get('handle') === 'jov6220native'
        );
      });
      await page.getByTestId('product-claim-cta').click();
      await handoff;
    } finally {
      await context.close();
    }
  });
});
