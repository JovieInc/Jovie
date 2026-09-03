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

test('iOS CI exposes focused reproduction while preserving measured build-test headroom', () => {
  const buildStepTimeout = iosWorkflowSource.match(
    /- name: Build and test[\s\S]*?timeout-minutes: ([0-9]+)/
  );
  const jobTimeout = iosWorkflowSource.match(
    /name: Build And Test[\s\S]*?timeout-minutes: ([0-9]+)/
  );
  const internalTimeout = iosWorkflowSource.match(
    /xcodebuild_timeout_seconds:[\s\S]*?default: '([0-9]+)'/
  );

  assert.equal(Number(buildStepTimeout?.[1]), 30);
  assert.equal(Number(jobTimeout?.[1]), 50);
  assert.equal(Number(internalTimeout?.[1]), 1680);
  assert.ok(
    Number(internalTimeout?.[1]) < Number(buildStepTimeout?.[1]) * 60,
    'internal xcodebuild timeout must fire before the GitHub action step timeout'
  );
  assert.match(iosWorkflowSource, /only_testing:/);
  assert.match(iosWorkflowSource, /JOVIE_IOS_ONLY_TESTING/);
  assert.match(iosWorkflowSource, /-only-testing:\$JOVIE_IOS_ONLY_TESTING/);
});
