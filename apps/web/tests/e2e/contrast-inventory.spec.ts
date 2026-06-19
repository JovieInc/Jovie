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
 *   pnpm run contrast:inventory
 *
 * Authenticated routes require:
 *   E2E_USE_TEST_AUTH_BYPASS=1  (local)
 *   or Clerk credentials
 *
 * Output: apps/web/tests/e2e/contrast-baseline.json
 *
 * @see JovieInc/Jovie#11028 (this task)
 * @see JovieInc/Jovie#11025 (gate that consumes the baseline)
 */

import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { test } from '@playwright/test';
import { resolvePublicSurfaceManifestSync } from './utils/public-surface-manifest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const BASELINE_PATH = join(__dirname, 'contrast-baseline.json');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ContrastNode {
  /** CSS selector identifying the violating element */
  readonly selector: string;
  /** axe failure summary */
  readonly failureSummary: string;
  /** fg/bg color data from axe */
  readonly data: {
    readonly fgColor?: string;
    readonly bgColor?: string;
    readonly contrastRatio?: number;
    readonly expectedContrastRatio?: number;
  } | null;
}

export interface ContrastViolationRecord {
  readonly route: string;
  readonly theme: 'light' | 'dark';
  /** axe rule id — always 'color-contrast' in this sweep */
  readonly ruleId: string;
  readonly impact: string | null;
  readonly nodes: readonly ContrastNode[];
}

export interface ContrastInventory {
  readonly schemaVersion: 1;
  /** ISO timestamp of when this inventory was generated */
  readonly generatedAt: string;
  readonly issueRef: '#11028';
  readonly totalViolations: number;
  readonly violations: readonly ContrastViolationRecord[];
  /** Violations grouped by CSS selector for component-level deduplication */
  readonly bySelector: Record<
    string,
    {
      readonly count: number;
      readonly routes: readonly string[];
      readonly worstRatio: number | null;
      readonly themes: readonly ('light' | 'dark')[];
    }
  >;
}

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
  // Give CSS transitions a moment to settle
  await page.waitForTimeout(200);
}

function extractContrastData(node: {
  any: Array<{ data?: unknown }>;
  all: Array<{ data?: unknown }>;
}): ContrastNode['data'] {
  const sources = [...node.any, ...node.all];
  for (const check of sources) {
    const d = check.data as
      | {
          fgColor?: string;
          bgColor?: string;
          contrastRatio?: number;
          expectedContrastRatio?: number;
        }
      | null
      | undefined;
    if (d?.fgColor) return d;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Route definitions
// ---------------------------------------------------------------------------

// Public routes (unauthenticated) — filter to expectedState: 'ok' only
const publicSurfaces = resolvePublicSurfaceManifestSync().filter(
  s => s.expectedState === 'ok'
);

// Key authenticated routes for onboarding / dashboard / paywall / settings
// These are the highest-priority surfaces per #11028 acceptance criteria
const AUTH_ROUTES: ReadonlyArray<{
  readonly id: string;
  readonly path: string;
  readonly label: string;
}> = [
  { id: 'app-dashboard', path: '/app/dashboard', label: 'App Dashboard' },
  { id: 'app-chat', path: '/app/chat', label: 'Chat' },
  { id: 'app-releases', path: '/app/releases', label: 'Releases' },
  {
    id: 'settings-artist-profile',
    path: '/app/settings/artist-profile',
    label: 'Settings — Artist Profile',
  },
  {
    id: 'settings-billing',
    path: '/app/settings/billing',
    label: 'Settings — Billing',
  },
  {
    id: 'settings-account',
    path: '/app/settings/account',
    label: 'Settings — Account',
  },
  { id: 'onboarding-start', path: '/onboarding', label: 'Onboarding' },
  { id: 'paywall', path: '/app/upgrade', label: 'Paywall / Upgrade' },
] as const;

// Shared violation accumulator (module-level, safe for serial test execution)
const allViolations: ContrastViolationRecord[] = [];

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

test.describe('Contrast Inventory Sweep — JOV-#11028', () => {
  // Serial execution to keep accumulator consistent and reduce server load
  test.describe.configure({ mode: 'serial' });

  test.setTimeout(300_000); // 5 min for the full sweep

  // -------------------------------------------------------------------------
  // Public routes — unauthenticated
  // -------------------------------------------------------------------------

  test.describe('Public routes (unauthenticated)', () => {
    test.use({ storageState: { cookies: [], origins: [] } });

    for (const surface of publicSurfaces) {
      for (const theme of ['light', 'dark'] as const) {
        const testId = `${surface.id}/${theme}`;

        test(`contrast:inventory — ${testId}`, async ({ page }) => {
          await page.route('**/api/profile/view', r =>
            r.fulfill({ status: 200, body: '{}' })
          );
          await page.route('**/api/audience/visit', r =>
            r.fulfill({ status: 200, body: '{}' })
          );
          await page.route('**/api/track', r =>
            r.fulfill({ status: 200, body: '{}' })
          );

          try {
            await page.goto(surface.resolvedPath, {
              waitUntil: 'domcontentloaded',
              timeout: 60_000,
            });
            await setTheme(page, theme);

            const results = await new AxeBuilder({ page })
              .withRules(['color-contrast'])
              .analyze();

            for (const violation of results.violations) {
              allViolations.push({
                route: surface.resolvedPath,
                theme,
                ruleId: violation.id,
                impact: violation.impact ?? null,
                nodes: violation.nodes.map(n => ({
                  selector: n.target.join(', '),
                  failureSummary: n.failureSummary ?? '',
                  data: extractContrastData(n),
                })),
              });
            }
          } catch (err) {
            // Log but never fail — inventory mode
            console.warn(`[contrast-inventory] ${testId} error:`, err);
          }

          // Always pass
        });
      }
    }
  });

  // -------------------------------------------------------------------------
  // Authenticated routes — dev auth bypass (creator-ready persona)
  // -------------------------------------------------------------------------

  test.describe('Authenticated routes', () => {
    const hasBypass = process.env.E2E_USE_TEST_AUTH_BYPASS === '1';

    // Skip the entire block when auth isn't available — inventory still
    // captures the public surfaces above
    test.skip(
      !hasBypass,
      'Auth routes skipped: set E2E_USE_TEST_AUTH_BYPASS=1'
    );

    test.beforeEach(async ({ page }) => {
      if (!hasBypass) return;

      const baseUrl = process.env.BASE_URL ?? 'http://localhost:3100';
      // Use the canonical dev auth bypass: creator-ready gives Pro entitlements
      // so onboarding is bypassed and paywall renders correctly
      await page.goto(
        `${baseUrl}/api/dev/test-auth/enter?persona=creator-ready&redirect=/app/dashboard`,
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
            // Wait for authenticated shell to settle
            await page.waitForTimeout(1_000);

            const results = await new AxeBuilder({ page })
              .withRules(['color-contrast'])
              .disableRules(['frame-tested'])
              .analyze();

            for (const violation of results.violations) {
              allViolations.push({
                route: route.path,
                theme,
                ruleId: violation.id,
                impact: violation.impact ?? null,
                nodes: violation.nodes.map(n => ({
                  selector: n.target.join(', '),
                  failureSummary: n.failureSummary ?? '',
                  data: extractContrastData(n),
                })),
              });
            }
          } catch (err) {
            console.warn(`[contrast-inventory] ${testId} error:`, err);
          }
        });
      }
    }
  });

  // -------------------------------------------------------------------------
  // Aggregation — write inventory after all routes are crawled
  // -------------------------------------------------------------------------

  test('write contrast-baseline.json', async () => {
    // Build bySelector index
    const bySelector: ContrastInventory['bySelector'] = {};

    for (const v of allViolations) {
      for (const node of v.nodes) {
        const sel = node.selector;
        const existing = bySelector[sel];
        const ratio = node.data?.contrastRatio ?? null;

        if (!existing) {
          bySelector[sel] = {
            count: 1,
            routes: [v.route],
            worstRatio: ratio,
            themes: [v.theme],
          };
        } else {
          const updatedRoutes = existing.routes.includes(v.route)
            ? existing.routes
            : ([...existing.routes, v.route] as const);
          const updatedThemes = existing.themes.includes(v.theme)
            ? existing.themes
            : ([...existing.themes, v.theme] as const);
          const worstRatio =
            ratio !== null && existing.worstRatio !== null
              ? Math.min(existing.worstRatio, ratio)
              : (existing.worstRatio ?? ratio);

          bySelector[sel] = {
            count: existing.count + 1,
            routes: updatedRoutes,
            worstRatio,
            themes: updatedThemes,
          };
        }
      }
    }

    const totalViolationNodes = Object.values(bySelector).reduce(
      (sum, s) => sum + s.count,
      0
    );

    const inventory: ContrastInventory = {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      issueRef: '#11028',
      totalViolations: totalViolationNodes,
      violations: allViolations,
      bySelector,
    };

    writeFileSync(BASELINE_PATH, JSON.stringify(inventory, null, 2));

    // Summary to console
    const topOffenders = Object.entries(bySelector)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 20);

    console.log(
      `\n[contrast-inventory] ✓ Wrote ${BASELINE_PATH}\n` +
        `  Total violation nodes: ${totalViolationNodes}\n` +
        `  Unique selectors: ${Object.keys(bySelector).length}\n` +
        `  Routes scanned: ${
          [...new Set(allViolations.map(v => v.route))].length
        }\n\n` +
        `  Top 20 worst offenders (by occurrence count):\n` +
        topOffenders
          .map(
            ([sel, data]) =>
              `    [×${data.count}] ${data.themes.join('+')} ` +
              `ratio:${data.worstRatio ?? 'n/a'} — ${sel.slice(0, 80)}`
          )
          .join('\n')
    );

    // Non-blocking: the test passes regardless of violation count
    // The JSON file is the deliverable, not a pass/fail assertion
    console.log(
      '[contrast-inventory] Inventory complete — gate-baseline seeded'
    );
  });
});
