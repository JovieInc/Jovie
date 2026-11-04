import { HOMEPAGE_COPY } from '@/data/homepageCopy';
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

// Approved 2026-11-02 general homepage: discovery, profile, relationships, role waitlist.
test.describe('Homepage', () => {
  test.beforeEach(async ({ page }) => {
    await interceptAnalytics(page);
    await gotoHomepage(page);
  });

  test('renders the general identity promise with discovery and one invitation request', async ({
    page,
  }) => {
    const hero = page.getByTestId('marketing-section-hero');
    await expect(
      hero.getByRole('heading', { level: 1, name: HOMEPAGE_COPY.hero.headline })
    ).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    await expect(hero.getByText(HOMEPAGE_COPY.hero.subhead)).toBeVisible();
    await expect(
      hero.getByRole('textbox', { name: 'Search your name' })
    ).toBeVisible();
    await expect(
      hero.getByRole('link', { name: HOMEPAGE_COPY.access.label })
    ).toHaveAttribute('href', '#waitlist');
    await expect(page.getByTestId('waitlist-role-form')).toHaveCount(1);
    await expect(page.locator('form[action="/start"]')).toHaveCount(0);
    await expect(hero.getByText(/Tim White|Founder, Jovie/)).toHaveCount(0);
  });

  test('discovery uses public evidence and offers waitlist recovery for no result', async ({
    page,
  }) => {
    await page.route('**/api/profile/search?**', route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: '{"profiles":[{"username":"example-fixture","name":"Example Fixture"}]}',
      })
    );
    await page
      .getByRole('textbox', { name: 'Search your name' })
      .fill('Example Fixture');
    await page.getByRole('button', { name: 'Find me', exact: true }).click();
    await expect(
      page.getByRole('link', { name: /Example Fixture/ })
    ).toHaveAttribute('href', '/example-fixture');
    await page.route('**/api/profile/search?**', route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: '{"profiles":[]}',
      })
    );
    await page
      .getByRole('textbox', { name: 'Search your name' })
      .fill('Unknown Fixture');
    await page.getByRole('button', { name: 'Find me', exact: true }).click();
    await expect(
      page.getByText(/No matching public profile yet/)
    ).toBeVisible();
    await expect(
      page
        .locator('search')
        .getByRole('link', { name: HOMEPAGE_COPY.access.label })
    ).toHaveAttribute('href', '#waitlist');
    await expect(
      page
        .locator('search')
        .getByRole('link', { name: HOMEPAGE_COPY.access.invite })
    ).toHaveAttribute('href', '/signin');
  });

  test('loads readable product evidence at desktop and phone widths without overflow', async ({
    page,
  }) => {
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      for (const image of await page.locator('main img:visible').all()) {
        await image.scrollIntoViewIfNeeded();
        await image.evaluate(async node => {
          const image = node as HTMLImageElement;
          await image.decode();
          if (!image.naturalWidth) throw new Error('Product image failed');
        });
      }
      await expect(
        page.getByRole('heading', { level: 2, name: 'jov.ie/you' })
      ).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth - innerWidth
        )
      ).toBeLessThanOrEqual(1);
      // Inspect the hero while it is in view, after decoding the proof below it.
      await page.evaluate(() => scrollTo(0, 0));
      const snapshot = await inspectRouteDom(page, { surface: 'marketing' });
      expect(
        snapshot.findings.filter(finding =>
          [
            'misaligned-text-stack',
            'clipped-heading',
            'orphaned-line',
          ].includes(finding.kind)
        )
      ).toEqual([]);
    }
  });

  test('mounts discovery, profile, relationships and the one role waitlist in order', async ({
    page,
  }) => {
    const headings = await page
      .locator('main h1:visible, main h2:visible')
      .evaluateAll(nodes => nodes.map(node => node.textContent?.trim()));
    expect(headings.filter(Boolean)).toEqual([
      HOMEPAGE_COPY.hero.headline,
      HOMEPAGE_COPY.loop.headline,
      HOMEPAGE_COPY.ownership.headline,
      HOMEPAGE_COPY.close.headline,
    ]);
    await expect(page.getByRole('radio', { name: 'Myself' })).toHaveCount(1);
    await expect(page.getByTestId('homepage-offer-summary-free')).toHaveCount(
      0
    );
    await expect(page.getByTestId('homepage-offer-summary-pro')).toHaveCount(0);
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
      header.getByRole('link', { name: HOMEPAGE_COPY.access.label })
    ).toHaveAttribute('href', '#waitlist');
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
      { width: 1440, height: 450 },
    ]) {
      await page.setViewportSize(viewport);
      await gotoHomepage(page);
      await page.evaluate(() => document.fonts.ready);

      for (const locator of [
        page.getByRole('heading', { level: 1 }),
        page.locator('#homepage-claim-handle'),
        page
          .getByTestId('marketing-section-hero')
          .getByRole('link', { name: HOMEPAGE_COPY.access.label }),
      ]) {
        await locator.scrollIntoViewIfNeeded();
        await expect(locator).toBeInViewport();
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
      { width: 320, height: 406 },
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

  test('centers the locked hero inside the shared section spine', async ({
    page,
  }) => {
    for (const viewport of [
      { width: 390, height: 844 },
      { width: 768, height: 1024 },
      { width: 1440, height: 900 },
    ]) {
      await page.setViewportSize(viewport);
      await gotoHomepage(page);
      const geometry = await page.evaluate(() => {
        const heading = document.querySelector('main h1');
        const heroContainer = document.querySelector(
          '.homepage-discovery-hero__content'
        );
        const subhead = document.querySelector(
          '.homepage-discovery-hero__subhead'
        );
        const container = document.querySelector(
          '[data-testid="marketing-section-how-it-works"] .ap-section-container'
        );
        if (!heading || !heroContainer || !subhead || !container) {
          throw new Error('The hero and the profile chapter must render');
        }
        return {
          headingCenter:
            heading.getBoundingClientRect().x +
            heading.getBoundingClientRect().width / 2,
          viewportCenter: innerWidth / 2,
          headingWidth: heading.getBoundingClientRect().width,
          headingFontSize: getComputedStyle(heading).fontSize,
          subheadFontSize: getComputedStyle(subhead).fontSize,
          heroSpineLeft: heroContainer.getBoundingClientRect().x,
          heroSpineWidth: heroContainer.getBoundingClientRect().width,
          spineLeft: container.getBoundingClientRect().x,
          spineWidth: container.getBoundingClientRect().width,
        };
      });
      expect(
        Math.abs(geometry.heroSpineLeft - geometry.spineLeft),
        `${viewport.width}px: ${JSON.stringify(geometry)}`
      ).toBeLessThanOrEqual(1);
      expect(
        Math.abs(geometry.heroSpineWidth - geometry.spineWidth)
      ).toBeLessThanOrEqual(1);
      expect(
        Math.abs(geometry.headingCenter - geometry.viewportCenter)
      ).toBeLessThanOrEqual(1);
      expect(geometry.subheadFontSize).toBe('16px');
      if (viewport.width === 1440) {
        expect(geometry.headingFontSize).toBe('80px');
        expect(geometry.headingWidth).toBe(1040);
      }
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

  test('keeps waitlist controls inside their chapter on narrow phones', async ({
    page,
  }) => {
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 844 });
      await gotoHomepage(page);
      const form = page.getByTestId('waitlist-role-form');
      const chapter = await page.locator('.homepage-close__grid').boundingBox();
      expect(chapter).not.toBeNull();
      for (const control of [
        form.getByRole('textbox', { name: 'Name', exact: true }),
        form.getByRole('textbox', { name: 'Email address', exact: true }),
        form.getByRole('button', { name: 'Join', exact: true }),
      ]) {
        await control.scrollIntoViewIfNeeded();
        await expect(control).toBeInViewport();
        const box = await control.boundingBox();
        expect(box).not.toBeNull();
        expect(box!.x, `${width}px control left`).toBeGreaterThanOrEqual(
          chapter!.x - 1
        );
        expect(
          box!.x + box!.width,
          `${width}px control right`
        ).toBeLessThanOrEqual(chapter!.x + chapter!.width + 1);
      }
    }
  });

  test('access actions reach the single role waitlist without an open signup claim', async ({
    page,
  }) => {
    const hero = page.getByTestId('marketing-section-hero');
    await hero.getByRole('link', { name: HOMEPAGE_COPY.access.label }).click();
    await expect(page).toHaveURL(/#waitlist$/);
    await expect(page.getByTestId('waitlist-role-form')).toBeInViewport();
    await expect(
      page.getByRole('button', { name: 'Claim', exact: true })
    ).toHaveCount(0);
    await expect(page.locator('main a[href="/signup"]')).toHaveCount(0);
  });
});

// Read-only discovery and invitation recovery replace the retired handle claim.
test.describe('Homepage discovery recovery', () => {
  test('native discovery works while hydration scripts are still pending', async ({
    page,
  }) => {
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
      const input = page.getByRole('textbox', { name: 'Search your name' });
      await expect(input).toBeEditable();
      await input.fill('Private Pending Fixture');
      await page
        .getByRole('button', { name: 'Find me', exact: true })
        .click({ noWaitAfter: true });
      // The deliberately held scripts prevent load; the native navigation
      // must commit independently of hydration and carry no form controls.
      await page.waitForURL(
        url => url.pathname === '/waitlist' && url.searchParams.size === 0,
        { waitUntil: 'commit' }
      );
      expect(new URL(page.url()).searchParams.size).toBe(0);
    } finally {
      releaseAssets();
    }
  });

  test('native discovery submission reaches the waitlist without leaking the entered name', async ({
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
      await page
        .getByRole('textbox', { name: 'Search your name' })
        .fill('Private Fixture Name');
      await page.getByRole('button', { name: 'Find me', exact: true }).click();
      await expect(page).toHaveURL(
        url => url.pathname === '/waitlist' && url.search === ''
      );
    } finally {
      await context.close();
    }
  });

  test('keeps invitation recovery usable when discovery fails', async ({
    page,
  }) => {
    await interceptAnalytics(page);
    await page.route('**/api/profile/search?**', route =>
      route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: '{"error":"Fixture unavailable"}',
      })
    );
    await gotoHomepage(page);
    await page
      .getByRole('textbox', { name: 'Search your name' })
      .fill('Example Fixture');
    await page.getByRole('button', { name: 'Find me', exact: true }).click();
    await expect(
      page.getByText(/Search is unavailable right now/)
    ).toBeVisible();
    await expect(
      page
        .locator('search')
        .getByRole('link', { name: HOMEPAGE_COPY.access.label })
    ).toHaveAttribute('href', '#waitlist');
    await expect(
      page
        .locator('search')
        .getByRole('link', { name: HOMEPAGE_COPY.access.invite })
    ).toHaveAttribute('href', '/signin');
  });

  test('offers waitlist and invitation recovery without JavaScript', async ({
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
      await expect(
        page
          .locator('noscript')
          .getByRole('link', { name: HOMEPAGE_COPY.access.label })
      ).toHaveAttribute('href', '/waitlist');
      await expect(
        page
          .locator('noscript')
          .getByRole('link', { name: HOMEPAGE_COPY.access.invite })
      ).toHaveAttribute('href', '/signin');
      await expect(page.locator('form[action="/start"]')).toHaveCount(0);
    } finally {
      await context.close();
    }
  });
});
