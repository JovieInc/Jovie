import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const workflow = readFileSync('.github/workflows/ci.yml', 'utf8');
const sourceValidationWorkflow = readFileSync(
  '.github/workflows/source-validation.yml',
  'utf8'
);
const triggerBlock = workflow.slice(0, workflow.indexOf('\npermissions:'));
const sourceValidationTriggerBlock = sourceValidationWorkflow.slice(
  0,
  sourceValidationWorkflow.indexOf('\npermissions:')
);

function jobBlock(jobId) {
  const start = workflow.indexOf(`\n  ${jobId}:\n`);
  assert.notEqual(start, -1, `missing workflow job ${jobId}`);
  const nextJob = workflow.slice(start + 1).search(/\n  [a-zA-Z0-9_-]+:\n/);
  const end = nextJob === -1 ? workflow.length : start + 1 + nextJob;
  return workflow.slice(start, end);
}

const ciFastTypecheckBlock = jobBlock('ci-fast-typecheck');
const ciFastRemainingBlock = jobBlock('ci-fast-remaining');
const ciFastAggregateBlock = jobBlock('ci-fast');

test('CI prevention verifier runs for every source PR and exact merge-group head', () => {
  // Bounded topology (JOV-5940): source-PR validation lives in
  // source-validation.yml; ci.yml owns merge_group/push/dispatch heads.
  assert.match(sourceValidationTriggerBlock, /^on:\n  pull_request:\n/m);
  assert.doesNotMatch(triggerBlock, /^  pull_request:/m);
  assert.match(
    triggerBlock,
    /^  merge_group:\n    types: \[checks_requested\]$/m
  );
  assert.doesNotMatch(triggerBlock, /^    paths(?:-ignore)?:/m);
  assert.doesNotMatch(sourceValidationTriggerBlock, /^    paths(?:-ignore)?:/m);
  assert.match(
    sourceValidationWorkflow,
    /node scripts\/ci-release-incident-contract\.mjs/
  );
  for (const ciFastChildBlock of [ciFastTypecheckBlock, ciFastRemainingBlock]) {
    assert.match(
      ciFastChildBlock,
      /name: Validate CI\/release incident prevention contract/
    );
    assert.match(ciFastChildBlock, /github\.event_name != 'merge_group'/);
  }
  assert.match(
    ciFastTypecheckBlock,
    /run: node scripts\/ci-release-incident-contract\.mjs/
  );
  assert.match(ciFastRemainingBlock, /run: pnpm ci:incident-contract:validate/);
  assert.match(
    ciFastRemainingBlock,
    /if \[\[ "\$\{\{ github\.event_name \}\}" != "pull_request" \]\]; then\n            echo "skip=false"/
  );
  assert.match(
    ciFastAggregateBlock,
    /needs:\s*\[\s*ci-path-changes,\s*ci-merge-group-admission,\s*ci-fast-typecheck,\s*ci-fast-remaining,\s*ci-profile-admission-browser,\s*ci-fast-structural-python,\s*ci-fast-structural-web,\s*\]/s
  );
  assert.match(
    ciFastAggregateBlock,
    /TYPECHECK_RESULT: \$\{\{ needs\.ci-fast-typecheck\.result \}\}/
  );
  assert.match(
    ciFastAggregateBlock,
    /REMAINING_RESULT: \$\{\{ needs\.ci-fast-remaining\.result \}\}/
  );
  assert.match(
    ciFastAggregateBlock,
    /PROFILE_BROWSER_RESULT: \$\{\{ needs\.ci-profile-admission-browser\.result \}\}/
  );
  assert.match(
    ciFastAggregateBlock,
    /\[\[ "\$TYPECHECK_RESULT" != "success" \|\| "\$REMAINING_RESULT" != "success" \|\| "\$PROFILE_BROWSER_RESULT" != "success" \|\| "\$STRUCTURAL_PYTHON_RESULT" != "success" \|\| "\$STRUCTURAL_WEB_RESULT" != "success" \]\]/
  );
  assert.match(ciFastAggregateBlock, /exit 1/);
  assert.doesNotMatch(
    ciFastAggregateBlock,
    /name: Validate CI\/release incident prevention contract|ci-release-incident-contract/
  );
});
