import assert from 'node:assert/strict';
import test from 'node:test';
import {
  bodyFindings,
  buildChecks,
  changedWorkflowNames,
  formatChecklist,
  isWorkflowRelated,
} from './ci-workflow-preflight.mjs';

test('only workflow-related paths trigger the preflight', () => {
  assert.equal(isWorkflowRelated(['apps/web/app/page.tsx']), false);
  assert.equal(isWorkflowRelated(['.github/workflows/new.yml']), true);
  assert.equal(isWorkflowRelated(['canon/ownership.json']), true);
  assert.equal(isWorkflowRelated(['docs/metrics/stage-manifest.json']), true);
});

test('a new workflow runs every contract that failed #23200 one at a time', () => {
  const { checks, touched } = buildChecks(['.github/workflows/new-thing.yml']);
  const ids = checks.map(check => check.id);
  for (const id of [
    'topology',
    'ownership',
    'stage-manifest',
    'ci-schedule-inventory',
    'automation-registry',
    'token-scope',
    'token-budget',
  ])
    assert.ok(ids.includes(id), `${id} is in the checklist`);
  assert.deepEqual(touched, ['new-thing']);
  for (const check of checks)
    assert.ok(check.fix.length > 20, `${check.id} has a fix`);
});

test('a new script test adds the wiring check', () => {
  const { checks } = buildChecks([
    '.github/workflows/a.yml',
    'scripts/x.test.mjs',
  ]);
  assert.ok(checks.some(check => check.id === 'wired-tests'));
  const none = buildChecks(['.github/workflows/a.yml']).checks;
  assert.ok(!none.some(check => check.id === 'wired-tests'));
});

test('workflow names come from top-level workflow files only', () => {
  assert.deepEqual(
    changedWorkflowNames([
      '.github/workflows/a.yml',
      '.github/actions/x/action.yml',
    ]),
    ['a']
  );
});

test('the checklist lists each red item with its fix and a final count', () => {
  const text = formatChecklist(
    [
      { ok: true, label: 'A', fix: 'f', excerpt: [] },
      { ok: false, label: 'B', fix: 'do the thing', excerpt: ['boom'] },
    ],
    { changedCount: 2, touched: ['a'] }
  );
  assert.match(text, /\[x\] A/);
  assert.match(text, /\[ \] B\n\s+fix: do the thing\n\s+> boom/);
  assert.match(text, /1 item\(s\) to fix/);
});

test('a bug-fix PR body without Red-before-green is flagged', () => {
  const found = bodyFindings({
    title: 'fix(ci): thing',
    body: '## Summary\nx',
    files: ['.github/workflows/a.yml'],
  });
  assert.ok(found.errors.some(e => e.startsWith('red-before-green')));
});
