/**
 * Playwright helper: assert that a target element remains stably mounted
 * and visible during a user interaction or async data churn window.
 *
 * Catches gotcha class #3 from JOV-2148: state flicker during async churn
 * (drawer briefly closes during query refetch, table remounts on window
 * focus, skeleton flashes on background refetch).
 *
 * Usage:
 *
 * ```ts
 * await assertDomStable(page, {
 *   selector: '[data-testid="profile-drawer"][data-state="open"]',
 *   absentSelector: '[data-testid="release-table-skeleton"]',
 *   durationMs: 2000,
 *   while: async () => {
 *     // trigger refetch / mutation here
 *     await page.evaluate(() => window.dispatchEvent(new Event('focus')));
 *   },
 * });
 * ```
 *
 * The helper polls the DOM at `intervalMs` and fails the test if at any
 * sample the present selector is missing OR the absent selector appears.
 */
import type { Page } from '@playwright/test';

export interface DomStabilityOptions {
  /** Selector that MUST remain present and visible the entire window. */
  readonly selector?: string;
  /** Selector that MUST NOT appear at any point in the window. */
  readonly absentSelector?: string;
  /** Window length in ms. Default 2000. */
  readonly durationMs?: number;
  /** Sample interval in ms. Default 50. */
  readonly intervalMs?: number;
  /** Async work to run concurrently with the observation. */
  readonly while?: () => Promise<void>;
}

export interface DomStabilityViolation {
  readonly tMs: number;
  readonly reason: 'missing-present' | 'unexpected-absent';
  readonly selector: string;
}

export async function assertDomStable(
  page: Page,
  options: DomStabilityOptions
): Promise<void> {
  const duration = options.durationMs ?? 2000;
  const interval = options.intervalMs ?? 50;
  // Fail fast on misconfiguration. A silently-passing stability check is
  // worse than no check at all — it produces false confidence that the
  // DOM was stable when the helper simply never observed anything.
  // (CodeRabbit JOV-2149 review.)
  if (duration <= 0) {
    throw new Error('assertDomStable: durationMs must be > 0');
  }
  if (interval <= 0) {
    throw new Error('assertDomStable: intervalMs must be > 0');
  }
  if (!options.selector && !options.absentSelector) {
    throw new Error(
      'assertDomStable: provide selector and/or absentSelector — nothing to observe'
    );
  }
  const violations: DomStabilityViolation[] = [];
  const start = Date.now();

  const observation = (async () => {
    while (Date.now() - start < duration) {
      const tMs = Date.now() - start;
      if (options.selector) {
        const ok = await page.locator(options.selector).first().isVisible();
        if (!ok)
          violations.push({
            tMs,
            reason: 'missing-present',
            selector: options.selector,
          });
      }
      if (options.absentSelector) {
        const present = await page
          .locator(options.absentSelector)
          .first()
          .count();
        if (present > 0)
          violations.push({
            tMs,
            reason: 'unexpected-absent',
            selector: options.absentSelector,
          });
      }
      await page.waitForTimeout(interval);
    }
  })();

  await Promise.all([observation, options.while?.() ?? Promise.resolve()]);

  if (violations.length === 0) return;

  const lines = violations
    .slice(0, 10)
    .map(v => `  - t=${v.tMs}ms ${v.reason} ${v.selector}`)
    .join('\n');
  throw new Error(
    `DOM stability violated (${violations.length} sample(s) failed):\n${lines}`
  );
}
