import {
  HOMEPAGE_EDITORIAL_COPY as COPY,
  HOMEPAGE_INVITE_ANCHOR,
} from '@/data/homepageEditorialCopy';
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
// releases chapters, then the role waitlist form. Invite-only, no prices.
test.describe('Homepage', () => {
  test.beforeEach(async ({ page }) => {
    await interceptAnalytics(page);
    await gotoHomepage(page);
  });

  test('renders the locked headline with one invite action and a live-profile link', async ({
    page,
  }) => {
    const hero = page.getByTestId('marketing-section-hero');
    await expect(
      hero.getByRole('heading', { level: 1, name: COPY.hero.headline })
    ).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);

    const cta = page.getByTestId('homepage-primary-cta');
    await expect(cta).toHaveText(COPY.hero.primaryAction);
    await expect(cta).toHaveAttribute('href', `#${HOMEPAGE_INVITE_ANCHOR}`);
    const live = page.getByTestId('homepage-hero-live-profile');
    await expect(live).toHaveText(COPY.hero.secondaryAction);
    await expect(live).toHaveAttribute(
      'href',
      TIM_WHITE_PROFILE.publicProfilePath
    );
    await expect(page.getByPlaceholder('Search your name')).toHaveCount(0);
  });

  test('offers no signup path and no prices while invite-only', async ({
    page,
  }) => {
    await expect(
      page.locator(
        'main a:visible[href*="/signup"], main a:visible[href*="/start"], main a:visible[href*="/claim"]'
      )
    ).toHaveCount(0);
    await expect(page.locator('#homepage-claim-handle')).toHaveCount(0);
    await expect(page.locator('main')).not.toContainText(/\$\d/);
  });

  test('the hero action scrolls to the role waitlist form', async ({
    page,
  }) => {
    await page.getByTestId('homepage-primary-cta').click();
    await expect(page).toHaveURL(new RegExp(`#${HOMEPAGE_INVITE_ANCHOR}$`));
    const form = page
      .locator(`#${HOMEPAGE_INVITE_ANCHOR}`)
      .getByTestId('waitlist-role-form');
    await expect(form).toBeInViewport();
    await expect(form.getByRole('radio').first()).toBeVisible();
    expect(await form.getByRole('radio').count()).toBeGreaterThan(1);
    await expect(form.getByLabel('Email address')).toBeVisible();
    await expect(
      form.getByRole('heading', { name: COPY.invite.headline })
    ).toBeVisible();
  });

  test('mounts hero, profile, releases, and the invitation close in order', async ({
    page,
  }) => {
    const headings = await page
      .locator('main h1:visible, main h2:visible')
      .evaluateAll(nodes => nodes.map(node => node.textContent?.trim()));
    expect(headings.filter(Boolean)).toEqual([
      COPY.hero.headline,
      COPY.profile.headline,
      COPY.releases.headline,
      COPY.invite.headline,
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
    // Invite-only: the header action scrolls to the on-page invitation form.
    await expect(
      header.getByRole('link', { name: 'Request an Invite' })
    ).toHaveAttribute('href', `/#${HOMEPAGE_INVITE_ANCHOR}`);
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

// The anchor must work from the server-rendered HTML alone.
test.describe('Homepage without JavaScript', () => {
  test('keeps the hero action and the invitation form reachable', async ({
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
        `#${HOMEPAGE_INVITE_ANCHOR}`
      );
      await expect(
        page
          .locator(`#${HOMEPAGE_INVITE_ANCHOR}`)
          .getByTestId('waitlist-role-form')
      ).toBeAttached();
    } finally {
      await context.close();
    }
  });
});
