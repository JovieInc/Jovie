import {
  HOMEPAGE_EDITORIAL_COPY as COPY,
  HOMEPAGE_INVITE_ANCHOR,
} from '@/data/homepageEditorialCopy';
import { getClaimProfileIntent } from '@/data/marketingCtaIntents';
import { TIM_WHITE_PROFILE } from '@/lib/tim-white';
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

// Editorial homepage (Tim, 2026-11-03): the music-line hero, the profile and
// releases chapters, then the claim-your-profile close into /start (Tim,
// 2026-11-12: "Switch it"). No prices.
test.describe('Homepage', () => {
  test.beforeEach(async ({ page }) => {
    await interceptAnalytics(page);
    await gotoHomepage(page);
  });

  test('renders the locked headline with one claim action and a live-profile link', async ({
    page,
  }) => {
    const hero = page.getByTestId('marketing-section-hero');
    await expect(
      hero.getByRole('heading', { level: 1, name: COPY.hero.headline })
    ).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);

    const claim = getClaimProfileIntent();
    const cta = page.getByTestId('homepage-primary-cta');
    await expect(cta).toHaveText(claim.label);
    await expect(cta).toHaveAttribute('href', claim.href);
    const live = page.getByTestId('homepage-hero-live-profile');
    await expect(live).toHaveText(COPY.hero.secondaryAction);
    await expect(live).toHaveAttribute(
      'href',
      TIM_WHITE_PROFILE.publicProfilePath
    );
    await expect(page.getByPlaceholder('Search your name')).toHaveCount(0);
  });

  test('sends every claim action to /start and shows no prices', async ({
    page,
  }) => {
    await expect(
      page.locator(
        'main a:visible[href*="/signup"], main a:visible[href*="/claim"]'
      )
    ).toHaveCount(0);
    const startLinks = page.locator('main a:visible[href^="/start"]');
    expect(await startLinks.count()).toBeGreaterThan(0);
    for (const href of await startLinks.evaluateAll(links =>
      links.map(link => link.getAttribute('href'))
    )) {
      expect(href).toBe('/start');
    }
    await expect(page.locator('#homepage-claim-handle')).toHaveCount(0);
    await expect(page.locator('main')).not.toContainText(/\$\d/);
  });

  test('closes on the claim action into /start', async ({ page }) => {
    const close = page.locator(`#${HOMEPAGE_INVITE_ANCHOR}`);
    await close.scrollIntoViewIfNeeded();
    await expect(
      close.getByRole('heading', { name: COPY.claim.headline })
    ).toBeVisible();
    await expect(close.getByTestId('waitlist-role-form')).toHaveCount(0);
    const cta = close.getByTestId('homepage-close-cta');
    await expect(cta).toBeVisible();
    await expect(cta).toHaveAttribute('href', getClaimProfileIntent().href);
  });

  test('mounts hero, profile, releases, and the claim close in order', async ({
    page,
  }) => {
    const headings = await page
      .locator('main h1:visible, main h2:visible')
      .evaluateAll(nodes => nodes.map(node => node.textContent?.trim()));
    expect(headings.filter(Boolean)).toEqual([
      COPY.hero.headline,
      COPY.profile.headline,
      COPY.releases.headline,
      COPY.claim.headline,
    ]);
    await expect(
      page.getByRole('img', { name: COPY.profile.alt })
    ).toBeVisible();
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
    // The header action enters /start with the shared claim intent.
    await expect(
      header.getByRole('link', { name: getClaimProfileIntent().label })
    ).toHaveAttribute('href', getClaimProfileIntent().href);
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

  test('keeps the headline and action inside the viewport on phones and at 200% zoom', async ({
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

      await expect(page.getByRole('heading', { level: 1 })).toBeInViewport();
      for (const locator of [
        page.getByRole('heading', { level: 1 }),
        page.getByTestId('homepage-primary-cta'),
      ]) {
        // The action may sit below a very short fold; it must still reflow
        // inside the width.
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

  test('paints the whole headline without clipping descenders', async ({
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
      await expect(heading).toHaveText(COPY.hero.headline);
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

  test('aligns the chapters to the shared section spine', async ({ page }) => {
    for (const viewport of [
      { width: 390, height: 844 },
      { width: 768, height: 1024 },
      { width: 1440, height: 900 },
    ]) {
      await page.setViewportSize(viewport);
      await gotoHomepage(page);
      const lefts = await page.evaluate(() =>
        ['feature-split', 'product-gallery', 'cta'].map(id => {
          const container = document.querySelector(
            `[data-testid="marketing-section-${id}"] .ap-section-container`
          );
          if (!container) throw new Error(`The ${id} chapter must render`);
          return container.getBoundingClientRect().x;
        })
      );
      for (const left of lefts) {
        expect(
          Math.abs(left - lefts[0]),
          `${viewport.width}px: ${JSON.stringify(lefts)}`
        ).toBeLessThanOrEqual(1);
      }
    }
  });

  test('keeps every section and mockup inside the one content box', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    // Static geometry: the scroll-driven fade-ups scale what they reveal.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    for (const viewport of [
      { width: 390, height: 844 },
      { width: 1024, height: 900 },
      { width: 1280, height: 900 },
      { width: 1440, height: 900 },
      { width: 1512, height: 900 },
      { width: 1920, height: 1080 },
    ]) {
      await page.setViewportSize(viewport);
      await gotoHomepage(page);
      await page.evaluate(() => document.fonts.ready);
      const report = await page.evaluate(() => {
        const out: string[] = [];
        const desktop = window.innerWidth >= 1024;
        const sections = document.querySelectorAll<HTMLElement>('.hv3');
        if (sections.length < 4) out.push(`only ${sections.length} sections`);
        for (const section of sections) {
          const rule = section.querySelector<HTMLElement>(':scope > .hv3-rule');
          if (!rule) continue;
          const side = Number.parseFloat(getComputedStyle(rule).paddingLeft);
          const box = section.getBoundingClientRect();
          const left = box.left + side;
          const right = box.right - side;
          const name = section.className;
          // Everything a reader sees as a pane or a column stays in the box.
          for (const el of section.querySelectorAll<HTMLElement>(
            '.hv3-stage, .hv3-window, .hv3-lift, .hv3-plate, .hv3-phone, .hv3-captions, .hv3-moment, .hv3-sheet, .hv3-steps, .hv3-index'
          )) {
            if (
              el.closest('[hidden]') ||
              getComputedStyle(el).display === 'none'
            )
              continue;
            const r = el.getBoundingClientRect();
            if (r.width === 0) continue;
            // On phones a stage crops its mockup at the box: measure the
            // visible part.
            const clip = el.closest<HTMLElement>('.hv3-stage');
            const c = clip && clip !== el ? clip.getBoundingClientRect() : null;
            const l = c ? Math.max(r.left, c.left) : r.left;
            const rr = c ? Math.min(r.right, c.right) : r.right;
            if (l < left - 1 || rr > right + 1) {
              out.push(
                `${name} ${el.className}: ${l.toFixed(1)}-${rr.toFixed(1)} outside ${left.toFixed(1)}-${right.toFixed(1)}`
              );
            }
          }
          // A full-width stage is the box itself, edge to edge.
          for (const stage of section.querySelectorAll<HTMLElement>(
            '.hv3-stage--hero, .hv3-stage--releases'
          )) {
            const r = stage.getBoundingClientRect();
            if (Math.abs(r.left - left) > 1 || Math.abs(r.right - right) > 1) {
              out.push(
                `${name} ${stage.className}: ${r.left.toFixed(1)}-${r.right.toFixed(1)} is not the box ${left.toFixed(1)}-${right.toFixed(1)}`
              );
            }
          }
          // On desktop the hero window and the release panes fill the box.
          if (!desktop) continue;
          for (const sel of [
            '.hv3-rig--hero .hv3-window',
            '.hv3-rig--releases',
          ]) {
            const el = section.querySelector<HTMLElement>(sel);
            if (!el) continue;
            const r = el.getBoundingClientRect();
            if (Math.abs(r.left - left) > 1 || Math.abs(r.right - right) > 1) {
              out.push(
                `${name} ${sel}: ${r.left.toFixed(1)}-${r.right.toFixed(1)} does not fill ${left.toFixed(1)}-${right.toFixed(1)}`
              );
            }
          }
        }
        return out;
      });
      expect(report, `${viewport.width}px`).toEqual([]);
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
});

// The claim actions must work from the server-rendered HTML alone.
test.describe('Homepage without JavaScript', () => {
  test('keeps the hero action and the claim close reachable', async ({
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
      await expect(page.getByTestId('homepage-primary-cta')).toHaveAttribute(
        'href',
        getClaimProfileIntent().href
      );
      await expect(
        page
          .locator(`#${HOMEPAGE_INVITE_ANCHOR}`)
          .getByTestId('homepage-close-cta')
      ).toHaveAttribute('href', getClaimProfileIntent().href);
    } finally {
      await context.close();
    }
  });
});
