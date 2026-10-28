import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';

const workflow = readFileSync(
  resolve(
    import.meta.dirname,
    '../../../.github/workflows/source-validation.yml'
  ),
  'utf8'
);
const program =
  /jq -r [^\n]*? '(\[\.workflow_runs\[\][^\n]*)' <<<"\$runs"/.exec(
    workflow
  )?.[1];
const have = spawnSync('jq', ['--version']).status === 0;

// PR Ready picks the evidence run for the head. 2026-10-25: #22978's passing
// run and a concurrency-cancelled twin were created in the same second and the
// cancelled one won the tie, so PR Ready failed with "not a verdict" for good.
function pick(runs) {
  const done = spawnSync(
    'jq',
    [
      '-r',
      '--argjson',
      'floor',
      '100',
      '--arg',
      'title',
      'fleet-rules #7 base=main',
      '--arg',
      'ref',
      'b',
      '--argjson',
      'repo',
      '1',
      program,
    ],
    { input: JSON.stringify({ workflow_runs: runs }), encoding: 'utf8' }
  );
  assert.equal(done.status, 0, done.stderr);
  return done.stdout.trim();
}
const run = (id, conclusion, created = '1970-01-01T00:05:00Z') => ({
  id,
  path: '.github/workflows/fleet-rules-evidence.yml',
  display_title: 'fleet-rules #7 base=main',
  head_branch: 'b',
  head_repository: { id: 1 },
  created_at: created,
  status: 'completed',
  conclusion,
  html_url: `u${id}`,
});

test('the evidence picker exists in the workflow', () => {
  assert.ok(program, 'jq program not found in source-validation.yml');
});

test('a cancelled twin created in the same second never wins the tie', {
  skip: !have,
}, () => {
  assert.equal(
    pick([run(1, 'success'), run(2, 'cancelled')]),
    'completed\tsuccess\tu1'
  );
  assert.equal(
    pick([run(2, 'cancelled'), run(1, 'success')]),
    'completed\tsuccess\tu1'
  );
});

test('the newest non-cancelled run decides, and only cancelled runs mean missing', {
  skip: !have,
}, () => {
  assert.equal(
    pick([
      run(1, 'failure', '1970-01-01T00:05:00Z'),
      run(2, 'success', '1970-01-01T00:06:00Z'),
    ]),
    'completed\tsuccess\tu2'
  );
  assert.equal(pick([run(1, 'cancelled')]), 'missing');
});
