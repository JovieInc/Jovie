import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import test from 'node:test';

const { load } = createRequire(import.meta.url)('js-yaml');
const root = resolve(import.meta.dirname, '../../..');
const workflow = load(
  readFileSync(resolve(root, '.github/workflows/lane-fix-relay.yml'), 'utf8')
);
const condition = String(workflow.jobs.relay.if);

// Lane Fix Relay ran about 125 times an hour, ~336 successful wakes in 3 hours, each paying a
// 20 s debounce, a checkout, an App mint and github.token calls. Green wakes now come only from
// Source Validation, the slowest required producer; every failure signal still wakes.
test('a green wake needs Source Validation; failures wake from every listed workflow', () => {
  assert.match(
    condition,
    /conclusion == 'success' && github\.event\.workflow_run\.name == 'Source Validation'/
  );
  // No bare "success" in the generic conclusion list any more.
  assert.match(
    condition,
    /fromJSON\('\["failure","timed_out","startup_failure"\]'\)/
  );
  assert.doesNotMatch(
    condition,
    /\["failure","timed_out","startup_failure","success"\]/
  );
  // Failures keep waking from every workflow the relay subscribes to.
  assert.ok(workflow.on.workflow_run.workflows.includes('Source Validation'));
  assert.ok(workflow.on.workflow_run.workflows.includes('PR Fleet Rules'));
  assert.ok(workflow.on.workflow_run.workflows.length >= 9);
});

test('main-branch failure wakes and the non-workflow_run signals are unchanged', () => {
  assert.match(condition, /github\.event_name == 'deployment_status'/);
  assert.match(condition, /github\.event\.workflow_run\.head_branch == 'main'/);
  assert.match(condition, /"cancelled"/);
  assert.match(condition, /"push"/);
});
