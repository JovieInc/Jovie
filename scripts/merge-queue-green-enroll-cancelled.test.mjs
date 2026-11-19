import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';

const { load } = createRequire(import.meta.url)('js-yaml');
const workflow = load(
  readFileSync('.github/workflows/merge-queue-green-enroll.yml', 'utf8')
);

test('cancelled merge-group holds inspect required failures before minting a token', () => {
  const hold = workflow.jobs['hold-failed-revision'];
  const evidence = hold.steps.find(step => step.id === 'failure-evidence');
  const token = hold.steps.find(step => step.id === 'app-token');
  const persist = hold.steps.find(step => step.id === 'failure-hold');
  assert.match(hold.if, /"cancelled"/);
  assert.equal(evidence.env.GH_TOKEN, '${{ secrets.GITHUB_TOKEN }}');
  assert.equal(
    evidence.run,
    'node scripts/merge-group-failure-evidence.mjs --event-path "$GITHUB_EVENT_PATH"'
  );
  assert.equal(
    token.if,
    "steps.failure-evidence.outputs.should_hold == 'true'"
  );
  assert.equal(persist.if, token.if);
  assert.ok(hold.steps.indexOf(evidence) < hold.steps.indexOf(token));
  assert.equal(hold.permissions.actions, 'read');
});

test('cancelled workflow completions enroll only after a durable failure receipt', () => {
  const evaluate = new Function(
    'github',
    'needs',
    'vars',
    'always',
    `return (${workflow.jobs.enroll.if.replaceAll('needs.hold-failed-revision', "needs['hold-failed-revision']")});`
  );
  const admit = (conclusion, receipt = '', result = 'success') =>
    evaluate(
      {
        event_name: 'workflow_run',
        event: { workflow_run: { conclusion, event: 'merge_group' } },
      },
      {
        'hold-failed-revision': {
          result,
          outputs: { failure_receipt: receipt },
        },
      },
      {},
      () => true
    );
  assert.equal(admit('cancelled'), false);
  assert.equal(admit('cancelled', '{"statusWritten":true}'), true);
  assert.equal(admit('cancelled', '{"statusWritten":true}', 'failure'), false);
  assert.equal(admit('cancelled', '', 'skipped'), false);
  for (const conclusion of [
    'failure',
    'timed_out',
    'action_required',
    'startup_failure',
    'stale',
  ]) {
    assert.equal(admit(conclusion), true, conclusion);
  }
});
