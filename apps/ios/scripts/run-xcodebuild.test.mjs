import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
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

test('iOS CI bounds both gates and skips redundant hosted simulator resets', () => {
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
  const fullResetMode = iosWorkflowSource.match(
    /- name: Run full simulator regression[\s\S]*?JOVIE_IOS_RESET_SIMULATOR: "([01])"/
  );

  const fullFinalizationTimeout = iosWorkflowSource.match(
    /- name: Run full simulator regression[\s\S]*?JOVIE_IOS_XCODEBUILD_FINALIZATION_TIMEOUT_SECONDS: "([0-9]+)"/
  );

  assert.equal(Number(fastStepTimeout?.[1]), 15);
  assert.equal(Number(fullStepTimeout?.[1]), 39);
  assert.equal(Number(fastInternalTimeout?.[1]), 840);
  assert.equal(Number(fullInternalTimeout?.[1]), 2040);
  assert.equal(Number(fullFinalizationTimeout?.[1]), 180);
  assert.equal(fullResetMode?.[1], '0');
  assert.ok(
    Number(fastInternalTimeout?.[1]) < Number(fastStepTimeout?.[1]) * 60,
    'fast internal timeout must fire before the GitHub action step timeout'
  );
  const fullWrapperBudget =
    Number(fullInternalTimeout?.[1]) + Number(fullFinalizationTimeout?.[1]);
  assert.ok(
    fullWrapperBudget + 120 <= Number(fullStepTimeout?.[1]) * 60,
    'full execution plus finalization must finish 120s before the step killer'
  );
  assert.match(
    runXcodebuildSource,
    /JOVIE_IOS_XCODEBUILD_FINALIZATION_TIMEOUT_SECONDS/
  );
  assert.match(
    runXcodebuildSource,
    /iOS xcodebuild finalization timed out after/
  );
  assert.match(
    iosWorkflowSource,
    /timeout-minutes: \$\{\{ inputs\.full-regression && 55 \|\| 18 \}\}/
  );
  assert.match(unitTestRunnerSource, /JOVIE_IOS_SCHEME="JovieUnitTests"/);
  assert.match(unitTestRunnerSource, /-only-testing:JovieTests/);
});

const wrapperPath = path.join(scriptDir, 'run-xcodebuild.sh');

function runWrappedPhase(timeoutSeconds, finalizationSeconds, pythonBody) {
  const env = {
    ...process.env,
    WRAPPER: wrapperPath,
    PHASE_TIMEOUT: String(timeoutSeconds),
    PYTHON_BODY: pythonBody,
  };
  if (finalizationSeconds == null) {
    delete env.JOVIE_IOS_XCODEBUILD_FINALIZATION_TIMEOUT_SECONDS;
  } else {
    env.JOVIE_IOS_XCODEBUILD_FINALIZATION_TIMEOUT_SECONDS = String(
      finalizationSeconds
    );
  }
  return spawnSync(
    'bash',
    [
      '-c',
      [
        'export JOVIE_IOS_XCODEBUILD_SOURCE_ONLY=1',
        'source "$WRAPPER"',
        'set +e',
        'run_phase_with_optional_timeout "xcodebuild test" "$PHASE_TIMEOUT" python3 -c "$PYTHON_BODY"',
        'status=$?',
        'echo "CAPTURED:$status"',
        'exit $status',
      ].join('\n'),
    ],
    { env, encoding: 'utf8', timeout: 20000 }
  );
}

test('a reported test success is not killed by the execution budget during finalization', () => {
  const result = runWrappedPhase(
    2,
    10,
    [
      'import time',
      'print("\\033[32m** TEST SUCCEEDED **\\033[0m", flush=True)',
      'time.sleep(3)',
    ].join('\n')
  );
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /\*\* TEST SUCCEEDED \*\*/);
  assert.match(result.stderr, /finalization budget 10s/);
  assert.doesNotMatch(result.stderr, /timed out after/);
});

test('a hang with no test result still fails at the execution budget', () => {
  const result = runWrappedPhase(
    2,
    10,
    ['import time', 'print("still running", flush=True)', 'time.sleep(30)'].join(
      '\n'
    )
  );
  assert.equal(result.status, 124, result.stderr);
  assert.match(result.stdout, /CAPTURED:124/);
  assert.match(result.stderr, /iOS phase timed out after 2s: xcodebuild test/);
  assert.match(result.stderr, /::error::iOS phase timed out after 2s/);
  assert.doesNotMatch(result.stderr, /finalization timed out/);
});

test('a hang after a reported result fails as finalization, not as the test budget', () => {
  const result = runWrappedPhase(
    30,
    2,
    [
      'import time',
      'print("** TEST SUCCEEDED **", flush=True)',
      'time.sleep(30)',
    ].join('\n')
  );
  assert.equal(result.status, 124, result.stderr);
  assert.match(result.stdout, /CAPTURED:124/);
  assert.match(
    result.stderr,
    /iOS xcodebuild finalization timed out after 2s after a reported test result: xcodebuild test/
  );
  assert.doesNotMatch(result.stderr, /timed out after 30s/);
});

test('a quoted result banner does not start the finalization budget', () => {
  const result = runWrappedPhase(
    2,
    10,
    [
      'import time',
      'print("log ** TEST SUCCEEDED ** still going", flush=True)',
      'time.sleep(30)',
    ].join('\n')
  );
  assert.equal(result.status, 124, result.stderr);
  assert.match(result.stderr, /iOS phase timed out after 2s/);
  assert.doesNotMatch(result.stderr, /finalization budget/);
});

test('a finished failing test keeps xcodebuild status through finalization', () => {
  const result = runWrappedPhase(
    10,
    10,
    [
      'import sys',
      'print("** TEST EXECUTE FAILED **", flush=True)',
      'sys.exit(70)',
    ].join('\n')
  );
  assert.equal(result.status, 70, result.stderr);
  assert.match(result.stdout, /\*\* TEST EXECUTE FAILED \*\*/);
  assert.doesNotMatch(result.stderr, /timed out/);
});

test('an invalid finalization budget is rejected before the command starts', () => {
  const result = runWrappedPhase(5, 'nope', 'print("should-not-run", flush=True)');
  assert.equal(result.status, 2, result.stderr);
  assert.match(result.stderr, /Invalid finalization timeout/);
  assert.doesNotMatch(result.stdout, /should-not-run/);
});

test('callers without a finalization budget keep a single execution timeout', () => {
  const result = runWrappedPhase(
    2,
    null,
    ['import time', 'print("** TEST SUCCEEDED **", flush=True)', 'time.sleep(30)'].join(
      '\n'
    )
  );
  assert.equal(result.status, 124, result.stderr);
  assert.match(result.stderr, /iOS phase timed out after 2s: xcodebuild test/);
  assert.doesNotMatch(result.stderr, /finalization budget/);
});
