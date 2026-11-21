/**
 * Nested merged-with-base pool width, measured long-pole substrings, and
 * PR path-gates for expensive invariant segments that merge-group structural
 * still runs in full via `pnpm invariants:check`.
 * Kept outside ci-fast-lanes.mjs so the company size budget stays green.
 */

/** Intended nested pool width (must not inherit top-level SOURCE_GUARD=3). */
export const MERGED_WITH_BASE_POOL_CONCURRENCY = 4;

/**
 * Ordering only: `command.includes(pole)` against expanded pool commands.
 * Measured on #26231 AUT 4/4 Validate (run 44847797082): design-ci-judge ~70s,
 * screen-cert ~61s, gem-priority ~34s, lint:seo ~33s, linear ~24s, registry ~16s.
 */
export const MERGED_WITH_BASE_POOL_LONG_POLES = Object.freeze([
  'design-ci-judge-router',
  'screen-certification.test.mjs',
  'gem-priority-gate.test.py',
  'lint:seo',
  'tests/unit/api/webhooks/linear.test.ts',
  'scripts/invariants/registry.test.mjs',
]);

/**
 * Unique substring of the ~70s web vitest cluster inside `invariants:check`
 * (not the cheaper `design-ci-judge-router-contract.test.mjs` node --test batch).
 */
export const DESIGN_CI_JUDGE_VITEST_MARKER =
  'scripts/design-ci-judge-router.test.ts';

/**
 * Paths that require the design-ci-judge vitest cluster on the PR merged-with-base
 * pool. Includes judge sources plus runtime data deps the router test loads
 * (`canon/invariants.jsonl` via registry.mjs, screen-certification /
 * screen-registry, appScreens + marketing component registries). Does not list
 * every unit source path (e.g. page.tsx) — those are metadata strings in the
 * registries; content edits alone do not change routing assertions.
 * Merge-group structural still runs the full `invariants:check` chain.
 * Empty/unreadable diffs fail closed (keep the entry).
 */
export const DESIGN_CI_JUDGE_VITEST_PATHS =
  /^(?:apps\/web\/(?:scripts\/design-ci-judge|lib\/agent-os\/design-ci-judge|app\/api\/internal\/ovie\/(?:design-ci-judge-evidence|certification-evidence)|data\/(?:appScreens\/|marketing\/)|package\.json$|vitest\.config\.mts$)|scripts\/invariants\/(?:design-ci-judge|registry\.mjs$|screen-certification|screen-registry)|canon\/invariants\.jsonl$|scripts\/lib\/merged-with-base-pool-config\.mjs$|scripts\/lib\/ci-source-guard-pool\.mjs$|scripts\/ci-fast-lanes\.mjs$|package\.json$)/u;

/**
 * Unique substring of the ~61s screen-certification node --test segment
 * (split from latency-sensitive so the path-gate cannot drop that suite).
 */
export const SCREEN_CERTIFICATION_TEST_MARKER =
  'scripts/invariants/screen-certification.test.mjs';

/**
 * Paths that require screen-certification.test.mjs on the PR merged-with-base
 * pool. Covers the certification module, its screen-* / browser-owned-input /
 * product-reference helpers, registry data, and pool-control modules.
 * Latency-sensitive stays a separate always-on segment after the package.json
 * split. Merge-group structural still runs full `invariants:check`.
 */
export const SCREEN_CERTIFICATION_TEST_PATHS =
  /^(?:scripts\/invariants\/(?:screen-certification|screen-registry|screen-decision-routing|screen-proof-resolver|screen-proof-emit|browser-owned-input|product-reference-coherence|registry\.mjs$)|apps\/web\/tests\/product-screenshots\/|\.github\/workflows\/screenshots\.yml$|canon\/invariants\.jsonl$|scripts\/lib\/merged-with-base-pool-config\.mjs$|scripts\/lib\/ci-source-guard-pool\.mjs$|scripts\/ci-fast-lanes\.mjs$|package\.json$)/u;

/** @type {readonly {marker: string, paths: RegExp, reason: string}[]} */
const MERGED_WITH_BASE_PATH_GATES = Object.freeze([
  {
    marker: DESIGN_CI_JUDGE_VITEST_MARKER,
    paths: DESIGN_CI_JUDGE_VITEST_PATHS,
    reason: 'design-ci-judge vitest; no related paths in PR diff',
  },
  {
    marker: SCREEN_CERTIFICATION_TEST_MARKER,
    paths: SCREEN_CERTIFICATION_TEST_PATHS,
    reason: 'screen-certification tests; no related paths in PR diff',
  },
]);

/**
 * Filter expanded merged-with-base pool entries for PR path-gates.
 * @param {readonly {id: string, command: string}[]} entries
 * @param {readonly string[] | null | undefined} changedFiles
 *   `null`/empty = fail closed (keep every entry)
 * @returns {{kept: {id: string, command: string}[], skipped: {id: string, command: string, reason: string}[]}}
 */
export function filterMergedWithBasePoolEntries(entries, changedFiles) {
  const failClosed =
    changedFiles == null ||
    !Array.isArray(changedFiles) ||
    changedFiles.length === 0;
  /** @type {{id: string, command: string}[]} */
  const kept = [];
  /** @type {{id: string, command: string, reason: string}[]} */
  const skipped = [];
  for (const entry of entries) {
    if (!failClosed) {
      const gate = MERGED_WITH_BASE_PATH_GATES.find(
        g =>
          entry.command.includes(g.marker) &&
          !changedFiles.some(file => g.paths.test(file))
      );
      if (gate) {
        skipped.push({
          id: entry.id,
          command: entry.command,
          reason: gate.reason,
        });
        continue;
      }
    }
    kept.push(entry);
  }
  return { kept, skipped };
}
