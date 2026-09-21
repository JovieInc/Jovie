import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { installPublicRouteMocks } from '../e2e/utils/public-surface-helpers';
import { waitForHydration } from '../e2e/utils/smoke-test-utils';
import { collectBrowserErrors } from '../visual-qa/route-quality';

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

const profileRoute = '/unfazed';

const viewports = [
  { id: 'desktop', width: 1440, height: 900, layout: 'desktop' },
  { id: 'mobile', width: 390, height: 900, layout: 'compact' },
] as const;

const outputRoot = path.resolve(
  process.env.SCREEN_PROOF_OUTPUT_DIR || 'test-results/screen-browser-proof'
);
const measurementsPath = path.resolve(
  process.env.SCREEN_PROOF_MEASUREMENTS ||
    'test-results/screen-browser-proof-measurements.json'
);

test('emits exact-head public-profile desktop and mobile evidence', async ({
  page,
}) => {
  await rm(outputRoot, { recursive: true, force: true });
  await mkdir(path.join(outputRoot, 'screenshots'), { recursive: true });
  await mkdir(path.dirname(measurementsPath), { recursive: true });
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
    const response = await page.goto(profileRoute, {
      waitUntil: 'domcontentloaded',
      timeout: 120_000,
    });
    expect(response?.status()).toBe(200);
    const finalUrl = new URL(page.url());
    expect(finalUrl.pathname).toBe(profileRoute);
    expect(finalUrl.search).toBe('');
    expect(finalUrl.hash).toBe('');
    await waitForHydration(page);

    const shell = page.getByTestId('public-profile-layout-shell');
    await expect(shell).toHaveAttribute('data-layout', viewport.layout);
    const surface = page.getByTestId(
      viewport.layout === 'desktop'
        ? 'profile-desktop-surface'
        : 'profile-compact-shell'
    );
    await expect(surface).toBeVisible();
    await expect(surface).toHaveAttribute('data-interactive-ready', 'true');
    await page.evaluate(async () => {
      await document.fonts.ready;
      await new Promise<void>(resolve =>
        requestAnimationFrame(() => resolve())
      );
      await new Promise<void>(resolve =>
        requestAnimationFrame(() => resolve())
      );
    });

    const music = page.getByRole('button', { name: 'Music', exact: true });
    await music.click();
    await expect(music).toHaveAttribute('aria-current', 'page');
    const menu = page.getByRole('button', { name: 'Menu', exact: true });
    await menu.click();
    await expect(page.getByTestId('profile-menu-drawer')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('profile-menu-drawer')).toBeHidden();
    await expect(menu).toBeFocused();
    await page.getByRole('button', { name: 'Home', exact: true }).click();

    const accessibility = await new AxeBuilder({ page })
      .include('[data-testid="public-profile-layout-shell"]')
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
      path: path.join(outputRoot, 'screenshots', `${viewport.id}.png`),
      fullPage: false,
    });
    measured.push({
      id: viewport.id,
      requestedRoute: profileRoute,
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
  }

  await writeFile(
    measurementsPath,
    `${JSON.stringify(
      {
        capturedAt: new Date().toISOString(),
        viewports: measured,
        activeFlow: { disclosure: false },
        historyProof: {
          separate: true,
          path: 'docs/VISUAL_TESTING_POLICY.md',
        },
        visibleActions: ['Home', 'Music', 'Menu'],
      },
      null,
      2
    )}\n`
  );
});
