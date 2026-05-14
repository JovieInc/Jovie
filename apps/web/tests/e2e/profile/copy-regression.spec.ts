/**
 * Profile copy regression (JOV-2028).
 *
 * Locks the visible copy on every profile route against a small set of
 * "this should never ship" regressions:
 *
 *   - Placeholder / temporary copy (Lorem ipsum, TODO, FIXME, TBD, etc.)
 *   - More than one visible button with the identical visible label
 *     (catches duplicate CTA clusters introduced by the route consolidation).
 *   - More than one element whose accessible label matches "Alerts" /
 *     "alert" (catches the duplicate alerts settings bug from JOV-2024).
 *
 * Tag: @regression — runs once per route at desktop. Reads are read-only,
 * so this is fast and low-flake.
 *
 * What this does NOT do: snapshot the entire visible text. Copy iterates
 * fast and snapshotting would generate constant churn. We only block the
 * "this is obviously wrong" patterns.
 */

import { type Page, test } from '@playwright/test';
import { expect } from '../setup';
import {
  PROFILE_MATRIX_ROUTES,
  PROFILE_METADATA_VIEWPORT,
} from '../utils/profile-route-matrix';
import { installPublicRouteMocks } from '../utils/public-surface-helpers';
import { SMOKE_TIMEOUTS, waitForHydration } from '../utils/smoke-test-utils';

test.use({
  storageState: { cookies: [], origins: [] },
});

/**
 * Patterns that should never appear in shipped UI copy.
 * Use word-boundary regexes so we don't false-positive on partial matches
 * (e.g. "todo" inside "todorovich").
 */
const PLACEHOLDER_PATTERNS: readonly RegExp[] = [
  /\blorem ipsum\b/i,
  /\bdolor sit amet\b/i,
  /\bplaceholder text\b/i,
  /\bTODO\b/,
  /\bFIXME\b/,
  /\bXXX\b/,
  /\bTBD\b/,
  /\bcoming soon — temporary\b/i,
  /\bdebug only\b/i,
];

async function waitForAnyVisible(
  page: Page,
  selectors: readonly string[],
  timeout = SMOKE_TIMEOUTS.VISIBILITY
) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    for (const selector of selectors) {
      const visible = await page
        .locator(selector)
        .first()
        .isVisible()
        .catch(() => false);
      if (visible) return selector;
    }
    await page.waitForTimeout(150);
  }
  throw new Error(
    `None of the expected selectors became visible: ${selectors.join(', ')}`
  );
}

async function collectVisibleButtonLabels(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const labels: string[] = [];
    const nodes = document.querySelectorAll('button, [role="button"], a');
    for (const node of nodes) {
      const element = node as HTMLElement;
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      const visible =
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        style.opacity !== '0' &&
        element.getAttribute('aria-hidden') !== 'true' &&
        rect.width > 0 &&
        rect.height > 0;
      if (!visible) continue;

      // Skip elements inside a dropdown menu, dialog overlay, or screen-reader
      // sr-only region — those legitimately repeat labels by design.
      if (
        element.closest(
          '[role="menu"], [role="dialog"], [role="listbox"], [role="tablist"], .sr-only, [aria-hidden="true"]'
        )
      ) {
        continue;
      }

      const label =
        element.getAttribute('aria-label') ||
        (element.textContent ?? '').trim();
      const normalized = label.replace(/\s+/g, ' ').trim();
      if (normalized.length > 0 && normalized.length <= 40) {
        labels.push(normalized);
      }
    }
    return labels;
  });
}

async function assertNoPlaceholderCopy(page: Page, label: string) {
  const bodyText = await page
    .locator('body')
    .first()
    .innerText({ timeout: SMOKE_TIMEOUTS.QUICK });

  const matchedPatterns = PLACEHOLDER_PATTERNS.filter(pattern =>
    pattern.test(bodyText)
  ).map(pattern => pattern.source);

  expect(
    matchedPatterns,
    `${label} contains placeholder/temporary copy: ${matchedPatterns.join(', ')}`
  ).toEqual([]);
}

async function assertNoDuplicateCtaClusters(page: Page, label: string) {
  const labels = await collectVisibleButtonLabels(page);
  const counts = new Map<string, number>();
  for (const text of labels) {
    counts.set(text, (counts.get(text) ?? 0) + 1);
  }

  // We allow up to 1 duplicate (e.g., a CTA repeated in header + footer is
  // common). Beyond that almost always indicates accidental duplication.
  // Also allow common safe-by-design repetitions like icon-only triggers
  // (which we already filter via aria-hidden + role="tablist" exclusion).
  const offenders = Array.from(counts.entries())
    .filter(([, count]) => count > 2)
    // Exclude well-known intentional duplications:
    .filter(([text]) => {
      const lower = text.toLowerCase();
      return (
        // Tab labels that legitimately appear in tab bar + drawer
        !['home', 'music', 'events', 'alerts', 'more'].includes(lower) &&
        // Empty / generic icon-only buttons
        lower.length > 0
      );
    });

  expect(
    offenders,
    `${label} has duplicate CTA clusters: ${offenders
      .map(([text, count]) => `"${text}" (×${count})`)
      .join(', ')}`
  ).toEqual([]);
}

async function assertNoDuplicateAlertsLabel(page: Page, label: string) {
  // Specifically guard the "Alerts" duplication regression that happened
  // during JOV-2024 (the subscribe drawer rendered a second "Alerts" header
  // beside the tab bar's "Alerts" button).
  const alertHeaders = await page
    .locator('h1, h2, h3')
    .filter({ hasText: /^\s*alerts?\s*$/i })
    .count();

  expect(
    alertHeaders,
    `${label} renders more than one "Alerts" heading`
  ).toBeLessThanOrEqual(1);
}

test.describe('Public profile copy regression @regression', () => {
  test.setTimeout(120_000);

  for (const route of PROFILE_MATRIX_ROUTES) {
    test(`${route.id} ships no placeholder or duplicate copy`, async ({
      browser,
    }, testInfo) => {
      const context = await browser.newContext({
        ...testInfo.project.use,
        storageState: { cookies: [], origins: [] },
        viewport: {
          width: PROFILE_METADATA_VIEWPORT.width,
          height: PROFILE_METADATA_VIEWPORT.height,
        },
      });
      const page = await context.newPage();
      const label = route.id;

      try {
        await installPublicRouteMocks(page);
        const response = await page.goto(route.path, {
          waitUntil: 'domcontentloaded',
          timeout: 120_000,
        });
        expect(
          response?.status() ?? 0,
          `${label} should not server-error`
        ).toBeLessThan(500);

        await waitForHydration(page);
        await waitForAnyVisible(page, route.readySelectors);

        await assertNoPlaceholderCopy(page, label);
        await assertNoDuplicateCtaClusters(page, label);
        await assertNoDuplicateAlertsLabel(page, label);
      } finally {
        await page.close().catch(() => undefined);
        await context.close().catch(() => undefined);
      }
    });
  }
});
