import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const workflow = readFileSync('.github/workflows/ci.yml', 'utf8');
const triggerBlock = workflow.slice(0, workflow.indexOf('\npermissions:'));
const ciFastStart = workflow.indexOf('\n  ci-fast:\n');
const ciFastBlock = workflow.slice(
  ciFastStart,
  workflow.indexOf('\n  ci-unit-tests:', ciFastStart)
);

test('CI prevention verifier runs for every source PR and exact merge-group head', () => {
  assert.match(triggerBlock, /^on:\n  pull_request:\n/m);
  assert.match(
    triggerBlock,
    /^  merge_group:\n    types: \[checks_requested\]$/m
  );
  assert.doesNotMatch(triggerBlock, /^    paths(?:-ignore)?:/m);
  assert.match(
    ciFastBlock,
    /name: Validate CI\/release incident prevention contract/
  );
  assert.match(ciFastBlock, /run: pnpm ci:incident-contract:validate/);
  assert.match(ciFastBlock, /github\.event_name != 'merge_group'/);
  assert.match(
    ciFastBlock,
    /if \[\[ "\$\{\{ github\.event_name \}\}" != "pull_request" \]\]; then\n            echo "skip=false"/
  );
});
