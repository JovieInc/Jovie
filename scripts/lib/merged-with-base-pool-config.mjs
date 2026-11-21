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
 * pool. Merge-group structural still runs the full `invariants:check` chain.
 * Empty/unreadable diffs fail closed (keep the entry).
 */
export const DESIGN_CI_JUDGE_VITEST_PATHS =
  /^(?:apps\/web\/(?:scripts\/design-ci-judge|lib\/agent-os\/design-ci-judge|app\/api\/internal\/ovie\/(?:design-ci-judge-evidence|certification-evidence))|scripts\/invariants\/design-ci-judge|scripts\/lib\/merged-with-base-pool-config\.mjs$|scripts\/lib\/ci-source-guard-pool\.mjs$|scripts\/ci-fast-lanes\.mjs$|package\.json$)/u;

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
    if (
      !failClosed &&
      entry.command.includes(DESIGN_CI_JUDGE_VITEST_MARKER) &&
      !changedFiles.some(file => DESIGN_CI_JUDGE_VITEST_PATHS.test(file))
    ) {
      skipped.push({
        id: entry.id,
        command: entry.command,
        reason: 'design-ci-judge vitest; no related paths in PR diff',
      });
      continue;
    }
    kept.push(entry);
  }
  return { kept, skipped };
}
