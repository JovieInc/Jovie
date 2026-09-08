import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '../../..');
const runXcodebuildSource = readFileSync(
  path.join(scriptDir, 'run-xcodebuild.sh'),
  'utf8'
);
const iosWorkflowSource = readFileSync(
  path.join(repoRoot, '.github/workflows/ios-ci.yml'),
  'utf8'
);
const unitTestRunnerSource = readFileSync(
  path.join(scriptDir, 'run-unit-tests.sh'),
  'utf8'
);

test('xcodebuild wrapper prints phase timing and bounded timeout diagnostics', () => {
  assert.match(runXcodebuildSource, /run_phase_with_optional_timeout/);
  assert.match(runXcodebuildSource, /iOS phase started_at=/);
  assert.match(runXcodebuildSource, /iOS phase finished_at=/);
  assert.match(runXcodebuildSource, /JOVIE_IOS_XCODEBUILD_TIMEOUT_SECONDS/);
  assert.match(runXcodebuildSource, /iOS phase timed out after/);
  assert.match(runXcodebuildSource, /Invalid timeout for/);
  assert.match(runXcodebuildSource, /\$\{1:-\}" == "--"/);
  // set -e would otherwise abort before the xcresult dump (ci:2fa8414a).
  assert.match(
    runXcodebuildSource,
    /set \+e\nrun_phase_with_optional_timeout "xcodebuild \$ACTION"[\s\S]*?XCODEBUILD_STATUS=\$\?\nset -e/
  );
});

test('iOS CI bounds the fast gate and preserves full release regression headroom', () => {
  const fastStepTimeout = iosWorkflowSource.match(
    /- name: Run fast unit and coverage gate[\s\S]*?timeout-minutes: ([0-9]+)/
  );
  const fullStepTimeout = iosWorkflowSource.match(
    /- name: Run full simulator regression[\s\S]*?timeout-minutes: ([0-9]+)/
  );
  const fastInternalTimeout = iosWorkflowSource.match(
    /- name: Run fast unit and coverage gate[\s\S]*?JOVIE_IOS_XCODEBUILD_TIMEOUT_SECONDS: "([0-9]+)"/
  );
  const fullInternalTimeout = iosWorkflowSource.match(
    /- name: Run full simulator regression[\s\S]*?JOVIE_IOS_XCODEBUILD_TIMEOUT_SECONDS: "([0-9]+)"/
  );

  assert.equal(Number(fastStepTimeout?.[1]), 15);
  assert.equal(Number(fullStepTimeout?.[1]), 30);
  assert.equal(Number(fastInternalTimeout?.[1]), 840);
  assert.equal(Number(fullInternalTimeout?.[1]), 1680);
  assert.ok(
    Number(fastInternalTimeout?.[1]) < Number(fastStepTimeout?.[1]) * 60,
    'fast internal timeout must fire before the GitHub action step timeout'
  );
  assert.ok(
    Number(fullInternalTimeout?.[1]) < Number(fullStepTimeout?.[1]) * 60,
    'full internal timeout must fire before the GitHub action step timeout'
  );
  assert.match(
    iosWorkflowSource,
    /timeout-minutes: \$\{\{ inputs\.full-regression && 55 \|\| 18 \}\}/
  );
  assert.match(unitTestRunnerSource, /JOVIE_IOS_SCHEME="JovieUnitTests"/);
  assert.match(unitTestRunnerSource, /-only-testing:JovieTests/);
});
