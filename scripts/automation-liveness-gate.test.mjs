import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import test from 'node:test';

const { load } = createRequire(import.meta.url)('js-yaml');
const root = resolve(import.meta.dirname, '..');
const workflow = load(
  readFileSync(
    resolve(root, '.github/workflows/automation-liveness.yml'),
    'utf8'
  )
);

// #23349 added a gate that listed runs and jobs with github.token and an unprimed setup-node, which
// put this file over its workflow-token-budget (setup-node-manifest 1 > 0, token-api-call 2 > 1) and
// turned PR Fleet Rules red for every PR on 2026-10-26.
test('the liveness gate makes no GitHub API call and no setup-node', () => {
  const gate = workflow.jobs.gate;
  const text = JSON.stringify(gate);
  assert.doesNotMatch(text, /setup-node/);
  assert.doesNotMatch(text, /github\.token|GH_TOKEN|api-client|gh api|gh run/);
  assert.equal(gate.permissions, undefined);
  const uses = gate.steps.map(step => step.uses ?? '');
  assert.ok(uses.some(u => u.startsWith('actions/cache/restore@')));
});

test('the liveness job marks its bucket after the check, even when the check failed', () => {
  const steps = workflow.jobs.liveness.steps;
  const save = steps.find(step => step.uses?.startsWith('actions/cache/save@'));
  assert.ok(save);
  assert.equal(save.if, '${{ always() }}');
  assert.match(save.with.key, /needs\.gate\.outputs\.bucket/);
  assert.equal(steps.at(-1).uses?.startsWith('actions/cache/save@'), true);
  assert.equal(
    workflow.jobs.gate.outputs.bucket,
    '${{ steps.bucket.outputs.bucket }}'
  );
});
