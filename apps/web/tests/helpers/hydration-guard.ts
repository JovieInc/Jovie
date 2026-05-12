/**
 * hydration-guard.ts
 *
 * Pure helper for detecting React SSR/CSR hydration mismatches in Playwright tests.
 * No Playwright imports — works in both Vitest unit tests and Playwright E2E.
 *
 * Usage in a Playwright fixture (setup.ts):
 *
 *   import { isHydrationMismatch, assertNoHydrationMismatches } from '../helpers/hydration-guard';
 *
 *   const hydrationMismatches: string[] = [];
 *   page.on('console', msg => {
 *     if (msg.type() === 'error' || msg.type() === 'warning') {
 *       const text = msg.text();
 *       if (isHydrationMismatch(text)) hydrationMismatches.push(text);
 *     }
 *   });
 *
 *   await runPage(page);
 *   assertNoHydrationMismatches(hydrationMismatches);
 */

/**
 * All known React hydration warning/error phrases.
 * Covers React 18 production and development message variants.
 */
export const HYDRATION_MISMATCH_PATTERNS: readonly RegExp[] = [
  /Hydration failed because/i,
  /There was an error while hydrating/i,
  /server.*did not match.*client/i,
  /client.*did not match.*server/i,
  /Text content does not match/i,
  /Prop `.*` did not match/i,
  /Expected server HTML to contain/i,
  /In HTML, .* cannot be a descendant of/i,
] as const;

/**
 * Messages that are known-noisy third-party strings which should NOT be treated
 * as hydration failures even if they match a pattern above.
 * Starts empty — add only real production exclusions with a comment.
 */
export const HYDRATION_ALLOWLIST: readonly string[] = [] as const;

/**
 * Returns true if the console message text represents a React hydration mismatch
 * AND is not in the allowlist.
 */
export function isHydrationMismatch(text: string): boolean {
  if (!text) return false;

  const isAllowlisted = HYDRATION_ALLOWLIST.some(allowed =>
    text.includes(allowed)
  );
  if (isAllowlisted) return false;

  return HYDRATION_MISMATCH_PATTERNS.some(pattern => pattern.test(text));
}

/**
 * Throws an Error listing all collected hydration mismatches.
 * Call this after `await runPage(page)` in the Playwright fixture.
 */
export function assertNoHydrationMismatches(
  mismatches: readonly string[]
): void {
  if (mismatches.length === 0) return;

  const formatted = mismatches.map((msg, i) => `  ${i + 1}. ${msg}`).join('\n');

  throw new Error(
    `React hydration mismatch(es) detected during test (${mismatches.length} total):\n${formatted}\n\n` +
      'Fix the SSR/CSR desync or add an entry to HYDRATION_ALLOWLIST if this is a known third-party noise.'
  );
}
