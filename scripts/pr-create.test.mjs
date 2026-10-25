import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildBody,
  formatErrors,
  isRepair,
  preflight,
} from './lib/pr-body-template.mjs';
import { main } from './pr-create.mjs';

const git = files => args =>
  args[0] === 'diff' || args.includes('--name-status')
    ? files.map(name => `M\t${name}`).join('\n')
    : '';

test('the template carries the changelog block and Blast radius, and Red-before-green only for repairs', () => {
  const feature = buildBody({
    title: 'feat: x',
    identifier: 'JOV-1',
    issueId: 'abc',
  });
  assert.match(feature, /customer-changelog\/v1 \{"releaseWorthy":false\}/);
  assert.match(feature, /## Blast radius/);
  assert.doesNotMatch(feature, /## Red-before-green/);
  assert.match(feature, /linear-issue-id:abc/);
  const fix = buildBody({ title: 'fix(web): y' });
  assert.match(fix, /## Red-before-green\nFailing command: TODO/);
  assert.equal(isRepair({ title: 'chore: z', labels: ['lane-fix-red'] }), true);
  assert.equal(isRepair({ title: 'feat: z' }), false);
});

test('an untouched fix template is refused with each missing piece named and what to add', () => {
  const body = buildBody({ title: 'fix: y' });
  const { errors } = preflight({
    title: 'fix: y',
    body,
    labels: [],
    git: git(['apps/web/lib/x.ts']),
    gate: () => ({ code: 0, output: '' }),
  });
  const rules = errors.map(error => error.rule);
  assert.ok(rules.includes('red-before-green'), rules.join());
  assert.ok(
    errors.every(error => error.add),
    'every finding carries the text to add'
  );
  assert.match(formatErrors(errors), /add: .*Red-before-green/s);
});

test('a missing changelog decision is refused', () => {
  const { errors } = preflight({
    title: 'feat: x',
    body: '## Summary\nx\n',
    git: git(['apps/web/lib/x.ts']),
    gate: () => ({ code: 0, output: '' }),
  });
  assert.ok(errors.some(error => error.rule === 'changelog'));
});

test('a changed UI component without a passing story gate is refused; with a passing gate it is not', () => {
  const body = buildBody({ title: 'feat: x' }).replace(
    /TODO/g,
    'covered by the unit tests'
  );
  const files = ['apps/web/components/Thing.tsx'];
  const refused = preflight({
    title: 'feat: x',
    body,
    git: git(files),
    gate: () => ({ code: 1, output: 'missing story' }),
  });
  assert.ok(
    refused.errors.some(
      error => error.rule === 'story' && /stories\.tsx/.test(error.add)
    )
  );
  const ok = preflight({
    title: 'feat: x',
    body,
    git: git(files),
    gate: () => ({ code: 0, output: '' }),
  });
  assert.ok(!ok.errors.some(error => error.rule === 'story'));
});

test('main refuses to run gh when the preflight fails, and runs it when clean', async () => {
  const logs = [];
  const calls = [];
  const run = args => (
    calls.push(args),
    { code: 0, stdout: 'https://example.test/pr/1', stderr: '' }
  );
  const refuse = await main({
    args: ['--title', 'fix: y', '--body', 'x'],
    log: line => logs.push(line),
    run,
    check: () => ({ errors: [{ rule: 'changelog', message: 'm', add: 'a' }] }),
  });
  assert.equal(refuse, 1);
  assert.equal(calls.length, 0);
  assert.match(logs.join('\n'), /not created; 1 rule\(s\) would fail/);
  const created = await main({
    args: [
      '--title',
      't',
      '--body',
      'x',
      '--draft',
      '--base-ref',
      'origin/main',
    ],
    log: () => {},
    run,
    check: () => ({ errors: [] }),
  });
  assert.equal(created, 0);
  assert.deepEqual(calls[0], [
    'pr',
    'create',
    '--title',
    't',
    '--body',
    'x',
    '--draft',
  ]);
});
