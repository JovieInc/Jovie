export const LANE_GROUPS = Object.freeze({
  typecheck: Object.freeze([
    'typecheck',
    'web-tests-typecheck',
    'web-stories-typecheck',
  ]),
  remaining: Object.freeze([
    'biome',
    'eslint-server-boundaries',
    'shadcn-lint-contracts',
    'scripts-typecheck',
    'guardrails',
    'design-system-source-ratchet',
    'design-exception-registry',
    'design-governance-enforcement',
    'pen-token-parity',
    'ios-fast',
    'billing-coverage',
    'copy-gate',
    'source-guards',
    'node-runtime-contracts',
    'structural',
  ]),
  // ci-fast (structural web) runs these in the background while its structural
  // web commands run. They were the two slowest cheap lanes left in remaining
  // (38s + 35s of a ~150s serial chain that outlasted remaining's structural
  // lane, merge-group run 36270458408); web finished ~100s before remaining.
  // merge-group-guards: repo-wide unit guards that used to run only in merge
  // groups, so PRs green on PR CI poisoned the queue (3 stalls, 2026-09-27).
  web: Object.freeze([
    'design-conformance',
    'profile-admission',
    'merge-group-guards',
  ]),
});
