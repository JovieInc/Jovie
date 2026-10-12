import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { installPublicRouteMocks } from '../e2e/utils/public-surface-helpers';
import { waitForHydration } from '../e2e/utils/smoke-test-utils';
import { collectBrowserErrors } from '../visual-qa/route-quality';

// JOV-8170: one shared producer for the anonymous public inventory screens
// that have no dedicated spec. Each entry pairs a SCREEN_REGISTRY id with the
// concrete anonymous route that renders its registered sources; the workflow
// binds and uploads one `screen-browser-proof-<suffix>` artifact per entry.
// Screens needing auth, a dynamic param, or a reserved fixture keep (or get)
// their own producer — do not add them here.
const PUBLIC_SCREENS = [
  { screenId: 'web.root-document', route: '/' },
  { screenId: 'web.root-layout', route: '/' },
  // web.legal-shell's only source is the (dynamic)/legal layout, which every
  // legal route renders; /legal/privacy is its producer route.
  { screenId: 'web.legal-shell', route: '/legal/privacy' },
  { screenId: 'web.legal-privacy', route: '/legal/privacy' },
  { screenId: 'web.legal-terms', route: '/legal/terms' },
  { screenId: 'web.legal-cookies', route: '/legal/cookies' },
  { screenId: 'web.legal-dmca', route: '/legal/dmca' },
  { screenId: 'web.playlists-index', route: '/playlists' },
  { screenId: 'web.brand', route: '/brand' },
  { screenId: 'web.report', route: '/report' },
  { screenId: 'web.start', route: '/start' },
  // /solutions/* is a wildcard manifest family; /solutions/artists is its
  // declared concrete health-check path.
  { screenId: 'web.marketing-solutions', route: '/solutions/artists' },
  // /unfazed is the reserved capture profile: the same noop-DB fallback that
  // lets the web.public-profile producer render also renders its about page.
  { screenId: 'web.public-profile-about', route: '/unfazed/about' },
] as const;

type ScreenProofWindow = Window & {
  __screenProofCls?: number;
};

type ViewportMeasurement = {
  id: string;
  requestedRoute: string;
  finalUrl: string;
  decision: 'pass';
  rendered: true;
  axe: { violations: number };
  overflow: { maxHorizontalPx: number };
  interaction: { passed: true };
  cls: { value: number };
  contrast: { passed: boolean };
  runtime: {
    consoleErrors: number;
    pageErrors: number;
    failedResponses: number;
    failedRequests: number;
  };
};

const viewports = [
  { id: 'desktop', width: 1440, height: 900 },
  { id: 'mobile', width: 390, height: 900 },
] as const;

const outputRoot = path.resolve(
  process.env.SCREEN_PROOF_OUTPUT_ROOT || 'test-results'
);

test('emits exact-head public screen evidence', async ({ page }) => {
  for (const screen of PUBLIC_SCREENS) {
    const suffix = screen.screenId.slice(screen.screenId.indexOf('.') + 1);
    const screenDir = path.join(outputRoot, `screen-browser-proof-${suffix}`);
    await mkdir(path.join(screenDir, 'screenshots'), { recursive: true });
    await page.addInitScript(() => {
      const proofWindow = window as ScreenProofWindow;
      proofWindow.__screenProofCls = 0;
      new PerformanceObserver(list => {
        for (const entry of list.getEntries()) {
          const shift = entry as PerformanceEntry & {
            value?: number;
            hadRecentInput?: boolean;
          };
          if (!shift.hadRecentInput && typeof shift.value === 'number') {
            proofWindow.__screenProofCls =
              (proofWindow.__screenProofCls ?? 0) + shift.value;
          }
        }
      }).observe({ type: 'layout-shift', buffered: true });
    });

    const measured: ViewportMeasurement[] = [];
    const browserErrors = collectBrowserErrors(page, true);
    for (const viewport of viewports) {
      await page.setViewportSize({
        width: viewport.width,
        height: viewport.height,
      });
      await installPublicRouteMocks(page);
      const response = await page.goto(screen.route, {
        waitUntil: 'domcontentloaded',
        timeout: 120_000,
      });
      expect(response?.status()).toBe(200);
      const finalUrl = new URL(page.url());
      expect(finalUrl.pathname).toBe(screen.route);
      expect(finalUrl.search).toBe('');
      expect(finalUrl.hash).toBe('');
      await waitForHydration(page);
      await page.waitForLoadState('networkidle');
      await expect(page.locator('body')).toBeVisible();
      await page.evaluate(async () => {
        await document.fonts.ready;
        await new Promise<void>(resolve =>
          requestAnimationFrame(() => resolve())
        );
        await new Promise<void>(resolve =>
          requestAnimationFrame(() => resolve())
        );
      });

      const accessibility = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();
      expect(accessibility.violations).toEqual([]);

      const browserMetrics = await page.evaluate(() => {
        const brokenImages = Array.from(document.images)
          .filter(image => image.complete && image.naturalWidth === 0)
          .map(image => image.currentSrc || image.src);
        const proofWindow = window as ScreenProofWindow;
        return {
          brokenImages,
          cls: proofWindow.__screenProofCls ?? 0,
          horizontalOverflow: Math.max(
            0,
            document.documentElement.scrollWidth - window.innerWidth
          ),
        };
      });
      expect(browserMetrics.brokenImages).toEqual([]);
      expect(browserMetrics.horizontalOverflow).toBeLessThanOrEqual(1);
      expect(browserMetrics.cls).toBeLessThanOrEqual(0.05);
      expect(browserErrors.failedResponses).toEqual([]);
      expect(browserErrors.failedRequests).toEqual([]);
      expect(browserErrors.pageErrors).toEqual([]);
      expect(browserErrors.consoleErrors).toEqual([]);

      await page.screenshot({
        path: path.join(screenDir, 'screenshots', `${viewport.id}.png`),
        fullPage: false,
      });
      measured.push({
        id: viewport.id,
        requestedRoute: screen.route,
        finalUrl: finalUrl.toString(),
        decision: 'pass',
        rendered: true,
        axe: { violations: accessibility.violations.length },
        overflow: { maxHorizontalPx: browserMetrics.horizontalOverflow },
        interaction: { passed: true },
        cls: { value: browserMetrics.cls },
        contrast: {
          passed: !accessibility.violations.some(
            violation => violation.id === 'color-contrast'
          ),
        },
        runtime: {
          consoleErrors: browserErrors.consoleErrors.length,
          pageErrors: browserErrors.pageErrors.length,
          failedResponses: browserErrors.failedResponses.length,
          failedRequests: browserErrors.failedRequests.length,
        },
      });
      browserErrors.consoleErrors.length = 0;
      browserErrors.pageErrors.length = 0;
      browserErrors.failedResponses.length = 0;
      browserErrors.failedRequests.length = 0;
    }

    await writeFile(
      path.join(outputRoot, `screen-browser-proof-${suffix}-measurements.json`),
      `${JSON.stringify(
        {
          capturedAt: new Date().toISOString(),
          viewports: measured,
          activeFlow: { disclosure: false },
          historyProof: {
            separate: true,
            path: 'docs/VISUAL_TESTING_POLICY.md',
          },
          visibleActions: ['Navigate'],
        },
        null,
        2
      )}\n`
    );
  }
});
