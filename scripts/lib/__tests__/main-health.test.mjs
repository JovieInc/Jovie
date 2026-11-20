import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'vitest';
import {
  failureLine,
  receipt,
  runStructural,
  structuralCommands,
} from '../../main-health.mjs';

test('receipt is ok only when every check passed', () => {
  const sha = 'a'.repeat(40);
  const good = [{ check: 'a', ok: true, message: 'ok' }];
  const bad = [...good, { check: 'b', ok: false, message: 'source changed' }];
  assert.equal(receipt(good, { sha, runUrl: null }).ok, true);
  const failing = receipt(bad, {
    sha,
    runUrl: 'https://x',
    now: new Date('2026-10-29T00:00:00Z'),
  });
  assert.equal(failing.ok, false);
  assert.equal(failing.schema, 'jovie.main-health/v1');
  assert.equal(failing.checkedAt, '2026-10-29T00:00:00.000Z');
});

const root = new URL('../../..', import.meta.url).pathname;

test('structural mode derives the script contracts from the structural lane lists', async () => {
  const commands = await structuralCommands(root);
  const vitest = commands.find(c => c.check === 'script-contracts-vitest');
  // The 2026-11-10 time bomb sat in production-release-supersession.test.mjs,
  // outside the PR-time contract list: the release-lineage group is included.
  assert.ok(
    vitest.args.includes(
      'lib/__tests__/production-release-supersession.test.mjs'
    )
  );
  assert.ok(
    vitest.args.includes('lib/__tests__/design-surface-census.test.mjs')
  );
  assert.ok(!vitest.args.includes('lib/__tests__'));
  const nodeTests = commands
    .filter(c => c.check.startsWith('script-contracts-node-'))
    .flatMap(c => c.args.filter(arg => arg.endsWith('.test.mjs')));
  assert.ok(nodeTests.length > 100, `only ${nodeTests.length} node contracts`);
  assert.ok(nodeTests.includes('scripts/runner-pool-routing.test.mjs'));
});

test('a failed contract makes main health red and names the failing test (2026-11-10 shape)', () => {
  const log = [
    ' RUN  v5.0.5',
    '\x1b[31m FAIL \x1b[0m |workspace-scripts| lib/__tests__/production-release-supersession.test.mjs > review deadline has not passed',
    'AssertionError: expected 2026-11-10T06:00:00.000Z to be after now',
    ' Test Files  1 failed | 321 passed (322)',
  ].join('\n');
  const run = (command, args) =>
    command === 'pnpm'
      ? { status: 1, stdout: log, stderr: '' }
      : { status: 0, stdout: 'ok', stderr: '' };
  const results = runStructural(
    root,
    [
      { check: 'script-contracts-node-1', command: 'node', args: ['--test'] },
      { check: 'script-contracts-vitest', command: 'pnpm', args: ['exec'] },
    ],
    // Not printed: a FAIL line in a green job log would read as a failure to log parsers.
    { run, print: () => {} }
  );
  assert.deepEqual(
    results.map(r => r.ok),
    [true, false]
  );
  assert.match(results[1].message, /^FAIL .*production-release-supersession/);
  assert.equal(
    receipt(results, { sha: 'a'.repeat(40), runUrl: null }).ok,
    false
  );
  assert.equal(
    failureLine('\n✖ census drift (3ms)\n# fail 1\n'),
    '✖ census drift (3ms)'
  );
  assert.equal(failureLine(''), 'no output');
});

test('the workflow runs the contracts only on dispatch and never from cron', () => {
  const wf = readFileSync(
    new URL('../../../.github/workflows/main-health.yml', import.meta.url),
    'utf8'
  );
  assert.doesNotMatch(wf, /^\s*schedule:/m);
  assert.match(
    wf,
    /structural:[\s\S]*if: \$\{\{ github\.event_name == 'workflow_dispatch' \}\}[\s\S]*main-health\.mjs --structural/
  );
});
