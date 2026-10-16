import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import {
  main,
  neverStarted,
  planUnacquiredRerun,
  RERUN_ATTEMPT_CAP,
} from '../../pr-unacquired-runner-rerun.mjs';

const { load } = createRequire(import.meta.url)('js-yaml');
const repo = 'JovieInc/Jovie';
const sha = 'a'.repeat(40);
const UNACQUIRED =
  'The job was not acquired by Runner of type hosted even after multiple attempts';

// Shapes copied from run 37361686408 (#20767, 2026-10-05): PR Ready was
// cancelled with runner_id 0, no steps and the acquisition annotation while
// every real gate in the run succeeded.
function run(overrides = {}) {
  return {
    id: 37361686408,
    event: 'pull_request',
    conclusion: 'failure',
    head_sha: sha,
    run_attempt: 1,
    ...overrides,
  };
}
const greenJob = id => ({
  id,
  conclusion: 'success',
  runner_id: 1002157759,
  runner_name: 'GitHub Actions 1002157759',
  steps: [{}, {}],
});
const unacquiredJob = id => ({
  id,
  conclusion: 'cancelled',
  runner_id: 0,
  runner_name: '',
  steps: [],
});

function fakeApi({ jobs, annotations = {}, pulls }) {
  const calls = [];
  const api = path => {
    calls.push(path);
    if (path.includes('/attempts/')) return { jobs };
    const note = /check-runs\/(\d+)\/annotations/.exec(path);
    if (note) return annotations[note[1]] ?? [];
    if (path.includes('/pulls')) return pulls;
    throw new Error(`unexpected path ${path}`);
  };
  return { api, calls };
}

function runMain(event, fixture) {
  const dir = mkdtempSync(join(tmpdir(), 'unacquired-rerun-'));
  try {
    const eventPath = join(dir, 'event.json');
    const output = join(dir, 'output');
    writeFileSync(eventPath, JSON.stringify({ workflow_run: event }));
    writeFileSync(output, '');
    const { api, calls } = fakeApi(fixture);
    const reruns = [];
    const plan = main(
      {
        GH_REPOSITORY: repo,
        GITHUB_EVENT_PATH: eventPath,
        GITHUB_OUTPUT: output,
      },
      api,
      id => reruns.push(id)
    );
    return { plan, calls, reruns, output: readFileSync(output, 'utf8') };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const openPr = { number: 20767, state: 'open', head: { sha } };

test('a required job never acquired by a hosted runner is re-requested once', () => {
  const result = runMain(run(), {
    jobs: [greenJob(1), greenJob(2), unacquiredJob(111940110687)],
    annotations: { 111940110687: [{ message: UNACQUIRED }] },
    pulls: [openPr],
  });
  assert.equal(result.plan.rerun, true);
  assert.deepEqual(result.reruns, ['37361686408']);
  assert.equal(result.output, 'requested=true\n');
  assert.deepEqual(result.plan.jobs, [111940110687]);
});

test('an ordinary red run costs one jobs read and stays with the lanes', () => {
  const failed = { ...greenJob(5), conclusion: 'failure' };
  const result = runMain(run(), {
    jobs: [greenJob(1), failed],
    pulls: [openPr],
  });
  assert.equal(result.plan.rerun, false);
  assert.deepEqual(result.reruns, []);
  assert.equal(result.output, 'requested=false\n');
  assert.equal(result.calls.length, 1);
});

test('a never-started job without the acquisition annotation is not rerun', () => {
  // Concurrency supersession and manual cancels also leave runner_id 0.
  const result = runMain(run(), {
    jobs: [unacquiredJob(9)],
    annotations: {
      9: [{ message: 'Canceling since a higher priority request exists' }],
    },
    pulls: [openPr],
  });
  assert.equal(result.plan.rerun, false);
  assert.deepEqual(result.reruns, []);
});

test('a moved head, closed PR, or exhausted attempt never reruns', () => {
  const fixture = {
    jobs: [unacquiredJob(9)],
    annotations: { 9: [{ message: UNACQUIRED }] },
  };
  const moved = runMain(run(), {
    ...fixture,
    pulls: [{ ...openPr, head: { sha: 'b'.repeat(40) } }],
  });
  assert.equal(moved.plan.reason, 'no open PR at this exact head');
  const closed = runMain(run(), {
    ...fixture,
    pulls: [{ ...openPr, state: 'closed' }],
  });
  assert.equal(closed.plan.rerun, false);
  const capped = runMain(run({ run_attempt: RERUN_ATTEMPT_CAP + 1 }), {
    ...fixture,
    pulls: [openPr],
  });
  assert.equal(capped.plan.rerun, false);
  assert.deepEqual(capped.calls, []);
  for (const result of [moved, closed, capped])
    assert.deepEqual(result.reruns, []);
});

test('non-PR and non-failure runs are refused before any API read', () => {
  for (const event of [
    run({ event: 'push' }),
    run({ conclusion: 'success' }),
  ]) {
    const result = runMain(event, { jobs: [], pulls: [] });
    assert.equal(result.plan.rerun, false);
    assert.deepEqual(result.calls, []);
  }
});

test('neverStarted requires cancelled, no runner, and no steps', () => {
  assert.equal(neverStarted(unacquiredJob(1)), true);
  assert.equal(neverStarted({ ...unacquiredJob(1), steps: [{}] }), false);
  assert.equal(neverStarted({ ...unacquiredJob(1), runner_id: 7 }), false);
  assert.equal(
    neverStarted({ ...unacquiredJob(1), conclusion: 'failure' }),
    false
  );
  assert.equal(
    planUnacquiredRerun({
      run: run({ head_sha: 'x' }),
      pulls: [openPr],
      unacquiredJobIds: [1],
    }).rerun,
    false
  );
});

test('the relay skips the model-lane label only when a rerun was requested', () => {
  const workflow = load(
    readFileSync(
      resolve(
        import.meta.dirname,
        '../../../.github/workflows/lane-fix-relay.yml'
      ),
      'utf8'
    )
  );
  const rerunJob = workflow.jobs['rerun-unacquired'];
  assert.equal(rerunJob.permissions.actions, 'write');
  assert.equal(
    rerunJob.outputs.requested,
    '${{ steps.rerun.outputs.requested }}'
  );
  assert.match(rerunJob.if, /workflow_run\.event == 'pull_request'/);
  assert.match(rerunJob.if, /workflow_run\.conclusion == 'failure'/);
  const step = rerunJob.steps.find(s => s.id === 'rerun');
  assert.equal(step.run, 'node scripts/pr-unacquired-runner-rerun.mjs');
  assert.match(String(workflow.concurrency.group), /workflow_run\.head_sha/);
  assert.match(
    String(workflow.concurrency.group),
    /conclusion == 'success' && format\('lane-fix-relay-success-\{0\}'/
  );
  assert.equal(
    workflow.concurrency['cancel-in-progress'],
    "${{ github.event_name == 'push' || github.event_name == 'workflow_run' }}"
  );
  assert.equal(workflow.jobs.relay.steps[0].if, "github.event_name == 'workflow_run'");
  assert.doesNotMatch(String(workflow.concurrency.group), /github\.run_id/);
  assert.doesNotMatch(
    String(workflow.concurrency.group),
    /event\.inputs\.pr_number/
  );
  assert.equal(workflow.on.workflow_dispatch, null);
  const relay = workflow.jobs.relay;
  assert.equal(relay.needs, 'rerun-unacquired');
  const debounce = relay.steps[0];
  assert.equal(debounce.name, 'Debounce repeated workflow completions');
  assert.equal(debounce.run, 'sleep 20');
  assert.ok(relay.steps.findIndex(step => step.id === 'read-token') > 0);
  assert.match(
    relay.if,
    /^always\(\) && needs\.rerun-unacquired\.outputs\.requested != 'true' && \(/
  );
  assert.match(relay.if, /"success"/);
  assert.equal(relay.permissions.issues, 'write');
  assert.equal(relay.permissions['pull-requests'], 'write');
});
