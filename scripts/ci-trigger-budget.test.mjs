import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { load as yamlLoad } from 'js-yaml';
import {
  countRuns,
  evaluateBudget,
  main,
  measure,
  SKIP_THRESHOLD,
  skippedByWorkflow,
  summary,
} from './ci-trigger-budget.mjs';

const HOUR = 3_600_000;
const budget = { runsPerMergedPr: 60, ceiling: 300 };

/** Fake runs API: each run has a created time, a workflow file and a conclusion. */
function fakeApi(runs, merged) {
  const calls = [];
  const api = endpoint => {
    calls.push(endpoint);
    if (endpoint.startsWith('search/issues')) return { total_count: merged };
    const url = new URL(`https://x/${endpoint}`);
    const [from, to] = url.searchParams
      .get('created')
      .split('..')
      .map(Date.parse);
    const file = url.pathname.match(/workflows\/([^/]+)\/runs/)?.[1];
    const status = url.searchParams.get('status');
    const hits = runs.filter(
      r =>
        r.at >= from &&
        r.at <= to &&
        (!file || r.file === file) &&
        (!status || r.status === status)
    );
    const size = Number(url.searchParams.get('per_page'));
    const page = Number(url.searchParams.get('page') ?? 1);
    return {
      total_count: Math.min(hits.length, 2500),
      workflow_runs: hits
        .slice((page - 1) * size, page * size)
        .map(r => ({ path: `.github/workflows/${r.file}` })),
    };
  };
  return { api, calls };
}

test('counts split the window below the API cap', () => {
  const t0 = Date.parse('2026-11-04T00:00:00Z');
  const runs = Array.from({ length: 6000 }, (_, i) => ({
    at: t0 + i * 60_000,
    file: 'a.yml',
    status: 'success',
  }));
  const { api } = fakeApi(runs, 1);
  assert.equal(
    countRuns(
      api,
      'repos/o/r/actions/runs',
      new Date(t0),
      new Date(t0 + 7 * 24 * HOUR)
    ),
    6000
  );
});

test('skipped runs are grouped per workflow across split list windows', () => {
  const t0 = Date.parse('2026-11-10T18:00:00Z');
  const runs = Array.from({ length: 2300 }, (_, i) => ({
    at: t0 + i * 9000,
    file: i % 2 ? 'a.yml' : 'b.yml',
    status: 'skipped',
  }));
  const { api } = fakeApi(runs, 1);
  assert.deepEqual(
    skippedByWorkflow(api, 'o/r', new Date(t0), new Date(t0 + 6 * HOUR)),
    { 'a.yml': 1150, 'b.yml': 1150 }
  );
});

test('the budget fails over the ceiling and on a busy always-skipped workflow', () => {
  assert.deepEqual(
    evaluateBudget({ runs: 2000, merged: 10, budget, skipping: [] }).errors,
    []
  );
  const over = evaluateBudget({ runs: 4000, merged: 10, budget, skipping: [] });
  assert.equal(over.runsPerMergedPr, 400);
  assert.match(
    over.errors[0],
    /400 runs per merged PR passes the registry ceiling 300 \(target 60\)/
  );
  const skipping = [
    { file: 'hop.yml', day: [99, 100], week: [700, 710] },
    { file: 'busy.yml', day: [50, 100], week: [0, 0] },
    { file: 'quiet-week.yml', day: [99, 100], week: [600, 1000] },
  ];
  const result = evaluateBudget({ runs: 100, merged: 10, budget, skipping });
  assert.deepEqual(result.errors, [
    'hop.yml: 700 of 710 runs in 7 days skipped every job; move its job-level if: into the trigger',
  ]);
  assert.match(
    evaluateBudget({ runs: 1, merged: 0, budget, skipping: [] }).errors[0],
    /no merged PRs/
  );
  assert.ok(SKIP_THRESHOLD === 0.95);
  assert.match(
    summary({ runs: 100, merged: 10, budget, skipping, result }),
    /\| hop\.yml \| 99 \/ 100 \| 700 \/ 710 \|/
  );
});

test('measure confirms a 7-day skip share only for workflows skipping in the sample', () => {
  const now = Date.parse('2026-11-11T06:30:00Z');
  const to = Date.parse('2026-11-11T06:00:00Z');
  const runs = [];
  for (let i = 0; i < 600; i += 1)
    runs.push({ at: to - i * 15 * 60_000, file: 'hop.yml', status: 'skipped' });
  for (let i = 0; i < 300; i += 1)
    runs.push({
      at: to - i * 30 * 60_000,
      file: 'work.yml',
      status: 'success',
    });
  const { api, calls } = fakeApi(runs, 30);
  const measured = measure({ api, repo: 'o/r', now });
  assert.equal(measured.runs, 900);
  assert.equal(measured.merged, 30);
  assert.deepEqual(measured.skipping, [
    { file: 'hop.yml', day: [25, 25], week: [600, 600] },
  ]);
  // 84 two-hour slices for the week, one search, a short skipped-run sample.
  assert.ok(calls.length < 100, `${calls.length} calls`);
  assert.match(
    evaluateBudget({ ...measured, budget }).errors.join('\n'),
    /hop\.yml: 600 of 600/
  );
});

test('the nightly job rides the existing schedule, read-only, and is never a PR check', () => {
  const workflow = /** @type {any} */ (
    yamlLoad(
      fs.readFileSync('.github/workflows/ci-duration-ratchet.yml', 'utf8')
    )
  );
  assert.ok(
    workflow.on.schedule &&
      !workflow.on.pull_request &&
      !workflow.on.merge_group
  );
  const job = workflow.jobs['fan-out-budget'];
  assert.equal(job.if, "github.event_name != 'push'");
  assert.deepEqual(job.permissions, { actions: 'read', contents: 'read' });
  const run = job.steps.at(-1);
  assert.equal(run.env.GH_TOKEN, '${{ github.token }}');
  assert.equal(run.run, 'node scripts/ci-trigger-budget.mjs');
  for (const file of job.steps[0].with['sparse-checkout'].trim().split(/\s+/))
    assert.ok(fs.existsSync(file), file);
});

test('a quota deferral from the shared client is a notice, not a red budget', t => {
  const writes = [];
  t.mock.method(process.stdout, 'write', chunk => writes.push(String(chunk)));
  const deferred = () => {
    throw Object.assign(new Error('github-quota-deferred'), { status: 75 });
  };
  assert.equal(main({ GITHUB_REPOSITORY: 'o/r' }, deferred), 0);
  t.mock.restoreAll();
  assert.match(writes.join(''), /deferred: GitHub quota/);
  assert.throws(
    () =>
      main({ GITHUB_REPOSITORY: 'o/r' }, () => {
        throw Object.assign(new Error('boom'), { status: 1 });
      }),
    /boom/
  );
});
