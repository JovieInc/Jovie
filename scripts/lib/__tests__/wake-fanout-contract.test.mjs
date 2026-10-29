import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// Measured 2026-10-25 over 85 PR heads from the last 3h: Source Validation was
// the last of {Source Validation, Fork PR Gate, PR Size Guard} to complete on
// 84 of them. Every extra workflow_run subscription is another wake per head
// for the listener workflows, so subscribe only to what can be the last signal.
const read = name =>
  readFileSync(
    new URL(`../../../.github/workflows/${name}`, import.meta.url),
    'utf8'
  );

const subscribed = text => {
  const block = text.match(/\n {2}workflow_run:\n {4}workflows: \[(.*?)\]/);
  assert.ok(block, 'workflow_run subscription list exists');
  return block[1].split(',').map(x => x.trim().replace(/^'|'$/g, ''));
};

test('Auto-Ready Agent Drafts wakes only on Source Validation completions', () => {
  assert.deepEqual(subscribed(read('auto-ready-agent-drafts.yml')), [
    'Source Validation',
  ]);
});

test('Merge Queue Green Enroll does not wake on Fork PR Gate completions', () => {
  const list = subscribed(read('merge-queue-green-enroll.yml'));
  assert.ok(!list.includes('Fork PR Gate'));
  // PR Size Guard also publishes the merge-group contexts the failure hold reads.
  for (const name of ['Source Validation', 'CI', 'PR Size Guard'])
    assert.ok(list.includes(name), `${name} stays subscribed`);
});

test('Merge Queue Green Enroll does not wake on pull_request_target synchronize', () => {
  const text = read('merge-queue-green-enroll.yml');
  const types = text.match(
    /\n {2}pull_request_target:\n(?: {4}#.*\n)* {4}types: \[(.*?)\]/
  );
  assert.ok(types, 'pull_request_target types exist');
  assert.ok(!types[1].includes('synchronize'));
  for (const kept of [
    'ready_for_review',
    'unlabeled',
    'reopened',
    'converted_to_draft',
  ])
    assert.ok(types[1].includes(kept), `${kept} stays`);
});
