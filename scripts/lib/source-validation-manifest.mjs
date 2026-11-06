/**
 * Single manifest of the Source Validation guards that can run before a push.
 *
 * `pnpm preflight:changed` (scripts/preflight-changed.mjs) runs every entry
 * here whose `when` matches a changed path. scripts/lib/__tests__/
 * source-validation-manifest.test.mjs derives every command the `deterministic`
 * job ("Source Validation") runs from the workflow and fails unless each one is
 * either `covers`-ed by a guard below or listed in NOT_LOCAL with a reason, so a
 * guard added to the workflow cannot be forgotten here (PR #24021: five CI
 * rounds, each failing a guard preflight did not run).
 *
 * To add a guard: append it to SOURCE_VALIDATION_GUARDS (fast, static, path
 * scoped) or NOT_LOCAL (heavy, CI-only or covered elsewhere, with the reason).
 */
import { readFileSync } from 'node:fs';

const WORKFLOWS = /^\.github\/(?:workflows|actions)\//;

/**
 * @typedef {object} Guard
 * @property {string} id
 * @property {string} name
 * @property {string} command  `{base}` expands to the base branch name.
 * @property {RegExp} when     changed-path trigger
 * @property {string[]} covers workflow command substrings this guard runs
 * @property {boolean} [heavy] deferred unless --thorough
 * @property {string} [workflow] workflow file the covered commands live in
 *                              (default source-validation.yml)
 * @property {number} [phase]  1 (default) or 2 (after phase 1)
 */

/** @type {readonly Guard[]} */
export const SOURCE_VALIDATION_GUARDS = Object.freeze([
  {
    id: 'wf:refs',
    name: 'workflow references',
    command: 'node scripts/verify-workflow-references.mjs',
    when: WORKFLOWS,
    covers: ['scripts/verify-workflow-references.mjs'],
  },
  {
    id: 'wf:budget',
    name: 'workflow expression budget',
    command:
      'node scripts/workflow-expression-budget.mjs --ref HEAD --merge-with origin/{base}',
    when: WORKFLOWS,
    covers: ['scripts/workflow-expression-budget.mjs'],
  },
  {
    id: 'wf:token-scope',
    name: 'workflow token scope (+ test)',
    command:
      'node scripts/workflow-token-scope.mjs && node --test scripts/workflow-token-scope.test.mjs',
    when: /^(?:\.github\/(?:workflows|actions)\/|scripts\/workflow-token-scope)/,
    covers: [
      'scripts/workflow-token-scope.mjs',
      'scripts/workflow-token-scope.test.mjs',
    ],
  },
  {
    id: 'wf:token-budget',
    name: 'workflow github-token budget declaration',
    command: 'node scripts/workflow-token-budget-guard.mjs',
    when: /^(?:\.github\/(?:workflows|actions)\/|scripts\/(?:lib\/)?workflow-token-budget)/,
    covers: ['scripts/workflow-token-budget-guard.mjs'],
    workflow: 'pr-fleet-rules.yml',
  },
  {
    id: 'wf:control-tests',
    name: 'workflow topology + runner-pin tests',
    command:
      'node --test scripts/ci-workflow-topology.test.mjs scripts/workflow-runner-pin-check.test.mjs',
    when: /^(?:\.github\/|scripts\/(?:ci-workflow-topology|workflow-runner-pin-check))/,
    covers: ['scripts/ci-workflow-topology.test.mjs'],
  },
  {
    // Also enforces runner pins (workflow-runner-pin-check) and a fresh
    // .github/workflow-topology.gen.yml.
    id: 'wf:topology',
    name: 'workflow topology + runner pins',
    command: 'node scripts/ci-workflow-topology.mjs',
    when: /^(?:\.github\/|scripts\/(?:ci-workflow-topology|workflow-runner-pin-check)|canon\/)/,
    covers: ['scripts/ci-workflow-topology.mjs'],
  },
  {
    id: 'ownership',
    name: 'ownership registry',
    command:
      'node --test scripts/ownership-registry.test.mjs && node scripts/ownership-registry.mjs --report',
    when: /^(?:\.github\/workflows\/|canon\/|scripts\/ownership-registry)/,
    covers: ['pnpm ownership:check'],
  },
  {
    id: 'sources-of-truth',
    name: 'sources-of-truth map',
    command: 'node scripts/sources-of-truth.mjs',
    when: /^(?:canon\/(?:sources-of-truth\.json|SOURCES_OF_TRUTH\.md)|\.claude\/rules\/source-of-truth\.md|scripts\/(?:lib\/)?sources-of-truth|apps\/web\/lib\/(?:config\/plan-prices|entitlements\/registry|analytics\/data-retention)|ops\/registry\/)/,
    covers: ['scripts/sources-of-truth.mjs'],
  },
  {
    id: 'duplicate-literals',
    name: 'no copied owner values (prices, names, retention, limits)',
    command: 'node scripts/invariants/duplicate-literals.mjs',
    when: /^apps\/(?:web|docs)\/(?:app|components|data|content|lib)\//,
    covers: ['scripts/invariants/duplicate-literals.mjs'],
  },
  {
    id: 'lockfile',
    name: 'lockfile specifiers',
    command: 'node scripts/lockfile-specifier-preflight.mjs',
    when: /(?:^|\/)package\.json$|pnpm-lock\.yaml$/,
    covers: ['scripts/lockfile-specifier-preflight.mjs'],
  },
  {
    id: 'agent-context',
    name: 'agent-context size and contracts',
    command: 'node --run agent-context:check',
    when: /^(?:CLAUDE\.md|AGENTS\.md|\.claude\/|docs\/agent-context|canon\/)/,
    covers: ['agent-context:check'],
  },
  {
    id: 'release-incident',
    name: 'CI release incident contract',
    command: 'node scripts/ci-release-incident-contract.mjs',
    when: /^(?:\.github\/|scripts\/ci-release)/,
    covers: ['scripts/ci-release-incident-contract.mjs'],
  },
  {
    id: 'a11y-standard',
    name: 'WCAG standard check',
    command: 'node apps/web/scripts/a11y-wcag-standard-check.cjs',
    when: /^(?:apps\/web\/scripts\/a11y|\.github\/)/,
    covers: ['a11y-wcag-standard-check'],
  },
  {
    id: 'ci-harness',
    name: 'CI harness (validate, liveness, generated docs)',
    command: 'pnpm ci:harness:check',
    when: /^(?:\.github\/|scripts\/(?:ci-harness|lib\/policy-gate)|docs\/ci-harness)/,
    covers: ['pnpm ci:harness:check'],
  },
  {
    id: 'screen-registration',
    name: 'screen registration gate',
    command: 'pnpm screen-registration-gate',
    when: /^(?:apps\/web\/(?:app|components)\/|scripts\/invariants\/screen-)/,
    covers: ['pnpm screen-registration-gate'],
  },
  {
    id: 'layout-guard-pen',
    name: 'layout-guard pen contracts still rendered',
    command: 'node scripts/layout-guard-pen-contracts.mjs',
    when: /^(?:apps\/web\/(?:app|components|data)\/|scripts\/layout-guard-pen)/,
    covers: ['scripts/layout-guard-pen-contracts.mjs'],
  },
  {
    // Measured >180s on a laptop: CI-grade, run with --thorough.
    id: 'control-affected',
    name: 'control-plane affected tests (script wiring in ci-fast-lanes)',
    command: 'node scripts/run-affected-tests.mjs --control',
    when: /^(?:scripts\/|\.github\/)/,
    covers: ['scripts/run-affected-tests.mjs --control'],
    heavy: true,
  },
]);

/**
 * Workflow commands that preflight:changed does not run through the guard list,
 * each with the reason. `match` is a substring of the normalised command.
 */
export const NOT_LOCAL = Object.freeze([
  { match: 'prime-node-toolcache', reason: 'CI runner toolcache' },
  {
    match: 'dependency-parity-evidence',
    reason: 'writes a CI evidence artifact',
  },
  {
    match: 'changelog-source-guard',
    reason:
      'needs github.token; preflight:changed checks the changelog marker from the PR body',
  },
  {
    match: 'SOURCE_DEPENDENCY_HELPER',
    reason: 'CI merged-source dependency transaction',
  },
  {
    match: 'source-guard-action-snapshot',
    reason: 'CI merged-source transaction',
  },
  { match: 'node --input-type=module', reason: 'CI merged-source transaction' },
  {
    match: 'agent-context/merge-budget',
    reason:
      'needs the merged tree; agent-context guard covers the size locally',
  },
  { match: 'agent-context:test', reason: 'coverage-gated unit run, CI only' },
  {
    match: 'design-frontend-skill-check',
    reason: 'needs the trusted base ref; ships with design changes in CI',
  },
  { match: 'product-lane-classifier', reason: 'classification, not a verdict' },
  { match: 'run-actionlint', reason: 'actionlint binary is CI-installed' },
  {
    match: 'performance-factory',
    reason: 'performance policy binding, CI only',
  },
  {
    match: 'typecheck',
    reason:
      'preflight:changed typechecks affected packages (tsc:*) unless --no-typecheck',
  },
  {
    match: 'biome:check',
    reason: 'preflight:changed runs biome on changed files',
  },
  { match: 'lint:motion-css', reason: 'covered by the web lint pass in CI' },
  { match: 'component-ship-gate', reason: 'preflight:changed ship-gate check' },
  {
    match: 'mac-header-two-lines-v1',
    reason: 'preflight:changed merge-group-unit-guards (narrowed)',
  },
  {
    match: '@jovie/cli',
    reason: 'CLI publication gate, only on CLI/API path changes; CI',
  },
]);

/** Normalise one shell word-run to a comparable command string. */
const clean = s => s.replace(/\s+/g, ' ').trim();

/**
 * Every command the job runs, flattened: statements split on `&&`/newlines,
 * comments dropped, `pnpm <script>` / `node --run <script>` expanded through
 * package.json unless the manifest already covers the umbrella.
 *
 * @param {string[]} runScripts the `run:` text of each job step
 * @param {Record<string,string>} pkgScripts root package.json scripts
 * @param {(cmd:string)=>boolean} isCovered
 */
export function workflowCommands(runScripts, pkgScripts, isCovered) {
  const out = new Set();
  const visit = (cmd, depth) => {
    const text = cmd
      .split('\n')
      .filter(l => !l.trim().startsWith('#'))
      .join('\n')
      .replace(/\\\n/g, ' ');
    for (const piece of text.split(/\s*&&\s*|\n/)) {
      const atom = clean(piece.replace(/^\(\s*/, ''));
      if (!/^(?:node|pnpm|bash|python3?)\b/.test(atom)) continue;
      if (isCovered(atom)) {
        out.add(atom);
        continue;
      }
      const m = atom.match(/^(?:pnpm(?: run)?|node --run) ([\w:.-]+)$/);
      if (m && pkgScripts[m[1]] && depth < 4)
        visit(pkgScripts[m[1]], depth + 1);
      else out.add(atom);
    }
  };
  for (const run of runScripts) visit(run, 0);
  return [...out];
}

export const coveredBy = atom =>
  SOURCE_VALIDATION_GUARDS.some(g => g.covers.some(c => atom.includes(c))) ||
  NOT_LOCAL.some(n => atom.includes(n.match));

/** Guards whose trigger matches the changed paths, `{base}` expanded. */
export function selectManifestGuards(paths, base = 'main') {
  return SOURCE_VALIDATION_GUARDS.filter(g =>
    paths.some(p => g.when.test(p))
  ).map(g => ({ ...g, command: g.command.replaceAll('{base}', base) }));
}

export function readRunScripts(workflowText, deriveSteps) {
  return deriveSteps(workflowText)
    .map(s => s.run)
    .filter(Boolean);
}

export const readJson = file => JSON.parse(readFileSync(file, 'utf8'));
