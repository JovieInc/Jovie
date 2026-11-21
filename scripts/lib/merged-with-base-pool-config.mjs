/**
 * Nested merged-with-base pool width and measured long-pole substrings.
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
