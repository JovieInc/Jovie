import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const workflow = readFileSync(
  new URL('../../../.github/workflows/pr-fleet-rules.yml', import.meta.url),
  'utf8'
);

test('PR Fleet Rules runs its policy self-test only on events that can change the scripts', () => {
  const step = workflow.split('- name: Test fleet policy with coverage')[1];
  assert.ok(step, 'self-test step exists');
  const head = step.split('- name:')[0];
  assert.match(head, /\n\s+if: .*github\.event\.action/);
  assert.match(head, /opened/);
  assert.match(head, /synchronize/);
  assert.doesNotMatch(head.split('run:')[0], /labeled|edited/);
});

test('PR Fleet Rules still enforces the verdict on label and edit events', () => {
  const step = workflow.split(
    '- name: Enforce receipts, red-before-green and locked areas'
  )[1];
  assert.ok(step, 'verdict step exists');
  assert.doesNotMatch(step.split('run:')[0], /\n\s+if:/);
});
