import { HOMEPAGE_COPY } from '@/data/homepageCopy';
import { HOMEPAGE_FAN_STATES_COPY } from '@/data/homepageFanStatesCopy';
import { PUBLIC_WAITLIST_URL } from '@/data/homepageFrontDoorCta';
import { expect, test } from './setup';
import { inspectRouteDom } from './utils/route-dom-detector';
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

// Artist-profile homepage (EVENT 2026-10-20): claim + live profile, three
// real fan states, then the free offer and the same claim.
test.describe('Homepage', () => {
  test.beforeEach(async ({ page }) => {
    await interceptAnalytics(page);
    await gotoHomepage(page);
  });

  test('renders the artist-profile hero with the jov.ie/ claim as the one primary action', async ({
    page,
  }) => {
    const hero = page.getByTestId('marketing-section-hero');
    await expect(
      hero.getByRole('heading', { level: 1, name: HOMEPAGE_COPY.hero.headline })
    ).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);

    const cta = page.getByTestId('homepage-primary-cta');
    await expect(cta).toBeVisible();
    await expect(cta).toHaveText(HOMEPAGE_COPY.hero.claim.action);
    await expect(page.getByTestId('homepage-claim-form')).toHaveAttribute(
      'action',
      '/start'
    );
    await expect(hero.getByText(HOMEPAGE_COPY.hero.supportNote)).toBeVisible();
    // The proof is the real product: a registry capture of a live profile,
    // loaded eagerly as the LCP image.
    const profile = hero.getByRole('img', {
      name: HOMEPAGE_COPY.hero.profile.alt,
    });
    await expect(profile).toBeVisible();
    expect(
      await profile.evaluate(image => (image as HTMLImageElement).naturalWidth)
    ).toBeGreaterThan(0);
    await expect(page.getByText('Request access')).toHaveCount(0);
  });

  test('claiming a handle hands off with the handle (/start, or /signup while waitlisted)', async ({
    page,
  }) => {
    await page.route('**/api/handle/**', route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: '{"available":true}',
      })
    );
    const startRequest = page.waitForRequest(
      request =>
        ['/start', '/signup'].includes(new URL(request.url()).pathname) &&
        new URL(request.url()).searchParams.get('handle') === 'averyclaims',
      { timeout: 15_000 }
    );
    await page.locator('#homepage-claim-handle').fill('averyclaims');
    await page.getByTestId('homepage-primary-cta').click();
    await startRequest;
  });

  test('shows real profile states that scroll on phones without page overflow', async ({
    page,
  }) => {
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 });
      const gallery = page.getByTestId('homepage-fan-states');
      await gallery.scrollIntoViewIfNeeded();
      for (const state of HOMEPAGE_FAN_STATES_COPY.states) {
        const image = gallery.getByRole('img', { name: state.alt });
        await image.scrollIntoViewIfNeeded();
        await expect(image).toBeVisible();
        await expect(
          gallery.getByText(state.title, { exact: true })
        ).toBeVisible();
      }
      const overflow = await page.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth
      );
      expect(overflow).toBeLessThanOrEqual(1);
      const snapshot = await inspectRouteDom(page, { surface: 'marketing' });
      expect(
        snapshot.findings.filter(finding =>
          ['misaligned-text-stack', 'clipped-heading'].includes(finding.kind)
        )
      ).toEqual([]);
    }
  });

  test('mounts hero, profile states, and the offer close in order', async ({
    page,
  }) => {
    const headings = await page
      .locator('main h1:visible, main h2:visible')
      .evaluateAll(nodes => nodes.map(node => node.textContent?.trim()));
    expect(headings.filter(Boolean)).toEqual([
      HOMEPAGE_COPY.hero.headline,
      HOMEPAGE_FAN_STATES_COPY.headline,
      HOMEPAGE_COPY.offer.headline,
    ]);
    await expect(page.getByTestId('homepage-close-claim-cta')).toHaveText(
      HOMEPAGE_COPY.hero.claim.action
    );
    await expect(page.getByTestId('homepage-offer-summary')).toContainText(
      '$0'
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
      header.getByRole('link', { name: 'Claim your profile' })
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

  test('keeps the hero copy and claim inside the viewport on phones and at 200% zoom', async ({
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
        page.locator('#homepage-claim-handle'),
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

  test('paints the whole two-line headline without clipping descenders', async ({
    page,
  }) => {
    for (const viewport of [
      { width: 390, height: 844 },
      { width: 768, height: 1024 },
      { width: 1440, height: 900 },
    ]) {
      await page.setViewportSize(viewport);
      await gotoHomepage(page);
      await page.evaluate(() => document.fonts.ready);
      const heading = page.getByRole('heading', { level: 1 });
      await expect(heading).toHaveText(HOMEPAGE_COPY.hero.headline);
      const box = await heading.evaluate(el => ({
        scrollHeight: el.scrollHeight,
        clientHeight: el.clientHeight,
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth,
      }));
      const atWidth = `${viewport.width}px: ${JSON.stringify(box)}`;
      expect(box.scrollHeight, atWidth).toBeLessThanOrEqual(
        box.clientHeight + 1
      );
      expect(box.scrollWidth, atWidth).toBeLessThanOrEqual(box.clientWidth + 1);
    }
  });

  test('aligns the hero with the shared section spine', async ({ page }) => {
    for (const viewport of [
      { width: 390, height: 844 },
      { width: 768, height: 1024 },
      { width: 1440, height: 900 },
    ]) {
      await page.setViewportSize(viewport);
      await gotoHomepage(page);
      const geometry = await page.evaluate(() => {
        const heading = document.querySelector('main h1');
        const container = document.querySelector(
          '[data-testid="marketing-section-product-gallery"] .ap-section-container'
        );
        if (!heading || !container) {
          throw new Error('The hero and the product gallery must render');
        }
        return {
          headingLeft: heading.getBoundingClientRect().x,
          spineLeft: container.getBoundingClientRect().x,
        };
      });
      expect(
        Math.abs(geometry.headingLeft - geometry.spineLeft),
        `${viewport.width}px: ${JSON.stringify(geometry)}`
      ).toBeLessThanOrEqual(1);
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

    // The homepage converts through the jov.ie/you claim (hero + close).
    // Header sign-up anchors, when present, still land on /signup.
    await expect(
      page.getByRole('button', { name: 'Claim', exact: true })
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
test.describe('Homepage claim readiness', () => {
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
        await page.goto('/', {
          waitUntil: 'commit',
          timeout: HOMEPAGE_NAVIGATION_TIMEOUT,
        });
        const input = page.locator('#homepage-claim-handle');
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
        await expect(page.getByTestId('homepage-handle-status')).toContainText(
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
          await page.getByTestId('homepage-primary-cta').click();
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
      await page.goto('/', {
        waitUntil: 'domcontentloaded',
        timeout: HOMEPAGE_NAVIGATION_TIMEOUT,
      });
      const form = page.getByTestId('homepage-claim-form');
      await expect(form).toHaveAttribute('action', '/start');
      await expect(form).toHaveAttribute('method', 'get');
      const input = page.locator('#homepage-claim-handle');
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
      await page.getByTestId('homepage-primary-cta').click();
      await handoff;
    } finally {
      await context.close();
    }
  });
});
