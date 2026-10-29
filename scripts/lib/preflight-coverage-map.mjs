/**
 * Preflight coverage map (the ratchet, PR #23573 follow-up): every check that
 * can fail a PR (ci-pr-ready and ci-fast needs, plus the separately required
 * workflows) either names the `pnpm preflight:changed` coverage kinds that run
 * it locally, or carries an explicit `preflight-exempt: <reason>`.
 * scripts/preflight-coverage-map.test.mjs fails when a required check appears
 * in CI with neither, so a new gate cannot ship invisible to local preflight.
 *
 * Kinds are PREFLIGHT_COVERAGE_KINDS in scripts/preflight-changed.mjs.
 * Key format: `<workflow file>#<job id>`.
 */
export const REQUIRED_CHECK_PREFLIGHT = Object.freeze({
  'ci.yml#ci-path-changes': {
    exempt:
      'preflight-exempt: path routing only, no source rule of its own; preflight selects by changed path itself',
  },
  'ci.yml#ci-risk-classifier': {
    exempt:
      'preflight-exempt: classifies risk for reviewers; its inputs are validated by ci:harness:check in the source guards',
  },
  'ci.yml#ci-fast-typecheck': { covers: ['typecheck'] },
  'ci.yml#ci-fast-remaining': {
    covers: ['biome', 'source-guards', 'design-guards', 'generators'],
  },
  'ci.yml#ci-profile-admission-browser': {
    exempt:
      'preflight-exempt: needs a built app and Playwright browser; too slow for a local pass',
  },
  'ci.yml#ci-fast-structural-python': {
    exempt:
      'preflight-exempt: lanes pytest suite (~336s) runs on the merge-group head; changed lanes tests run via the lanes-selftest source guard with --thorough',
  },
  'ci.yml#ci-fast-structural-web': {
    covers: ['source-guards', 'design-guards', 'generators'],
  },
  'ci.yml#ci-blog-content': {
    exempt:
      'preflight-exempt: content-only qualification, skipped unless a PR is blog-only',
  },
  'ci.yml#ci-exact-head-coverage': { covers: ['coverage'] },
  'ci.yml#ci-secret-scan': {
    exempt:
      'preflight-exempt: scripts/security/scan-secrets.sh runs in the commit hook; private-data guard covers the pushed range',
  },
  'ci.yml#ci-golden-path-lock': {
    exempt:
      'preflight-exempt: golden-path-lock merge-gate needs GitHub evidence; follow-up to run it locally',
  },
  'ci.yml#ci-visual-snapshot-compare': {
    exempt:
      'preflight-exempt: renders the homepage and marketing DOM in a browser against stored snapshots',
  },
  'source-validation.yml#deterministic': {
    covers: [
      'source-guards',
      'design-guards',
      'generators',
      'workflow-lint',
      'private-data',
      'ship-gate',
      'companion',
      'biome',
    ],
  },
  'pr-fleet-rules.yml#fleet': { covers: ['pr-body'] },
  'ci.yml#drizzle-migration-guard': { covers: ['migration'] },
  'pr-size-guard.yml#size': {
    exempt:
      'preflight-exempt: size budget is a split decision made at PR time; a label override exists',
  },
  'fork-pr-gate.yml#fork-gate': {
    exempt: 'preflight-exempt: only applies to fork PRs, never a local branch',
  },
});

/** Workflows whose single job is a separately required ruleset context. */
export const REQUIRED_WORKFLOW_JOBS = Object.freeze([
  ['source-validation.yml', 'deterministic'],
  ['pr-fleet-rules.yml', 'fleet'],
  ['ci.yml', 'drizzle-migration-guard'],
  ['pr-size-guard.yml', 'size'],
  ['fork-pr-gate.yml', 'fork-gate'],
]);
