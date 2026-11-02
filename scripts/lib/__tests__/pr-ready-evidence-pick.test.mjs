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

// #24184 (2026-11-01): a body edit moved the floor past the head's own run, and
// the edited-event runs carry the BASE sha as head_sha, so the old head_sha query
// never returned them and PR Ready failed 7 times with "evidence is missing".
test('PR Ready looks evidence up by branch, never by head_sha', () => {
  assert.match(
    workflow,
    /fleet-rules-evidence\.yml\/runs\?branch=\$ref_q&event=pull_request_target/
  );
  assert.doesNotMatch(workflow, /fleet-rules-evidence\.yml\/runs\?head_sha=/);
});

test('an edited-event run (base-sha head_sha) created after the floor is picked', {
  skip: !have,
}, () => {
  const edited = {
    ...run(3, 'success', '1970-01-01T00:06:00Z'),
    head_sha: 'base',
  };
  const old = run(1, 'success', '1970-01-01T00:01:00Z'); // before the floor (100s)
  assert.equal(pick([old, edited]), 'completed\tsuccess\tu3');
  assert.equal(pick([old]), 'missing');
});

test('a completed evidence run re-triggers PR Ready for its PR', () => {
  const evidence = readFileSync(
    resolve(
      import.meta.dirname,
      '../../../.github/workflows/fleet-rules-evidence.yml'
    ),
    'utf8'
  );
  assert.doesNotMatch(evidence, /Fleet Rules Evidence\]/);
  const hop = readFileSync(
    resolve(
      import.meta.dirname,
      '../../../.github/workflows/fleet-rules-ready-rerun.yml'
    ),
    'utf8'
  );
  assert.match(hop, /workflows: \[Fleet Rules Evidence\]/);
  assert.match(hop, /rerun-ready:/);
  assert.match(hop, /workflow_run\.event == 'pull_request_target'/);
  assert.match(
    hop,
    /RUN_TITLE: \$\{\{ github\.event\.workflow_run\.display_title \}\}/
  );
  const script = resolve(
    import.meta.dirname,
    '../../../.github/scripts/fleet-rules-rerun-ready.sh'
  );
  const bad = spawnSync('bash', [script], {
    env: { ...process.env, RUN_TITLE: 'fleet-rules rerun 9' },
    encoding: 'utf8',
  });
  assert.equal(bad.status, 0);
  assert.match(bad.stdout, /Not a PR evidence run title/);
  const noTok = spawnSync('bash', [script], {
    env: {
      PATH: process.env.PATH,
      RUN_TITLE: 'fleet-rules #24184 base=main',
      REPOSITORY: 'x/y',
    },
    encoding: 'utf8',
  });
  assert.equal(noTok.status, 0);
  assert.match(noTok.stdout, /#24184/);
});
