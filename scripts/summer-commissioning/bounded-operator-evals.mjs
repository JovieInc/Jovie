#!/usr/bin/env node
/**
 * Summer bounded-operator eval gate.
 *
 * On the full umbrella / after all size-splits land, runs E2–E5 + E1 readiness.
 * On the E1 commissioning size-split alone, only the suites present in-tree run;
 * missing suites are reported as STACKED_PENDING (not a greenwash of E1 close).
 *
 * E1 live Gem install + two ≤600s observations remain EXTERNAL regardless.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const eve = resolve(root, 'apps/eve-pilot');
const web = resolve(root, 'apps/web');

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
  console.log(`PASS: ${label}`);
}

function maybe(label, path, runner) {
  if (!existsSync(path)) {
    console.log(`\n== ${label} ==`);
    console.log(`STACKED_PENDING: ${path} not in this checkout`);
    return false;
  }
  runner();
  return true;
}

let ran = 0;

if (
  maybe(
    'E2/E5 operational memory',
    resolve(web, 'tests/unit/ovie/operational-memory.test.ts'),
    () =>
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
        { requirePassed: true }
      )
  )
)
  ran++;

for (const [label, rel] of [
  ['E3/E4 cursor recovery', 'tests/cursor-recovery.test.ts'],
  ['E4 gem-dark outbox wiring', 'tests/summer-gem-dark-recovery.test.ts'],
  [
    'E4 heartbeat attestation→Cursor bridge',
    'tests/summer-bottleneck-heartbeat.test.ts',
  ],
  [
    'Governed dispatch: request outcome → router launches',
    'tests/summer-governed-dispatch.test.ts',
  ],
  [
    'JOV-6163 publisher↔Summer attestation interop (600s gate intact)',
    'tests/jov-6163-attestation-interop.test.ts',
  ],
  [
    'Acceptance: Gem-down → alternate → recovery → ownership → human decision',
    'tests/summer-bounded-operator-acceptance.test.ts',
  ],
]) {
  if (
    maybe(label, resolve(eve, rel), () =>
      run(label, 'pnpm', ['exec', 'vitest', 'run', rel], {
        cwd: eve,
        requirePassed: true,
      })
    )
  )
    ran++;
}

run(
  'E1 close-path readiness (Summer observation gate self-test)',
  'pnpm',
  ['exec', 'vitest', 'run', 'tests/e1-attestation-observation-gate.test.ts'],
  { cwd: eve, requirePassed: true }
);
ran++;

if (
  maybe(
    'E5 identity packs',
    resolve(web, 'tests/unit/ovie/identity.test.ts'),
    () =>
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
        { requirePassed: true }
      )
  )
)
  ran++;

if (
  maybe(
    'E5 linear coordination',
    resolve(web, 'tests/unit/ovie/linear-coordination.test.ts'),
    () =>
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
        { requirePassed: true }
      )
  )
)
  ran++;

console.log(`
== E1 attestation delivery ==
EXTERNAL GATE: PR #17725 is MERGED to main — deploy/install publisher on Gem, prove two ≤600s fresh observations,
then confirm Summer no longer holds on runner-source-attestation-unavailable.
Operator install packet: docs/ops/summer-bounded-operator-e1-install.md
Post-install proof (same Summer predicates):
  node scripts/summer-commissioning/verify-e1-attestation-observations.mjs \\
    --observation-a obs-a.json --observation-b obs-b.json
Local publisher tests: python3 scripts/symphony/tests/gem-service-attestation.test.py (on main).
Local close-path readiness (--self-test) is covered by the E1 observation gate suite above;
that does NOT close E1 without real Gem observations.
`);

console.log(
  `Local evals present in this checkout: ${ran} suite(s) GREEN; E1 still EXTERNAL`
);
