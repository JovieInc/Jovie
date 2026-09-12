#!/usr/bin/env node
/**
 * Strict eval gate for Summer bounded-operator goal.
 * Exit 0 only when local E2–E5 suites pass. E1 remains externally gated on
 * Gem deploy of merged PR #17725 attestation publisher (on main).
 *
 * Note: apps/eve-pilot is excluded from the pnpm workspace, so its suite is
 * invoked with cwd=apps/eve-pilot (not --filter).
 */
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');

function run(label, command, args, options = {}) {
  console.log(`\n== ${label} ==`);
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? root,
    encoding: 'utf8',
    env: process.env,
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  const combined = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  if (result.status !== 0) {
    console.error(`FAIL: ${label}`);
    process.exit(result.status ?? 1);
  }
  if (
    options.requirePassed &&
    !/\b(Test Files|PASS).*passed\b/i.test(combined) &&
    !/\bTests\s+\d+\s+passed\b/i.test(combined)
  ) {
    console.error(`FAIL: ${label} (no passing vitest summary)`);
    process.exit(1);
  }
  if (
    options.forbidNoMatch &&
    /No projects matched the filters/i.test(combined)
  ) {
    console.error(`FAIL: ${label} (package filter matched nothing)`);
    process.exit(1);
  }
  console.log(`PASS: ${label}`);
}

run(
  'E2/E5 operational memory',
  'pnpm',
  [
    '--filter',
    '@jovie/web',
    'exec',
    'vitest',
    'run',
    'tests/unit/ovie/operational-memory.test.ts',
  ],
  { requirePassed: true, forbidNoMatch: true }
);

run(
  'E3/E4 cursor recovery',
  'pnpm',
  ['exec', 'vitest', 'run', 'tests/cursor-recovery.test.ts'],
  { cwd: resolve(root, 'apps/eve-pilot'), requirePassed: true }
);

run(
  'E4 gem-dark outbox wiring',
  'pnpm',
  ['exec', 'vitest', 'run', 'tests/summer-gem-dark-recovery.test.ts'],
  { cwd: resolve(root, 'apps/eve-pilot'), requirePassed: true }
);

run(
  'E4 heartbeat attestation→Cursor bridge',
  'pnpm',
  ['exec', 'vitest', 'run', 'tests/summer-bottleneck-heartbeat.test.ts'],
  { cwd: resolve(root, 'apps/eve-pilot'), requirePassed: true }
);

run(
  'Governed dispatch: request outcome → router launches',
  'pnpm',
  ['exec', 'vitest', 'run', 'tests/summer-governed-dispatch.test.ts'],
  { cwd: resolve(root, 'apps/eve-pilot'), requirePassed: true }
);

run(
  'JOV-6163 publisher↔Summer attestation interop (600s gate intact)',
  'pnpm',
  ['exec', 'vitest', 'run', 'tests/jov-6163-attestation-interop.test.ts'],
  { cwd: resolve(root, 'apps/eve-pilot'), requirePassed: true }
);

run(
  'Acceptance: Gem-down → alternate → recovery → ownership → human decision',
  'pnpm',
  ['exec', 'vitest', 'run', 'tests/summer-bounded-operator-acceptance.test.ts'],
  { cwd: resolve(root, 'apps/eve-pilot'), requirePassed: true }
);

run(
  'E1 close-path readiness (Summer observation gate self-test)',
  'pnpm',
  ['exec', 'vitest', 'run', 'tests/e1-attestation-observation-gate.test.ts'],
  { cwd: resolve(root, 'apps/eve-pilot'), requirePassed: true }
);

run(
  'E5 identity packs',
  'pnpm',
  [
    '--filter',
    '@jovie/web',
    'exec',
    'vitest',
    'run',
    'tests/unit/ovie/identity.test.ts',
  ],
  { requirePassed: true, forbidNoMatch: true }
);

run(
  'E5 linear coordination',
  'pnpm',
  [
    '--filter',
    '@jovie/web',
    'exec',
    'vitest',
    'run',
    'tests/unit/ovie/linear-coordination.test.ts',
  ],
  { requirePassed: true, forbidNoMatch: true }
);

console.log(`
== E1 attestation delivery ==
EXTERNAL GATE: PR #17725 is MERGED to main — deploy/install publisher on Gem, prove two ≤600s fresh observations,
then confirm Summer no longer holds on runner-source-attestation-unavailable.
Operator install packet: docs/ops/summer-bounded-operator-e1-install.md
Post-install proof (same Summer predicates):
  node scripts/summer-commissioning/verify-e1-attestation-observations.mjs \
    --observation-a obs-a.json --observation-b obs-b.json
Local publisher tests: python3 scripts/symphony/tests/gem-service-attestation.test.py (on main).
Local close-path readiness (--self-test) is covered by the E1 observation gate suite above;
that does NOT close E1 without real Gem observations.
`);

console.log('Local strict evals E2–E5: GREEN');
