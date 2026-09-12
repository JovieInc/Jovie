#!/usr/bin/env node
/**
 * Strict eval gate for Summer bounded-operator goal.
 * Exit 0 only when local E2–E5 suites pass. E1 remains externally gated on
 * Gem install of PR #17725 attestation publisher.
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
  if (options.requirePassed && !/\b(Test Files|PASS).*passed\b/i.test(combined) && !/\bTests\s+\d+\s+passed\b/i.test(combined)) {
    console.error(`FAIL: ${label} (no passing vitest summary)`);
    process.exit(1);
  }
  if (options.forbidNoMatch && /No projects matched the filters/i.test(combined)) {
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
EXTERNAL GATE: land/install PR #17725 on Gem, prove two ≤600s fresh observations,
then confirm Summer no longer holds on runner-source-attestation-unavailable.
Operator install packet: docs/ops/summer-bounded-operator-e1-install.md
Local publisher tests live on branch codex/jov-6163-runtime-attestation.
`);

console.log('Local strict evals E2–E5: GREEN');
