import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import test from 'node:test';

const { load } = createRequire(import.meta.url)('js-yaml');
const root = resolve(import.meta.dirname, '..');
const workflow = load(
  readFileSync(
    resolve(root, '.github/workflows/merge-queue-green-enroll.yml'),
    'utf8'
  )
);
const script = workflow.jobs['dequeue-held'].steps.find(
  step => step.with?.script
).with.script;

// 14 of the bot's 23 manual queue removals in the 24h to 2026-10-26 carried no recorded reason.
test('dequeue-held records why it dequeued on the PR, after the dequeue, without blocking it', () => {
  const mutation = script.indexOf('dequeuePullRequest');
  const comment = script.indexOf('github.rest.issues.createComment');
  assert.ok(
    mutation > -1 && comment > mutation,
    'the reason comment follows the dequeue'
  );
  assert.match(
    script,
    /<!-- queue-dequeue \$\{JSON\.stringify\(record\)\} -->/
  );
  assert.match(script, /code: 'hold'/);
  assert.match(script, /labeledBy: context\.payload\.sender/);
  // A failed comment is a warning, never an exception that hides a successful dequeue.
  assert.match(script, /could not record the dequeue reason/);
});
