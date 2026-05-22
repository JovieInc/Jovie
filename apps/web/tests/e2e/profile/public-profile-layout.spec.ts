import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { expect, type Page, test } from '@playwright/test';
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
const APPROVAL_SCREENSHOT_DIR =
  process.env.PROFILE_LAYOUT_APPROVAL_DIR?.trim() ||
  '.context/public-profile-layout-approval';
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

async function saveApprovalScreenshot(page: Page, viewport: LayoutViewport) {
  if (!APPROVAL_SCREENSHOTS) return;

  const outputDir = path.resolve(repoRoot(), APPROVAL_SCREENSHOT_DIR);
  await mkdir(outputDir, { recursive: true });
  await page.screenshot({
    path: path.join(outputDir, `${viewport.id}.png`),
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

    return {
      viewportWidth,
      viewportHeight,
      horizontalOverflow: Math.max(documentWidth, bodyWidth) - viewportWidth,
      scrollX: window.scrollX,
      scrollY: window.scrollY,
      root: box(root),
      shell: box(activeShell),
      cover: box(cover),
      desktopCover: box(desktopCover),
      desktopAlerts: box(desktopAlerts),
      desktopSecondaryGrid: box(desktopSecondaryGrid),
      scroll: box(scroll),
      nav: box(nav),
      visibleLargeImages,
      actionTargets,
      textTargets,
    };
  });
}

test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Public profile /tim layout hardening @regression', () => {
  test.setTimeout(180_000);

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
      expect(metrics.cover?.height ?? 0).toBeGreaterThanOrEqual(
        viewport.isMobile ? 300 : 220
      );

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
