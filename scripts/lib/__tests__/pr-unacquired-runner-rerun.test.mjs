import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import {
  classifyFallbackFailure,
  GitHubApiError,
  main,
  makeResilientApi,
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

// The JOV-7922 shape: an injected api or rerun that throws, plus the
// collected ::warning:: emissions, proving the hop downgrades instead of
// reddening the whole Lane Fix Relay run on main.
function runMainOverrides(event, { api, rerun = undefined }, warnings = []) {
  const dir = mkdtempSync(join(tmpdir(), 'unacquired-rerun-'));
  try {
    const eventPath = join(dir, 'event.json');
    const output = join(dir, 'output');
    writeFileSync(eventPath, JSON.stringify({ workflow_run: event }));
    writeFileSync(output, '');
    const plan = main(
      {
        GH_REPOSITORY: repo,
        GITHUB_EVENT_PATH: eventPath,
        GITHUB_OUTPUT: output,
      },
      api,
      rerun,
      { warn: message => warnings.push(String(message)) }
    );
    return { plan, output: readFileSync(output, 'utf8'), warnings };
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

const QUOTA_TEXT =
  'gh: API rate limit exceeded for installation ID 5159824 at 2026-10-30T20:16:34Z. [rate reset in 41m 12s]';

test('a quota-exhausted evidence read defers instead of reddening the relay run', () => {
  // JOV-7922, run 41121866631: the one jobs read 403'd on the shared
  // GITHUB_TOKEN bucket, execFileSync threw, and the whole Lane Fix Relay run
  // went red on main while Queue lane repair succeeded. Now the failure
  // classifies as infrastructure, defers with the marker and leaves the wake
  // to the relay job in the same run.
  const quotaApi = () => {
    throw new Error(QUOTA_TEXT);
  };
  const result = runMainOverrides(run(), { api: quotaApi });
  assert.equal(result.plan.rerun, false);
  assert.match(
    result.plan.reason,
    /evidence unavailable: GitHub primary-rate-limit/
  );
  assert.equal(result.output, 'requested=false\n');
  assert.equal(result.warnings.length, 1);
  assert.match(result.warnings[0], /github-quota-deferred/);
  assert.match(result.warnings[0], /not a verdict on this change/);
});

test('a failed rerun request degrades to the lanes instead of failing the job', () => {
  const warnings = [];
  const result = runMainOverrides(
    run(),
    {
      api: fakeApi({
        jobs: [greenJob(1), unacquiredJob(111940110687)],
        annotations: { 111940110687: [{ message: UNACQUIRED }] },
        pulls: [openPr],
      }).api,
      rerun: () => {
        throw new Error('gh: HTTP 403: forbidden');
      },
    },
    warnings
  );
  assert.equal(result.plan.rerun, false);
  assert.match(result.plan.reason, /rerun request failed/);
  assert.equal(result.output, 'requested=false\n');
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /relay still labels the PR/);
});

test('a real evidence error warns without the quota marker and still defers', () => {
  const result = runMainOverrides(run(), {
    api: () => {
      throw new Error('gh: Not Found (HTTP 404)');
    },
  });
  assert.equal(result.plan.rerun, false);
  assert.match(result.plan.reason, /evidence unavailable: GitHub none/);
  assert.equal(result.output, 'requested=false\n');
  assert.equal(result.warnings.length, 1);
  assert.doesNotMatch(result.warnings[0], /github-quota-deferred/);
});

test('transient evidence failures retry inside the budget before succeeding', () => {
  const outcomes = [
    { ok: false, stdout: '', text: 'gh: HTTP 502: Bad Gateway' },
    {
      ok: false,
      stdout: '',
      text: "gh: couldn't respond to your request in time",
    },
    { ok: true, stdout: '{"jobs":[]}', text: '' },
  ];
  const sleeps = [];
  const api = makeResilientApi({
    capture: () => outcomes.shift(),
    sleep: waitMs => sleeps.push(waitMs),
    now: () => 1_000_000,
  });
  assert.deepEqual(api('repos/JovieInc/Jovie/actions/runs/1/jobs'), {
    jobs: [],
  });
  assert.deepEqual(sleeps, [2000, 4000]);
});

test('quota exhaustion defers immediately without sleeping off the reset', () => {
  const sleeps = [];
  const logs = [];
  const api = makeResilientApi({
    capture: () => ({ ok: false, stdout: '', text: QUOTA_TEXT }),
    sleep: waitMs => sleeps.push(waitMs),
    log: message => logs.push(message),
  });
  assert.throws(
    () => api('repos/JovieInc/Jovie/actions/runs/1/jobs'),
    error => {
      assert.ok(error instanceof GitHubApiError);
      assert.equal(error.kind, 'primary-rate-limit');
      return true;
    }
  );
  assert.deepEqual(sleeps, []);
  assert.deepEqual(logs, []);
});

test('a real API error is classified none and never retried', () => {
  const sleeps = [];
  const api = makeResilientApi({
    capture: () => ({
      ok: false,
      stdout: '',
      text: 'gh: Not Found (HTTP 404)',
    }),
    sleep: waitMs => sleeps.push(waitMs),
  });
  assert.throws(
    () => api('repos/JovieInc/Jovie/actions/runs/1/jobs'),
    error => {
      assert.ok(error instanceof GitHubApiError);
      assert.equal(error.kind, 'none');
      return true;
    }
  );
  assert.deepEqual(sleeps, []);
});

test('without the shared classifier a quota failure still defers with the marker', () => {
  // The trusted sparse checkout does not carry the classifier yet, so the
  // fallback kind must keep the same downgrade semantics.
  const warnings = [];
  const result = runMainOverrides(
    run(),
    {
      api: () => {
        throw new GitHubApiError(
          'the github api read of repos/JovieInc/Jovie/actions/runs/1/jobs failed (rate-limit): API rate limit exceeded',
          'rate-limit'
        );
      },
    },
    warnings
  );
  assert.equal(result.plan.rerun, false);
  assert.match(result.plan.reason, /evidence unavailable: GitHub rate-limit/);
  assert.equal(result.output, 'requested=false\n');
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /github-quota-deferred/);
});

test('an unclassified gh failure degrades with a plain warning and no marker', () => {
  const warnings = [];
  const result = runMainOverrides(
    run(),
    {
      api: () => {
        throw new GitHubApiError(
          'the github api read of repos/JovieInc/Jovie/actions/runs/1/jobs failed (unclassified): gh: weird',
          'unclassified'
        );
      },
    },
    warnings
  );
  assert.equal(result.plan.rerun, false);
  assert.match(result.plan.reason, /evidence unavailable: GitHub unclassified/);
  assert.equal(result.output, 'requested=false\n');
  assert.equal(warnings.length, 1);
  assert.doesNotMatch(warnings[0], /github-quota-deferred/);
});

test('the fallback classifier only recognizes quota evidence', () => {
  assert.equal(classifyFallbackFailure(QUOTA_TEXT).kind, 'rate-limit');
  assert.equal(
    classifyFallbackFailure('gh: Not Found (HTTP 404)').kind,
    'unclassified'
  );
  assert.equal(
    classifyFallbackFailure('x-ratelimit-remaining: 0').kind,
    'rate-limit'
  );
  assert.equal(classifyFallbackFailure('').kind, 'unclassified');
});

test('without the shared classifier nothing retries and every failure degrades', () => {
  const sleeps = [];
  const logs = [];
  const api = makeResilientApi({
    classifier: null,
    capture: () => ({
      ok: false,
      stdout: '',
      text: 'gh: HTTP 502: Bad Gateway',
    }),
    sleep: waitMs => sleeps.push(waitMs),
    log: message => logs.push(message),
  });
  assert.throws(
    () => api('repos/JovieInc/Jovie/actions/runs/1/jobs'),
    error => {
      assert.ok(error instanceof GitHubApiError);
      assert.equal(error.kind, 'unclassified');
      return true;
    }
  );
  assert.deepEqual(sleeps, []);
  assert.deepEqual(logs, []);
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
  // The rerun policy only OPTIONALLY imports the shared-bucket failure
  // classifier: the trusted sparse checkout does not carry
  // scripts/lib/github-rate-limit.mjs yet (the App token that lands script
  // PRs cannot write workflow files), so the script degrades safely without
  // it. When the checkout line lands, retries and the full doctrine kinds
  // activate without any script change.
  const checkout = rerunJob.steps.find(
    s => s.name === 'Checkout trusted rerun policy'
  );
  assert.match(
    checkout.with['sparse-checkout'],
    /^\s*scripts\/pr-unacquired-runner-rerun\.mjs\s*$/m
  );
  assert.match(String(workflow.concurrency.group), /workflow_run\.head_sha/);
  assert.match(
    String(workflow.concurrency.group),
    /conclusion == 'success' && format\('lane-fix-relay-success-\{0\}'/
  );
  assert.equal(
    workflow.concurrency['cancel-in-progress'],
    "${{ github.event_name == 'push' || github.event_name == 'workflow_run' }}"
  );
  assert.equal(
    workflow.jobs.relay.steps[0].if,
    "github.event_name == 'workflow_run'"
  );
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
  // Green wakes are Source Validation's alone (the slowest required producer).
  assert.match(
    relay.if,
    /conclusion == 'success' && github\.event\.workflow_run\.name == 'Source Validation'/
  );
  assert.equal(relay.permissions.issues, 'write');
  assert.equal(relay.permissions['pull-requests'], 'write');
});
