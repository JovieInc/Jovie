/**
 * Contrast inventory sweep (JOV-#11028). Never fails — writes contrast-baseline.json.
 * Run: E2E_USE_TEST_AUTH_BYPASS=1 pnpm --filter web exec playwright test tests/e2e/contrast-inventory.spec.ts --workers=1
 */

import { join } from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { APP_ROUTES } from '@/constants/routes';
import { test } from './setup';
import {
  buildComponentIndex,
  buildFixClusters,
  buildSelectorIndex,
  type ContrastInventory,
  type ContrastViolationRecord,
  extractContrastData,
  getScreenshotAbsolutePath,
  getScreenshotRelativePath,
  resetContrastScreenshotDirectory,
  writeContrastInventoryArtifacts,
} from './utils/contrast-inventory';
import { installPublicRouteMocks } from './utils/public-surface-helpers';
import { resolvePublicSurfaceManifestSync } from './utils/public-surface-manifest';

const OUTPUT_DIR = join(process.cwd(), 'tests/e2e');

async function setTheme(page: Page, theme: 'light' | 'dark'): Promise<void> {
  await page.evaluate(t => {
    if (t === 'dark') {
      document.documentElement.classList.add('dark');
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      document.documentElement.setAttribute('data-theme', 'light');
    }
  }, theme);
  await page.waitForTimeout(200);
}

async function collectContrastViolations(
  page: Page,
  route: string,
  theme: 'light' | 'dark'
): Promise<ContrastViolationRecord | null> {
  const results = await new AxeBuilder({ page })
    .withRules(['color-contrast'])
    .disableRules(['frame-tested'])
    .analyze();

  if (results.violations.length === 0) return null;

  const screenshotPath = getScreenshotAbsolutePath(OUTPUT_DIR, route, theme);
  await page.screenshot({ path: screenshotPath, fullPage: true });

  return {
    route,
    theme,
    ruleId: 'color-contrast',
    impact: results.violations[0]?.impact ?? null,
    screenshot: getScreenshotRelativePath(route, theme),
    nodes: results.violations.flatMap(violation =>
      violation.nodes.map(node => ({
        selector: node.target.join(', '),
        failureSummary: node.failureSummary ?? '',
        data: extractContrastData(node),
      }))
    ),
  };
}

const publicSurfaces = resolvePublicSurfaceManifestSync().filter(
  surface => surface.expectedState === 'ok'
);

const AUTH_ROUTES = [
  [APP_ROUTES.LEGACY_DASHBOARD, 'app-dashboard'],
  [APP_ROUTES.CHAT, 'app-chat'],
  [APP_ROUTES.RELEASES, 'app-releases'],
  [APP_ROUTES.SETTINGS_ARTIST_PROFILE, 'settings-artist-profile'],
  [APP_ROUTES.SETTINGS_BILLING, 'settings-billing'],
  [APP_ROUTES.SETTINGS_ACCOUNT, 'settings-account'],
  [APP_ROUTES.ONBOARDING, 'onboarding-start'],
  [APP_ROUTES.BILLING, 'paywall'],
] as const;

const allViolations: ContrastViolationRecord[] = [];

test.describe('Contrast Inventory Sweep — JOV-#11028', () => {
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(300_000);

  test.beforeAll(() => {
    resetContrastScreenshotDirectory(OUTPUT_DIR);
  });

  test.describe('Public routes (unauthenticated)', () => {
    test.use({ storageState: { cookies: [], origins: [] } });

    for (const surface of publicSurfaces) {
      for (const theme of ['light', 'dark'] as const) {
        test(`contrast:inventory — ${surface.id}/${theme}`, async ({
          page,
        }) => {
          await installPublicRouteMocks(page);
          try {
            await page.goto(surface.resolvedPath, {
              waitUntil: 'domcontentloaded',
              timeout: 60_000,
            });
            await setTheme(page, theme);
            const record = await collectContrastViolations(
              page,
              surface.resolvedPath,
              theme
            );
            if (record) allViolations.push(record);
          } catch (err) {
            console.warn(`[contrast-inventory] ${surface.id}/${theme}:`, err);
          }
        });
      }
    }
  });

  test.describe('Authenticated routes', () => {
    const hasBypass = process.env.E2E_USE_TEST_AUTH_BYPASS === '1';
    test.skip(
      !hasBypass,
      'Auth routes skipped: set E2E_USE_TEST_AUTH_BYPASS=1'
    );

    test.beforeEach(async ({ page }) => {
      if (!hasBypass) return;
      const baseUrl = process.env.BASE_URL ?? 'http://localhost:3100';
      await page.goto(
        `${baseUrl}/api/dev/test-auth/enter?persona=creator-ready&redirect=${APP_ROUTES.CHAT}`,
        { waitUntil: 'domcontentloaded', timeout: 30_000 }
      );
    });

    for (const [path, id] of AUTH_ROUTES) {
      for (const theme of ['light', 'dark'] as const) {
        test(`contrast:inventory — ${id}/${theme}`, async ({ page }) => {
          const baseUrl = process.env.BASE_URL ?? 'http://localhost:3100';
          try {
            await page.goto(`${baseUrl}${path}`, {
              waitUntil: 'domcontentloaded',
              timeout: 60_000,
            });
            await setTheme(page, theme);
            await page.waitForTimeout(1_000);
            const record = await collectContrastViolations(page, path, theme);
            if (record) allViolations.push(record);
          } catch (err) {
            console.warn(`[contrast-inventory] ${id}/${theme}:`, err);
          }
        });
      }
    }
  });

  test('write contrast inventory artifacts', async () => {
    const bySelector = buildSelectorIndex(allViolations);
    const byComponent = buildComponentIndex(allViolations);
    const fixClusters = buildFixClusters(byComponent);
    const totalViolationNodes = allViolations.reduce(
      (sum, violation) => sum + violation.nodes.length,
      0
    );

    const inventory: ContrastInventory = {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      issueRef: '#11028',
      totalViolations: totalViolationNodes,
      violations: allViolations,
      bySelector,
      byComponent,
      fixClusters,
    };

    const { jsonPath, markdownPath } = writeContrastInventoryArtifacts(
      inventory,
      OUTPUT_DIR
    );

    console.log(
      `[contrast-inventory] wrote ${jsonPath} and ${markdownPath} ` +
        `(${totalViolationNodes} nodes, ${Object.keys(bySelector).length} selectors)`
    );
  });
});
