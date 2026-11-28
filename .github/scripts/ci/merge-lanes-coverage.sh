#!/usr/bin/env bash
node --input-type=module <<'NODE'
import { spawnSync } from 'node:child_process';
import { LANES_COVERAGE_FLOORS, LANES_COVERAGE_GROUP_SHARDS } from './scripts/lib/ci-structural-shards.mjs';
const root = process.env.RUNNER_TEMP;
const env = { ...process.env, COVERAGE_FILE: `${root}/jovie-lanes.coverage` };
const run = args => {
  const result = spawnSync('python3', ['-m', 'coverage', ...args], { env, stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
};
run(['combine', ...Object.keys(LANES_COVERAGE_GROUP_SHARDS).map(group => `${root}/lanes-coverage/${group}/jovie-lanes-${group}.coverage`)]);
for (const { include, floor } of LANES_COVERAGE_FLOORS) {
  run(['report', `--include=${include}`, `--fail-under=${floor}`]);
}
NODE
