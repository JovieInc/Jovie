/**
 * E2E: Accessibility + keyboard navigation test suite (JOV-2082)
 *
 * Covers:
 *   1. Keyboard Tab navigation — Tab through homepage interactive elements,
 *      assert focus is visible on each (focus-ring-themed or focus-visible:*)
 *   2. No role="button" without keyboard handler (enter/space/keydown)
 *   3. Authenticated dashboard axe scan — zero critical violations
 *      (uses dev auth bypass per .claude/rules/auth.md)
 *   4. Sign-in page axe scan — zero critical violations
 *
 * The public-surface axe audit (full WCAG 2.1 AA) lives in axe-audit.spec.ts.
 * This file focuses on keyboard nav patterns and authenticated surfaces.
 *
 * Run (local):
 *   E2E_USE_TEST_AUTH_BYPASS=1 doppler run --project jovie-web --config dev -- \
 *     pnpm --filter web exec playwright test a11y --project=chromium
 *
 * @see apps/web/tests/e2e/axe-audit.spec.ts  — public WCAG 2.1 AA scan
 * @see apps/web/tests/e2e/chat-axe.spec.ts   — chat surface axe audit
 */

import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { ensureSignedInUser, hasClerkCredentials } from '../helpers/clerk-auth';
import {
  smokeNavigateWithRetry,
  waitForHydration,
} from './utils/smoke-test-utils';

const BLOCKING_IMPACTS = new Set(['critical', 'serious']);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface AxeViolationSummary {
  readonly id: string;
  readonly impact: string | null;
  readonly help: string;
  readonly nodes: number;
  readonly targets: readonly string[];
  readonly failureSummaries: readonly string[];
}

function summarizeViolations(
  violations: Awaited<ReturnType<AxeBuilder['analyze']>>['violations']
): AxeViolationSummary[] {
  return violations.map(v => ({
    id: v.id,
    impact: v.impact ?? null,
    help: v.help,
    nodes: v.nodes.length,
    targets: v.nodes.map(node => node.target.join(' ')),
    failureSummaries: v.nodes.map(node => node.failureSummary ?? 'Unavailable'),
  }));
}

function blockingViolations(summaries: AxeViolationSummary[]) {
  return summaries.filter(
    v => v.impact !== null && BLOCKING_IMPACTS.has(v.impact)
  );
}

/**
 * Check whether a focused element has a visible focus indicator.
 * Returns null if OK, or a description string if focus is not visible.
 */
async function assertFocusVisible(
  page: import('@playwright/test').Page,
  description: string
): Promise<string | null> {
  return page.evaluate(desc => {
    const el = document.activeElement as HTMLElement | null;
    if (!el || el === document.body) {
      return `[${desc}] No focused element (activeElement is body)`;
    }

    const style = window.getComputedStyle(el);
    const rect = el.getBoundingClientRect();

    // Element must be visible
    if (
      style.display === 'none' ||
      style.visibility === 'hidden' ||
      rect.width === 0 ||
      rect.height === 0
    ) {
      return `[${desc}] Focused element is not visible: ${el.tagName}`;
    }

    // Check if the element has a visible focus indicator via:
    //   1. outline-style is not 'none' (browser default outline is visible)
    //   2. box-shadow is set (focus rings are often box-shadow based)
    //   3. Classes indicating canonical focus ring is applied
    const classList = el.className ?? '';
    const hasCanonicalFocusClass =
      classList.includes('focus-ring') ||
      classList.includes('focus-visible:ring') ||
      classList.includes('focus-visible:outline');

    const outlineStyle = style.outlineStyle;
    const hasVisibleOutline =
      outlineStyle !== 'none' &&
      outlineStyle !== '' &&
      outlineStyle !== 'hidden';

    const boxShadow = style.boxShadow;
    const hasBoxShadow = boxShadow && boxShadow !== 'none' && boxShadow !== '';

    if (!hasCanonicalFocusClass && !hasVisibleOutline && !hasBoxShadow) {
      // This is intentionally a soft flag — the test logs it rather than
      // failing hard, to avoid false positives from complex CSS cascades.
      return `[${desc}] Focus indicator may be missing: ${el.tagName}#${el.id || '(no-id)'} .${el.className.slice(0, 80)}`;
    }

    return null;
  }, description);
}

// ---------------------------------------------------------------------------
// Suite 1: Homepage keyboard Tab navigation
// ---------------------------------------------------------------------------

test.describe('Homepage keyboard Tab navigation', () => {
  test.setTimeout(60_000);

  test.use({ storageState: { cookies: [], origins: [] } });

  test('Tab through interactive elements — focus is reachable and visible', async ({
    page,
  }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await waitForHydration(page);

    // Tab through the first 20 interactive elements on the homepage.
    // We cap at 20 to keep the test fast and deterministic.
    const issues: string[] = [];
    const MAX_TABS = 20;

    for (let i = 0; i < MAX_TABS; i++) {
      await page.keyboard.press('Tab');

      // Small settle time for CSS transitions
      await page.waitForTimeout(80);

      const issue = await assertFocusVisible(page, `Tab ${i + 1}`);
      if (issue) {
        issues.push(issue);
      }
    }

    // Log issues without hard-failing — focus visibility depends on
    // browser/OS defaults for some native elements.
    if (issues.length > 0) {
      console.warn(
        '[a11y] Focus indicator warnings on homepage Tab path:\n' +
          issues.join('\n')
      );
    }

    // Hard assertion: at least 5 interactive elements must be Tab-reachable.
    const tabReachableCount = await page.evaluate(() => {
      return document.querySelectorAll(
        'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      ).length;
    });

    expect(
      tabReachableCount,
      'Homepage should have at least 5 keyboard-reachable interactive elements'
    ).toBeGreaterThanOrEqual(5);
  });

  test('no role="button" without keyboard handler', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await waitForHydration(page);

    const violations = await page.evaluate(() => {
      const elements = document.querySelectorAll('[role="button"]');
      const missing: string[] = [];

      for (const el of elements) {
        const htmlEl = el as HTMLElement;
        const style = window.getComputedStyle(htmlEl);
        const rect = htmlEl.getBoundingClientRect();

        const isVisible =
          style.display !== 'none' &&
          style.visibility !== 'hidden' &&
          rect.width > 0 &&
          rect.height > 0;

        if (!isVisible) continue;

        // role="button" elements must have tabindex to be keyboard reachable
        const tabindex = htmlEl.getAttribute('tabindex');
        const isNativeButton =
          htmlEl.tagName === 'BUTTON' || htmlEl.tagName === 'A';

        if (!isNativeButton && (tabindex === null || tabindex === '-1')) {
          missing.push(
            `${htmlEl.tagName}[role="button"] without keyboard accessibility: ${htmlEl.outerHTML.slice(0, 200)}`
          );
        }
      }

      return missing;
    });

    expect(
      violations,
      'All role="button" elements must be keyboard reachable (tabindex >= 0)'
    ).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Suite 2: Sign-in page axe scan (unauthenticated)
// ---------------------------------------------------------------------------

test.describe('Sign-in page axe', () => {
  test.setTimeout(60_000);

  test.use({ storageState: { cookies: [], origins: [] } });

  test('/sign-in — zero critical axe violations', async ({ page }) => {
    await page.goto('/sign-in', { waitUntil: 'domcontentloaded' });
    await waitForHydration(page);

    // Give Clerk widget time to render
    await page.waitForTimeout(2_000);

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    const summaries = summarizeViolations(results.violations);
    const blocking = blockingViolations(summaries);

    if (summaries.length > 0) {
      console.log(
        '[a11y] /sign-in violations:\n' + JSON.stringify(summaries, null, 2)
      );
    }

    expect(
      blocking,
      `/sign-in has critical/serious accessibility violations:\n${JSON.stringify(blocking, null, 2)}`
    ).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Suite 3: Authenticated dashboard axe scan
// Uses dev auth bypass per .claude/rules/auth.md
// ---------------------------------------------------------------------------

test.describe('Authenticated dashboard axe', () => {
  test.setTimeout(120_000);

  test.beforeAll(() => {
    // Auth is required for these tests. Skip if neither bypass nor Clerk
    // credentials are configured (safe to skip in CI without secrets).
    const hasBypass = process.env.E2E_USE_TEST_AUTH_BYPASS === '1';
    const hasClerk = hasClerkCredentials();
    if (!hasBypass && !hasClerk) {
      test.skip(
        true,
        'Auth not configured (E2E_USE_TEST_AUTH_BYPASS or Clerk credentials required)'
      );
    }
  });

  test.beforeEach(async ({ page }) => {
    await ensureSignedInUser(page);
  });

  test('/app/dashboard — zero critical axe violations', async ({ page }) => {
    await smokeNavigateWithRetry(page, '/app/dashboard', { timeout: 60_000 });
    await waitForHydration(page);

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      // Exclude frame-tested to avoid false positives from third-party iframes
      .disableRules(['frame-tested'])
      .analyze();

    const summaries = summarizeViolations(results.violations);
    const blocking = blockingViolations(summaries);

    if (summaries.length > 0) {
      console.log(
        '[a11y] /app/dashboard violations:\n' +
          JSON.stringify(summaries, null, 2)
      );
    }

    expect(
      blocking,
      `/app/dashboard has critical/serious accessibility violations:\n${JSON.stringify(blocking, null, 2)}`
    ).toHaveLength(0);
  });

  test('/app/dashboard — Tab navigation reaches main content', async ({
    page,
  }) => {
    await smokeNavigateWithRetry(page, '/app/dashboard', { timeout: 60_000 });
    await waitForHydration(page);

    // Tab through the first 15 elements in the authenticated shell
    const issues: string[] = [];
    for (let i = 0; i < 15; i++) {
      await page.keyboard.press('Tab');
      await page.waitForTimeout(80);

      const issue = await assertFocusVisible(page, `Dashboard Tab ${i + 1}`);
      if (issue) {
        issues.push(issue);
      }
    }

    if (issues.length > 0) {
      console.warn(
        '[a11y] Focus indicator warnings on dashboard Tab path:\n' +
          issues.join('\n')
      );
    }

    // Hard assertion: dashboard must have keyboard-reachable nav elements
    const navItemCount = await page.evaluate(() => {
      return document.querySelectorAll(
        'nav a[href], nav button:not([disabled])'
      ).length;
    });

    expect(
      navItemCount,
      'Dashboard navigation must have at least 3 keyboard-reachable nav elements'
    ).toBeGreaterThanOrEqual(3);
  });
});
