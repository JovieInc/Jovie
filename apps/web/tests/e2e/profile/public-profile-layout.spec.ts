import path from 'node:path';
import { expect, type Page, test } from '@playwright/test';
import {
  resetOwnedOutputDirectory,
  resolveFixedOwnedOutputDirectory,
} from '../../../scripts/owned-output-path';
import { installPublicRouteMocks } from '../utils/public-surface-helpers';
import { waitForHydration } from '../utils/smoke-test-utils';

type LayoutViewport = {
  readonly id: string;
  readonly width: number;
  readonly height: number;
  readonly isMobile: boolean;
};

const PROFILE_HANDLE =
  process.env.PUBLIC_PROFILE_LAYOUT_HANDLE?.trim() || 'tim';
const APPROVAL_SCREENSHOTS =
  process.env.PROFILE_LAYOUT_APPROVAL_SCREENSHOTS === '1';
const CONFIGURED_APPROVAL_SCREENSHOT_DIR =
  process.env.PROFILE_LAYOUT_APPROVAL_DIR?.trim() ||
  '.context/public-profile-layout-approval';
const APPROVAL_OUTPUT_BASE = path.join(repoRoot(), '.context');
const APPROVAL_OUTPUT_SEGMENT = 'public-profile-layout-approval';
const APPROVAL_SCREENSHOT_DIR = resolveFixedOwnedOutputDirectory(
  APPROVAL_OUTPUT_BASE,
  APPROVAL_OUTPUT_SEGMENT,
  path.resolve(repoRoot(), CONFIGURED_APPROVAL_SCREENSHOT_DIR),
  'PROFILE_LAYOUT_APPROVAL_DIR'
);
const VIEWPORTS: readonly LayoutViewport[] = [
  { id: '320x568', width: 320, height: 568, isMobile: true },
  { id: '360x740', width: 360, height: 740, isMobile: true },
  { id: '375x667', width: 375, height: 667, isMobile: true },
  { id: '390x844', width: 390, height: 844, isMobile: true },
  { id: '414x896', width: 414, height: 896, isMobile: true },
  { id: '430x932', width: 430, height: 932, isMobile: true },
  { id: '768x1024', width: 768, height: 1024, isMobile: false },
  { id: '1024x768', width: 1024, height: 768, isMobile: false },
  { id: '1280x800', width: 1280, height: 800, isMobile: false },
  { id: '1440x900', width: 1440, height: 900, isMobile: false },
];

const READY_SELECTORS = [
  '[data-testid="profile-compact-surface"]',
  '[data-testid="profile-header"]',
  '[data-testid="profile-compact-shell"]',
] as const;

function repoRoot() {
  return process.cwd().endsWith('/apps/web')
    ? path.resolve(process.cwd(), '../..')
    : process.cwd();
}

async function waitForAnyVisible(page: Page, selectors: readonly string[]) {
  await expect
    .poll(
      async () => {
        for (const selector of selectors) {
          if (
            await page
              .locator(selector)
              .first()
              .isVisible()
              .catch(() => false)
          ) {
            return selector;
          }
        }
        return null;
      },
      {
        timeout: 60_000,
        message: `Expected one of these selectors to render: ${selectors.join(', ')}`,
      }
    )
    .not.toBeNull();
}

async function prepareProfilePage(page: Page, viewport: LayoutViewport) {
  await installPublicRouteMocks(page);
  await page.route('**/api/px', route =>
    route.fulfill({ status: 204, body: '' })
  );
  await page.setViewportSize({
    width: viewport.width,
    height: viewport.height,
  });

  const response = await page.goto(`/${PROFILE_HANDLE}`, {
    waitUntil: 'domcontentloaded',
    timeout: 120_000,
  });
  expect(
    response?.status() ?? 0,
    `/${PROFILE_HANDLE} should load`
  ).toBeLessThan(500);
  await waitForHydration(page);
  await waitForAnyVisible(page, READY_SELECTORS);
  await page
    .waitForLoadState('networkidle', { timeout: 10_000 })
    .catch(() => {});
}

async function prepareProfileAdmissionFixture(
  page: Page,
  viewport: Pick<LayoutViewport, 'width' | 'height'>,
  longName = false
) {
  await installPublicRouteMocks(page);
  await page.setViewportSize({
    width: viewport.width,
    height: viewport.height,
  });

  const response = await page.goto(
    `/renders/profile-admission?layout=public${longName ? '&name=long' : ''}`,
    {
      waitUntil: 'domcontentloaded',
      timeout: 120_000,
    }
  );
  expect(response?.status() ?? 0, 'profile admission fixture should load').toBe(
    200
  );
  await waitForHydration(page);
  await waitForAnyVisible(page, READY_SELECTORS);
  await page
    .waitForLoadState('networkidle', { timeout: 10_000 })
    .catch(() => {});
}

async function saveApprovalScreenshot(page: Page, viewport: LayoutViewport) {
  if (!APPROVAL_SCREENSHOTS) return;

  await page.screenshot({
    path: path.join(APPROVAL_SCREENSHOT_DIR, `${viewport.id}.png`),
    fullPage: false,
  });
}

async function collectLayoutMetrics(page: Page) {
  return page.evaluate(() => {
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const documentWidth = document.documentElement.scrollWidth;
    const bodyWidth = document.body.scrollWidth;
    const isVisibleBox = (element: HTMLElement | null) => {
      if (!element) return false;
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return (
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        rect.width > 0 &&
        rect.height > 0
      );
    };
    const shell = document.querySelector<HTMLElement>(
      '[data-testid="profile-compact-shell"]'
    );
    const desktopShell = document.querySelector<HTMLElement>(
      '[data-testid="profile-desktop-shell"]'
    );
    const activeShell = isVisibleBox(desktopShell)
      ? desktopShell
      : isVisibleBox(shell)
        ? shell
        : (shell ?? desktopShell);
    const cover = document.querySelector<HTMLElement>(
      '[data-testid="profile-cover"], [data-testid="profile-desktop-cover"]'
    );
    const scroll = document.querySelector<HTMLElement>(
      '[data-testid="profile-content-scroll"]'
    );
    const nav = document.querySelector<HTMLElement>(
      '[data-testid="profile-tab-bar"]'
    );
    const navRail = document.querySelector<HTMLElement>(
      '[data-testid="profile-bottom-nav"]'
    );
    const desktopCover = document.querySelector<HTMLElement>(
      '[data-testid="profile-desktop-cover"]'
    );
    const desktopAlerts = document.querySelector<HTMLElement>(
      '[data-testid="profile-desktop-alerts-card"]'
    );
    const desktopSecondaryGrid = document.querySelector<HTMLElement>(
      '[data-testid="profile-desktop-secondary-grid"]'
    );
    const compactSurface = document.querySelector<HTMLElement>(
      '[data-testid="profile-compact-surface"]'
    );
    const desktopSurface = document.querySelector<HTMLElement>(
      '[data-testid="profile-desktop-surface"]'
    );
    const root = isVisibleBox(desktopSurface)
      ? desktopSurface
      : isVisibleBox(compactSurface)
        ? compactSurface
        : (compactSurface ?? desktopSurface ?? activeShell);

    const box = (element: HTMLElement | null) => {
      if (!element) return null;
      const rect = element.getBoundingClientRect();
      return {
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        left: rect.left,
        width: rect.width,
        height: rect.height,
      };
    };

    const visibleLargeImages = Array.from(
      activeShell?.querySelectorAll<HTMLImageElement>('img') ?? []
    )
      .map(img => {
        const rect = img.getBoundingClientRect();
        const style = window.getComputedStyle(img);
        return {
          alt: img.alt,
          width: rect.width,
          height: rect.height,
          complete: img.complete,
          naturalWidth: img.naturalWidth,
          naturalHeight: img.naturalHeight,
          objectFit: style.objectFit,
        };
      })
      .filter(img => img.width >= 40 && img.height >= 40);

    const actionTargets = Array.from(
      document.querySelectorAll<HTMLElement>(
        [
          '[data-testid="profile-home-alerts-row"]',
          '[data-testid="profile-home-alerts-fallback-card"]',
          '[data-testid="profile-tab-bar"] button',
          'article a',
          'article button',
        ].join(', ')
      )
    )
      .map(element => {
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        return {
          label:
            element.getAttribute('aria-label') ??
            element.textContent?.replace(/\s+/g, ' ').trim() ??
            element.tagName,
          display: style.display,
          visibility: style.visibility,
          width: rect.width,
          height: rect.height,
        };
      })
      .filter(
        target =>
          target.display !== 'none' &&
          target.visibility !== 'hidden' &&
          target.width > 0 &&
          target.height > 0
      );

    const textTargets = Array.from(
      document.querySelectorAll<HTMLElement>(
        [
          '[data-testid="profile-header"]',
          '[data-testid="profile-hero-identity-block"]',
          '[data-testid$="-title"]',
        ].join(', ')
      )
    ).map(element => ({
      testId: element.getAttribute('data-testid'),
      scrollWidth: element.scrollWidth,
      clientWidth: element.clientWidth,
    }));

    const homeRail = document.querySelector<HTMLElement>(
      '[data-testid="profile-home-rail"]'
    );

    return {
      viewportWidth,
      viewportHeight,
      horizontalOverflow: Math.max(documentWidth, bodyWidth) - viewportWidth,
      scrollX: window.scrollX,
      scrollY: window.scrollY,
      root: box(root),
      shell: box(activeShell),
      cover: box(cover),
      media: box(
        document.querySelector<HTMLElement>('.profile-cover-home-media')
      ),
      identity: box(
        document.querySelector<HTMLElement>(
          '[data-testid="profile-hero-identity-block"]'
        )
      ),
      homeRail: box(homeRail),
      desktopCover: box(desktopCover),
      desktopAlerts: box(desktopAlerts),
      desktopSecondaryGrid: box(desktopSecondaryGrid),
      scroll: box(scroll),
      nav: box(nav),
      navRail: box(navRail),
      visibleLargeImages,
      actionTargets,
      textTargets,
    };
  });
}

test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Public profile /tim layout hardening @regression', () => {
  test.describe.configure({
    mode: APPROVAL_SCREENSHOTS ? 'serial' : 'default',
  });
  test.setTimeout(180_000);

  test.beforeAll(async () => {
    if (!APPROVAL_SCREENSHOTS) return;

    await resetOwnedOutputDirectory(
      APPROVAL_OUTPUT_BASE,
      APPROVAL_OUTPUT_SEGMENT,
      'PROFILE_LAYOUT_APPROVAL_DIR'
    );
  });

  test('390x844 compact dock separates visual and touch geometry', async ({
    page,
  }) => {
    const viewport = VIEWPORTS.find(candidate => candidate.id === '390x844');
    expect(viewport).toBeDefined();
    await prepareProfilePage(page, viewport as LayoutViewport);

    const metrics = await collectLayoutMetrics(page);
    expect(metrics.navRail?.height ?? 0).toBeGreaterThanOrEqual(30);
    expect(metrics.navRail?.height ?? 0).toBeLessThanOrEqual(34);

    const tabNames = new Set(['Home', 'Music', 'Events', 'About']);
    const tabTargets = metrics.actionTargets.filter(target =>
      tabNames.has(target.label)
    );
    expect(tabTargets).toHaveLength(4);
    for (const target of tabTargets) {
      expect(
        target.width,
        `${target.label} should stay at least 44px wide`
      ).toBeGreaterThanOrEqual(44);
      expect(
        target.height,
        `${target.label} should stay at least 44px tall`
      ).toBeGreaterThanOrEqual(44);
    }
  });

  test('long identity and wrapped location grow the cover without clipping the card', async ({
    page,
  }, testInfo) => {
    const viewport = { width: 320, height: 568 };
    await prepareProfileAdmissionFixture(page, viewport, true);

    const location = page
      .getByTestId('profile-hero-metadata-row')
      .locator('span')
      .last();
    await expect(location).toBeVisible();
    await location.evaluate(element => {
      element.textContent = 'Northwest Territories and the Pacific Northwest';
    });

    const metrics = await collectLayoutMetrics(page);
    expect(metrics.cover, 'edge fixture cover is required').not.toBeNull();
    expect(metrics.media, 'edge fixture media is required').not.toBeNull();
    expect(
      metrics.identity,
      'edge fixture identity is required'
    ).not.toBeNull();
    expect(
      metrics.homeRail,
      'edge fixture home rail is required'
    ).not.toBeNull();

    const cover = metrics.cover;
    const media = metrics.media;
    const identity = metrics.identity;
    const homeRail = metrics.homeRail;
    if (!cover || !media || !identity || !homeRail) {
      throw new Error('edge fixture lost a required mobile geometry node');
    }

    const edgeGeometry = await page.evaluate(() => {
      const read = (selector: string) => {
        const element = document.querySelector<HTMLElement>(selector);
        if (!element) return null;
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return {
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom,
          height: rect.height,
          width: rect.width,
          lineHeight: Number.parseFloat(style.lineHeight),
          scrollWidth: element.scrollWidth,
          clientWidth: element.clientWidth,
          scrollHeight: element.scrollHeight,
          clientHeight: element.clientHeight,
        };
      };

      return {
        name: read('[data-testid="profile-identity-link"]'),
        identity: read('[data-testid="profile-hero-identity-block"]'),
        metadata: read('[data-testid="profile-hero-metadata-row"]'),
        location: read(
          '[data-testid="profile-hero-metadata-row"] span:last-child'
        ),
      };
    });

    expect(edgeGeometry.name).not.toBeNull();
    expect(edgeGeometry.location).not.toBeNull();
    expect(edgeGeometry.name!.right).toBeLessThanOrEqual(identity.right + 1);
    expect(edgeGeometry.location!.right).toBeLessThanOrEqual(
      identity.right + 1
    );
    expect(edgeGeometry.location!.height).toBeGreaterThan(
      edgeGeometry.location!.lineHeight + 1
    );
    expect(
      edgeGeometry.location!.scrollWidth - edgeGeometry.location!.clientWidth
    ).toBeLessThanOrEqual(2);
    expect(
      edgeGeometry.location!.scrollHeight - edgeGeometry.location!.clientHeight
    ).toBeLessThanOrEqual(2);
    expect(metrics.horizontalOverflow).toBeLessThanOrEqual(1);
    expect(media.height).toBeCloseTo(220, 0);
    expect(identity.bottom).toBeLessThanOrEqual(cover.bottom + 1);
    expect(homeRail.top).toBeGreaterThanOrEqual(identity.bottom);
    expect(homeRail.top - cover.bottom).toBeLessThanOrEqual(8);
    expect(cover.height - (media.height + identity.height)).toBeCloseTo(0, 0);

    const screenshotPath = testInfo.outputPath(
      'jov6254-long-name-wrapped-location-320x568.png'
    );
    await page.screenshot({ path: screenshotPath, fullPage: false });
    await testInfo.attach('long-name-wrapped-location-320x568', {
      path: screenshotPath,
      contentType: 'image/png',
    });
  });

  test('200% text zoom keeps the media token and card ordering at narrow mobile', async ({
    page,
  }, testInfo) => {
    const viewport = { width: 320, height: 568 };
    await prepareProfileAdmissionFixture(page, viewport);
    await page.addStyleTag({ content: 'html { font-size: 200%; }' });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(100);
    await expect
      .poll(
        () =>
          page
            .getByTestId('profile-compact-surface')
            .getAttribute('data-profile-overflow-mode'),
        { timeout: 5_000 }
      )
      .toBe('scroll');

    const metrics = await collectLayoutMetrics(page);
    expect(metrics.cover, '200% fixture cover is required').not.toBeNull();
    expect(metrics.media, '200% fixture media is required').not.toBeNull();
    expect(
      metrics.identity,
      '200% fixture identity is required'
    ).not.toBeNull();
    expect(
      metrics.homeRail,
      '200% fixture home rail is required'
    ).not.toBeNull();

    const cover = metrics.cover;
    const media = metrics.media;
    const identity = metrics.identity;
    const homeRail = metrics.homeRail;
    if (!cover || !media || !identity || !homeRail) {
      throw new Error('200% fixture lost a required mobile geometry node');
    }

    expect(metrics.horizontalOverflow).toBeLessThanOrEqual(1);
    expect(media.height).toBeCloseTo(220, 0);
    expect(identity.bottom).toBeLessThanOrEqual(cover.bottom + 1);
    expect(homeRail.top).toBeGreaterThanOrEqual(identity.bottom);
    expect(homeRail.top - cover.bottom).toBeLessThanOrEqual(8);
    expect(cover.height - (media.height + identity.height)).toBeCloseTo(0, 0);

    const screenshotPath = testInfo.outputPath(
      'jov6254-text-zoom-200-320x568.png'
    );
    await page.screenshot({ path: screenshotPath, fullPage: false });
    await testInfo.attach('text-zoom-200-320x568', {
      path: screenshotPath,
      contentType: 'image/png',
    });
  });

  test('200% text zoom keeps the primary card and CTA keyboard reachable above the dock', async ({
    page,
  }) => {
    const viewport = { width: 320, height: 568 };
    await prepareProfileAdmissionFixture(page, viewport);
    await page.addStyleTag({ content: 'html { font-size: 200%; }' });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(100);
    await expect
      .poll(
        () =>
          page
            .getByTestId('profile-compact-surface')
            .getAttribute('data-profile-overflow-mode'),
        { timeout: 5_000 }
      )
      .toBe('scroll');

    const pac = page.getByTestId('profile-pac');
    const action = pac.getByRole('link', { name: /^(Play|Listen)/i }).first();
    await expect(pac, '200% fixture primary card is required').toHaveCount(1);
    await expect(action, '200% fixture primary CTA is required').toHaveCount(1);
    await expect(action).toHaveAttribute('href', /^\//);

    await page.evaluate(() => {
      const link = document.querySelector<HTMLElement>(
        '[data-testid="profile-pac"] a[href]'
      );
      if (!link) throw new Error('200% fixture primary CTA is missing');
      const pageWindow = window as typeof window & {
        __jov6254PrimaryCtaActivated?: boolean;
      };
      pageWindow.__jov6254PrimaryCtaActivated = false;
      link.addEventListener(
        'click',
        event => {
          event.preventDefault();
          pageWindow.__jov6254PrimaryCtaActivated = true;
        },
        { once: true }
      );
    });

    // Focus is the browser's keyboard path: the containing public profile must
    // scroll the focused CTA into the viewport rather than leaving it behind a
    // zero-height content remainder or the fixed dock.
    await action.focus();
    await page.waitForTimeout(100);
    const reachability = await page.evaluate(() => {
      const read = (selector: string) => {
        const element = document.querySelector<HTMLElement>(selector);
        if (!element) return null;
        const rect = element.getBoundingClientRect();
        return {
          top: rect.top,
          bottom: rect.bottom,
          left: rect.left,
          right: rect.right,
          width: rect.width,
          height: rect.height,
        };
      };
      const action = read('[data-testid="profile-pac"] a[href]');
      const pac = read('[data-testid="profile-pac"]');
      const dock = read('[data-testid="profile-tab-bar"]');
      const scrollHost =
        document.querySelector<HTMLElement>('.profile-viewport');
      const contentScroll = document.querySelector<HTMLElement>(
        '[data-testid="profile-content-scroll"]'
      );
      const actionIsAboveDock = Boolean(
        action &&
          dock &&
          action.bottom > 0 &&
          action.top < window.innerHeight &&
          action.bottom <= dock.top - 4 &&
          action.left >= -1 &&
          action.right <= window.innerWidth + 1
      );
      const pacIsAboveDock = Boolean(
        pac &&
          dock &&
          pac.bottom > 0 &&
          pac.top < window.innerHeight &&
          pac.bottom <= dock.top - 4
      );

      return {
        action,
        pac,
        dock,
        actionIsAboveDock,
        pacIsAboveDock,
        active:
          document.activeElement ===
          document.querySelector('[data-testid="profile-pac"] a[href]'),
        documentScrollTop: window.scrollY,
        documentScrollHeight: document.documentElement.scrollHeight,
        viewportScrollTop: scrollHost?.scrollTop ?? null,
        viewportScrollHeight: scrollHost?.scrollHeight ?? null,
        contentScrollTop: contentScroll?.scrollTop ?? null,
        contentScrollHeight: contentScroll?.scrollHeight ?? null,
      };
    });

    expect(reachability.active, 'keyboard focus should remain on the CTA').toBe(
      true
    );
    expect(
      reachability.actionIsAboveDock,
      JSON.stringify(reachability, null, 2)
    ).toBe(true);
    expect(
      reachability.pacIsAboveDock,
      JSON.stringify(reachability, null, 2)
    ).toBe(true);

    await action.press('Enter');
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (
              window as typeof window & {
                __jov6254PrimaryCtaActivated?: boolean;
              }
            ).__jov6254PrimaryCtaActivated === true
        )
      )
      .toBe(true);
  });

  test('scopes overflow mode to mobile home and clears stale fitting state', async ({
    page,
  }) => {
    const viewport = { width: 320, height: 568 };
    await prepareProfileAdmissionFixture(page, viewport);
    const zoomStyle = await page.addStyleTag({
      content: 'html { font-size: 200%; }',
    });
    await page.evaluate(() => document.fonts.ready);

    const surface = page.getByTestId('profile-compact-surface');
    const surfaceRoot = page.locator('[data-testid="profile-compact-surface"]');
    await expect
      .poll(() => surface.getAttribute('data-profile-overflow-mode'))
      .toBe('scroll');
    await expect
      .poll(() => surfaceRoot.getAttribute('data-mode'))
      .toBe('profile');

    await page
      .getByTestId('profile-tab-bar')
      .getByRole('button', { name: 'Music' })
      .click();
    await expect
      .poll(() => surfaceRoot.getAttribute('data-mode'))
      .toBe('listen');
    await expect(surface).not.toHaveAttribute('data-profile-overflow-mode');
    await expect(page.locator('[data-profile-mode]')).not.toHaveAttribute(
      'data-profile-overflow-mode'
    );

    await page
      .getByTestId('profile-tab-bar')
      .getByRole('button', { name: 'Home' })
      .click();
    await expect
      .poll(() => surfaceRoot.getAttribute('data-mode'))
      .toBe('profile');
    await expect
      .poll(() => surface.getAttribute('data-profile-overflow-mode'))
      .toBe('scroll');

    // Removing the zoom alone must invalidate the measured identity geometry;
    // this exercises the ResizeObserver path without a remount or resize.
    await zoomStyle.evaluate(style => style.remove());
    await expect
      .poll(() => surface.getAttribute('data-profile-overflow-mode'))
      .toBeNull();

    const secondZoomStyle = await page.addStyleTag({
      content: 'html { font-size: 200%; }',
    });
    await expect
      .poll(() => surface.getAttribute('data-profile-overflow-mode'))
      .toBe('scroll');

    // A desktop resize must not measure or retain mobile overflow state. When
    // the viewport returns to mobile, the still-zoomed content is measured as
    // a fresh mobile-home decision.
    await page.setViewportSize({ width: 1024, height: 768 });
    await expect(surface).not.toHaveAttribute('data-profile-overflow-mode');
    await page.setViewportSize({ width: 320, height: 568 });
    await expect
      .poll(() => surface.getAttribute('data-profile-overflow-mode'))
      .toBe('scroll');

    // Removing the zoom makes the same home surface fit again. Resize is kept
    // in the transition so the test exercises the invalidation path rather
    // than relying on a remount to clear state.
    await secondZoomStyle.evaluate(style => style.remove());
    await page.setViewportSize({ width: 320, height: 740 });
    await expect
      .poll(() => surface.getAttribute('data-profile-overflow-mode'))
      .toBeNull();
    await expect(page.locator('[data-profile-mode]')).not.toHaveAttribute(
      'data-profile-overflow-mode'
    );
  });

  test('long wrapped location remains bounded in the compact desktop layout', async ({
    page,
  }) => {
    const viewport = { width: 1024, height: 768 };
    await prepareProfileAdmissionFixture(page, viewport, true);

    const location = page
      .getByTestId('profile-hero-metadata-row')
      .locator('span')
      .last();
    await expect(location).toBeVisible();
    await location.evaluate(element => {
      element.textContent = 'Northwest Territories and the Pacific Northwest';
    });

    const metrics = await collectLayoutMetrics(page);
    expect(metrics.cover, 'compact desktop cover is required').not.toBeNull();
    expect(metrics.media, 'compact desktop media is required').not.toBeNull();
    expect(
      metrics.identity,
      'compact desktop identity is required'
    ).not.toBeNull();
    expect(metrics.homeRail, 'compact desktop rail is required').not.toBeNull();

    const cover = metrics.cover;
    const identity = metrics.identity;
    const homeRail = metrics.homeRail;
    if (!cover || !identity || !homeRail) {
      throw new Error('compact desktop fixture lost a required geometry node');
    }

    const locationGeometry = await location.evaluate(element => {
      const rect = element.getBoundingClientRect();
      return {
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        height: rect.height,
        lineHeight: Number.parseFloat(
          window.getComputedStyle(element).lineHeight
        ),
        scrollWidth: element.scrollWidth,
        clientWidth: element.clientWidth,
        scrollHeight: element.scrollHeight,
        clientHeight: element.clientHeight,
      };
    });

    expect(metrics.horizontalOverflow).toBeLessThanOrEqual(1);
    expect(locationGeometry.right).toBeLessThanOrEqual(identity.right + 1);
    if (Number.isFinite(locationGeometry.lineHeight)) {
      expect(locationGeometry.height).toBeLessThanOrEqual(
        locationGeometry.lineHeight + 1
      );
    }
    expect(
      locationGeometry.scrollWidth - locationGeometry.clientWidth
    ).toBeLessThanOrEqual(2);
    expect(
      locationGeometry.scrollHeight - locationGeometry.clientHeight
    ).toBeLessThanOrEqual(2);
    expect(identity.bottom).toBeLessThanOrEqual(cover.bottom + 1);
    expect(homeRail.top).toBeGreaterThanOrEqual(cover.bottom);
  });

  for (const viewport of VIEWPORTS) {
    test(`${viewport.id} has no layout collisions`, async ({ page }) => {
      await prepareProfilePage(page, viewport);

      const metrics = await collectLayoutMetrics(page);
      expect(metrics.viewportWidth).toBe(viewport.width);
      expect(
        metrics.horizontalOverflow,
        `${viewport.id} should not horizontally overflow`
      ).toBeLessThanOrEqual(1);
      expect(metrics.scrollX, `${viewport.id} should not scroll sideways`).toBe(
        0
      );

      expect(
        metrics.shell,
        `${viewport.id} shell should render`
      ).not.toBeNull();
      expect(
        metrics.cover,
        `${viewport.id} cover should render`
      ).not.toBeNull();
      expect(metrics.shell?.left ?? 0).toBeGreaterThanOrEqual(-1);
      expect(metrics.shell?.right ?? 0).toBeLessThanOrEqual(viewport.width + 1);
      // The iOS-grade compact profile owns a stable token-driven hero
      // (clamp(220px, 34svh, 400px)); media crops rather than squashing. The
      // desktop shell keeps its independent 240px composition floor here.
      expect(metrics.cover?.height ?? 0).toBeGreaterThanOrEqual(
        viewport.isMobile ? 220 : 240
      );

      if (viewport.isMobile) {
        expect(
          metrics.cover,
          `${viewport.id} cover is required`
        ).not.toBeNull();
        expect(
          metrics.media,
          `${viewport.id} media is required`
        ).not.toBeNull();
        expect(
          metrics.identity,
          `${viewport.id} identity is required`
        ).not.toBeNull();
        expect(
          metrics.homeRail,
          `${viewport.id} home rail is required`
        ).not.toBeNull();

        const cover = metrics.cover;
        const media = metrics.media;
        const identity = metrics.identity;
        const homeRail = metrics.homeRail;
        if (!cover || !media || !identity || !homeRail) {
          throw new Error(
            `${viewport.id} mobile layout is missing a required geometry node`
          );
        }

        const expectedMediaHeight = Math.min(
          400,
          Math.max(220, viewport.height * 0.34)
        );
        expect(
          Math.abs(media.height - expectedMediaHeight),
          `${viewport.id} media should follow the tokenized 34svh composition`
        ).toBeLessThanOrEqual(1);
        expect(
          cover.height - (media.height + identity.height),
          `${viewport.id} cover should include the tokenized media and identity band`
        ).toBeGreaterThanOrEqual(-1);
        expect(
          cover.height - (media.height + identity.height),
          `${viewport.id} cover should include the tokenized media and identity band`
        ).toBeLessThanOrEqual(1);
        expect(
          identity.bottom,
          `${viewport.id} identity should stay inside the cover`
        ).toBeLessThanOrEqual(cover.bottom + 1);
        expect(
          homeRail.top - cover.bottom,
          `${viewport.id} primary card should follow the identity without a spacer`
        ).toBeGreaterThanOrEqual(0);
        expect(
          homeRail.top - cover.bottom,
          `${viewport.id} primary card should stay close to the identity`
        ).toBeLessThanOrEqual(8);
        if (viewport.height >= 800 && metrics.nav && metrics.homeRail) {
          const deadSpaceBelowCards = metrics.nav.top - metrics.homeRail.bottom;
          expect(
            deadSpaceBelowCards,
            `${viewport.id} should not leave dead space below home cards`
          ).toBeLessThanOrEqual(24);
        }
      }

      for (const image of metrics.visibleLargeImages) {
        expect(
          image.width,
          `${image.alt} should keep a visible rendered width`
        ).toBeGreaterThan(0);
        expect(
          image.height,
          `${image.alt} should keep a visible rendered height`
        ).toBeGreaterThan(0);
        expect(
          image.objectFit,
          `${image.alt} should preserve its rendered aspect ratio`
        ).not.toBe('fill');
        expect(
          image.objectFit,
          `${image.alt} should use an explicit fit mode`
        ).not.toBe('none');
        if (image.complete && image.naturalWidth > 0) {
          expect(
            image.naturalHeight,
            `${image.alt} loaded image should report intrinsic height`
          ).toBeGreaterThan(0);
        }
      }

      for (const target of metrics.actionTargets) {
        expect(
          target.height,
          `${viewport.id} action "${target.label}" should keep a 44px tap target`
        ).toBeGreaterThanOrEqual(44);
      }

      for (const text of metrics.textTargets) {
        expect(
          text.scrollWidth - text.clientWidth,
          `${viewport.id} text target ${text.testId ?? 'unknown'} should not clip horizontally`
        ).toBeLessThanOrEqual(2);
      }

      if (metrics.nav && metrics.scroll) {
        expect(
          metrics.nav.top - metrics.scroll.bottom,
          `${viewport.id} bottom nav should not cover scroll content`
        ).toBeGreaterThanOrEqual(-2);
      }

      if (metrics.desktopCover && metrics.desktopAlerts) {
        const separated =
          metrics.desktopCover.right <= metrics.desktopAlerts.left + 1 ||
          metrics.desktopCover.bottom <= metrics.desktopAlerts.top + 1 ||
          metrics.desktopAlerts.bottom <= metrics.desktopCover.top + 1;

        expect(
          separated,
          `${viewport.id} desktop cover should not overlap the alerts panel`
        ).toBe(true);
      }

      if (metrics.desktopCover && metrics.desktopSecondaryGrid) {
        expect(
          metrics.desktopSecondaryGrid.top - metrics.desktopCover.bottom,
          `${viewport.id} desktop secondary content should not sit under the cover`
        ).toBeGreaterThanOrEqual(-1);
      }

      await saveApprovalScreenshot(page, viewport);
      await expect(page).toHaveScreenshot(
        `tim-public-profile-${viewport.id}.png`,
        {
          fullPage: false,
        }
      );
    });
  }
});
