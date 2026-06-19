/**
 * Contrast Inventory Sweep — JOV-#11028
 *
 * One-time (but re-runnable) crawl of all public routes × light/dark themes
 * with axe color-contrast rule only. Emits a structured JSON inventory used
 * to seed the JOV-#11025 gate baseline.
 *
 * This spec NEVER fails — it is an inventory, not a gate. Violations are
 * collected and written to contrast-baseline.json for downstream use.
 *
 * Run:
 *   E2E_USE_TEST_AUTH_BYPASS=1 pnpm run contrast:inventory
 *
 * Output:
 *   apps/web/tests/e2e/contrast-baseline.json
 *   apps/web/tests/e2e/contrast-baseline.md
 *   apps/web/tests/e2e/contrast-screenshots/*.png
 *
 * @see JovieInc/Jovie#11028 (this task)
 * @see JovieInc/Jovie#11025 (gate that consumes the baseline)
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
  ensureScreenshotDirectory,
  extractContrastData,
  getScreenshotAbsolutePath,
  getScreenshotRelativePath,
  writeContrastInventoryArtifacts,
} from './utils/contrast-inventory';
import { installPublicRouteMocks } from './utils/public-surface-helpers';
import { resolvePublicSurfaceManifestSync } from './utils/public-surface-manifest';

const OUTPUT_DIR = join(process.cwd(), 'tests/e2e');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

  if (results.violations.length === 0) {
    return null;
  }

  const screenshotPath = getScreenshotAbsolutePath(OUTPUT_DIR, route, theme);
  await page.screenshot({ path: screenshotPath, fullPage: true });
  const screenshot = getScreenshotRelativePath(route, theme);

  return {
    route,
    theme,
    ruleId: 'color-contrast',
    impact: results.violations[0]?.impact ?? null,
    screenshot,
    nodes: results.violations.flatMap(violation =>
      violation.nodes.map(node => ({
        selector: node.target.join(', '),
        failureSummary: node.failureSummary ?? '',
        data: extractContrastData(node),
      }))
    ),
  };
}

// ---------------------------------------------------------------------------
// Route definitions
// ---------------------------------------------------------------------------

const publicSurfaces = resolvePublicSurfaceManifestSync().filter(
  surface => surface.expectedState === 'ok'
);

const AUTH_ROUTES: ReadonlyArray<{
  readonly id: string;
  readonly path: string;
  readonly label: string;
}> = [
  {
    id: 'app-dashboard',
    path: APP_ROUTES.LEGACY_DASHBOARD,
    label: 'App Dashboard',
  },
  { id: 'app-chat', path: APP_ROUTES.CHAT, label: 'Chat' },
  { id: 'app-releases', path: APP_ROUTES.RELEASES, label: 'Releases' },
  {
    id: 'settings-artist-profile',
    path: APP_ROUTES.SETTINGS_ARTIST_PROFILE,
    label: 'Settings — Artist Profile',
  },
  {
    id: 'settings-billing',
    path: APP_ROUTES.SETTINGS_BILLING,
    label: 'Settings — Billing',
  },
  {
    id: 'settings-account',
    path: APP_ROUTES.SETTINGS_ACCOUNT,
    label: 'Settings — Account',
  },
  {
    id: 'onboarding-start',
    path: APP_ROUTES.ONBOARDING,
    label: 'Onboarding',
  },
  {
    id: 'paywall',
    path: APP_ROUTES.BILLING,
    label: 'Paywall / Upgrade',
  },
] as const;

const allViolations: ContrastViolationRecord[] = [];

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

test.describe('Contrast Inventory Sweep — JOV-#11028', () => {
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(300_000);

  test.beforeAll(() => {
    ensureScreenshotDirectory(OUTPUT_DIR);
  });

  test.describe('Public routes (unauthenticated)', () => {
    test.use({ storageState: { cookies: [], origins: [] } });

    for (const surface of publicSurfaces) {
      for (const theme of ['light', 'dark'] as const) {
        const testId = `${surface.id}/${theme}`;

        test(`contrast:inventory — ${testId}`, async ({ page }) => {
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
            if (record) {
              allViolations.push(record);
            }
          } catch (err) {
            console.warn(`[contrast-inventory] ${testId} error:`, err);
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

    for (const route of AUTH_ROUTES) {
      for (const theme of ['light', 'dark'] as const) {
        const testId = `${route.id}/${theme}`;

        test(`contrast:inventory — ${testId}`, async ({ page }) => {
          const baseUrl = process.env.BASE_URL ?? 'http://localhost:3100';

          try {
            await page.goto(`${baseUrl}${route.path}`, {
              waitUntil: 'domcontentloaded',
              timeout: 60_000,
            });
            await setTheme(page, theme);
            await page.waitForTimeout(1_000);

            const record = await collectContrastViolations(
              page,
              route.path,
              theme
            );
            if (record) {
              allViolations.push(record);
            }
          } catch (err) {
            console.warn(`[contrast-inventory] ${testId} error:`, err);
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

    const topClusters = fixClusters.slice(0, 20);
    console.log(
      `\n[contrast-inventory] ✓ Wrote ${jsonPath}\n` +
        `[contrast-inventory] ✓ Wrote ${markdownPath}\n` +
        `  Total violation nodes: ${totalViolationNodes}\n` +
        `  Unique selectors: ${Object.keys(bySelector).length}\n` +
        `  Shared component keys: ${Object.keys(byComponent).length}\n` +
        `  Routes scanned: ${
          [...new Set(allViolations.map(v => v.route))].length
        }\n\n` +
        `  Top 20 fix clusters:\n` +
        topClusters
          .map(
            cluster =>
              `    [${cluster.priority} ×${cluster.count}] ` +
              `ratio:${cluster.worstRatio ?? 'n/a'} — ${cluster.componentKey}`
          )
          .join('\n')
    );

    console.log(
      '[contrast-inventory] Inventory complete — gate-baseline seeded'
    );
  });
});
