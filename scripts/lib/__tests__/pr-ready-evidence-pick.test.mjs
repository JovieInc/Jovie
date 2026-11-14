import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
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
function pick(runs, stale = []) {
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
      '--arg',
      'sha',
      'head',
      '--argjson',
      'stale',
      JSON.stringify(stale),
      program,
    ],
    { input: JSON.stringify({ workflow_runs: runs }), encoding: 'utf8' }
  );
  assert.equal(done.status, 0, done.stderr);
  return done.stdout.trim();
}
const run = (
  id,
  conclusion,
  created = '1970-01-01T00:05:00Z',
  headSha = 'head'
) => ({
  id,
  path: '.github/workflows/fleet-rules-evidence.yml',
  display_title: 'fleet-rules #7 base=main',
  head_branch: 'b',
  head_sha: headSha,
  head_repository: { id: 1 },
  created_at: created,
  status: 'completed',
  conclusion,
  html_url: `u${id}`,
});

test('the evidence picker exists in the workflow', () => {
  assert.ok(program, 'jq program not found in source-validation.yml');
});

// #23179 (2026-11-10): a superseded head failed in the same second as the
// current head's success and the higher id won, so PR Ready went red on a
// passing verdict. Edited events still count via the base sha.
test('a superseded head failure never outranks the current head or the base sha', {
  skip: !have,
}, () => {
  const current = run(1, 'success');
  const stale = run(2, 'failure', '1970-01-01T00:05:00Z', 'previous');
  assert.equal(pick([current, stale], ['previous']), 'completed\tsuccess\tu1');
  assert.equal(pick([stale, current], ['previous']), 'completed\tsuccess\tu1');
  assert.equal(pick([stale], ['previous']), 'missing');
  assert.equal(
    pick(
      [stale, run(3, 'success', '1970-01-01T00:06:00Z', 'base')],
      ['previous']
    ),
    'completed\tsuccess\tu3'
  );
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

// #24886 (2026-11-11): jovie-bot merged main and dropped a label in the same second,
// so two evidence runs shared a created_at. The stale-head run failed ("re-run with
// current PR metadata") and had the higher id, so PR Ready stayed red on re-run.
test('a same-second run for the current head beats a stale-head run with a higher id', {
  skip: !have,
}, () => {
  const stale = { ...run(9, 'failure'), head_sha: 'previous' };
  assert.equal(pick([run(1, 'success'), stale]), 'completed\tsuccess\tu1');
  assert.equal(pick([stale, run(1, 'success')]), 'completed\tsuccess\tu1');
  // A genuinely newer run still wins whatever head_sha it carries.
  const later = {
    ...run(9, 'failure', '1970-01-01T00:06:00Z'),
    head_sha: 'base',
  };
  assert.equal(pick([run(1, 'success'), later]), 'completed\tfailure\tu9');
});

// #24903 (2026-11-11): jovie-bot's main merge fired two runs a second apart. The
// newer one carried the old head, failed closed, and PR Ready picked it.
test('a newer run that carries an earlier PR head never decides', {
  skip: !have,
}, () => {
  const current = run(1, 'success', '1970-01-01T00:05:00Z');
  const stale = {
    ...run(2, 'failure', '1970-01-01T00:05:01Z'),
    head_sha: 'old',
  };
  assert.equal(pick([current, stale], ['old']), 'completed\tsuccess\tu1');
  // Without the PR's commit list (lookup failed) nothing is dropped: still red.
  assert.equal(pick([current, stale]), 'completed\tfailure\tu2');
  // A newer edited-event run carries the base sha, not a PR commit, and still wins.
  const edited = {
    ...run(3, 'failure', '1970-01-01T00:05:02Z'),
    head_sha: 'base',
  };
  assert.equal(pick([current, edited], ['old']), 'completed\tfailure\tu3');
  // Only stale runs left means missing, never a pass.
  assert.equal(pick([stale], ['old']), 'missing');
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

test('a deferred evidence lookup is exit 75 and is not read as an empty run list', () => {
  const run = workflow
    .match(
      / {6}- name: Require fleet-rule evidence[\s\S]*?\n {8}run: \|\n([\s\S]*?)(?=\n {6}\S|\n {4}\S|$)/
    )?.[1]
    .replace(/^ {10}/gm, '');
  assert.ok(run, 'fleet evidence run block');
  assert.match(run, /"\$rc" -eq 75/);
  assert.doesNotMatch(run, /\|\| runs='\{"workflow_runs":\[\]\}'/);
  const dir = mkdtempSync(join(tmpdir(), 'fleet-deferred-'));
  try {
    mkdirSync(join(dir, '.github/workflows'), { recursive: true });
    writeFileSync(
      join(dir, '.github/workflows/fleet-rules-evidence.yml'),
      'trusted'
    );
    mkdirSync(join(dir, 'packages/api-client'), { recursive: true });
    writeFileSync(
      join(dir, 'packages/api-client/cli.ts'),
      'process.stderr.write("github-quota-deferred until 2026-11-10T12:59:15.000Z\\n"); process.exit(75);\n'
    );
    const deferred = spawnSync('bash', ['-e', '-o', 'pipefail', '-c', run], {
      cwd: dir,
      encoding: 'utf8',
      env: {
        PATH: process.env.PATH,
        HEAD_SHA: 'a'.repeat(40),
        PR_NUMBER: '24777',
        HEAD_REF: 'glm/jov-12120-doctor-blocker-dedup',
        HEAD_REPO_ID: '1',
        REPOSITORY: 'JovieInc/Jovie',
        EVENT_UPDATED_AT: '2026-11-10T12:46:53Z',
      },
    });
    assert.equal(deferred.status, 75, deferred.stdout + deferred.stderr);
    assert.match(deferred.stdout, /github-quota-deferred/);
    assert.doesNotMatch(deferred.stdout, /Fleet rules passed/);
    assert.doesNotMatch(deferred.stdout, /evidence is missing/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
