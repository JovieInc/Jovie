import { describe, expect, it } from 'vitest';
import {
  CAPS,
  collectRunRows,
  computeQueueDepth,
  createWritePacer,
  ghApi,
  isBackfillRun,
  jobAttemptRow,
  parseQueuePrNumber,
  poolQueueWait,
  pruneDeletions,
  queueEventRow,
  queueWaitSeconds,
  runnerPool,
  SCHEMA_VERSION,
  selectBackfillRuns,
  toNdjson,
  WRITE_SPACING_MS,
} from '../ci-timing-collector.mjs';

const BASE_RUN = {
  id: 5001,
  run_attempt: 1,
  head_sha: 'abc123def456',
  head_branch: 'tim/jov-8933-ci-timing-collector',
  name: 'CI',
  event: 'pull_request',
  created_at: '2026-10-23T19:00:00Z',
  run_started_at: '2026-10-23T19:00:05Z',
  updated_at: '2026-10-23T19:12:00Z',
  conclusion: 'success',
  pull_requests: [{ number: 22868 }],
};

const BASE_JOB = {
  id: 90001,
  run_id: 5001,
  run_attempt: 1,
  head_sha: 'abc123def456',
  name: 'ci-fast (remaining)',
  started_at: '2026-10-23T19:01:00Z',
  completed_at: '2026-10-23T19:09:00Z',
  conclusion: 'success',
  runner_name: 'ubuntu-latest',
};

describe('parseQueuePrNumber', () => {
  it('extracts the PR number from a merge-queue branch name', () => {
    expect(parseQueuePrNumber('gh-readonly-queue/main/pr-22868-1a2b3c4d')).toBe(
      22868
    );
  });

  it('returns null for non-queue branches', () => {
    expect(parseQueuePrNumber('tim/jov-8933-ci-timing-collector')).toBeNull();
    expect(parseQueuePrNumber('main')).toBeNull();
    expect(parseQueuePrNumber(undefined)).toBeNull();
  });
});

describe('jobAttemptRow', () => {
  it('emits one row keyed on run_id + run_attempt + job_id with join fields', () => {
    const row = jobAttemptRow({
      run: BASE_RUN,
      job: BASE_JOB,
      collectedAt: '2026-10-23T19:12:30Z',
    });
    expect(row.schema_version).toBe(SCHEMA_VERSION);
    expect(row.row_type).toBe('job_attempt');
    expect(row.run_id).toBe(5001);
    expect(row.run_attempt).toBe(1);
    expect(row.job_id).toBe(90001);
    expect(row.pr_number).toBe(22868);
    expect(row.head_sha).toBe('abc123def456');
    expect(row.job_name).toBe('ci-fast (remaining)');
    expect(row.queued_at).toBe('2026-10-23T19:00:05Z');
    expect(row.started_at).toBe('2026-10-23T19:01:00Z');
    expect(row.completed_at).toBe('2026-10-23T19:09:00Z');
    expect(row.conclusion).toBe('success');
    expect(row.collected_at).toBe('2026-10-23T19:12:30Z');
  });

  it('handles re-runs that report started_at earlier than created_at explicitly', () => {
    const rerun = {
      ...BASE_RUN,
      run_attempt: 2,
      created_at: '2026-10-23T20:00:00Z',
    };
    const job = {
      ...BASE_JOB,
      run_attempt: 2,
      started_at: '2026-10-23T19:58:00Z',
    };
    const row = jobAttemptRow({
      run: rerun,
      job,
      collectedAt: '2026-10-23T20:05:00Z',
    });
    expect(row.anomalous_earlier_start).toBe(true);
    expect(row.started_at).toBe('2026-10-23T19:58:00Z');
    expect(row.started_at_normalized).toBe('2026-10-23T20:00:00Z');
  });

  it('does not flag normal jobs and normalizes to the raw started_at', () => {
    const row = jobAttemptRow({
      run: BASE_RUN,
      job: BASE_JOB,
      collectedAt: '2026-10-23T19:12:30Z',
    });
    expect(row.anomalous_earlier_start).toBe(false);
    expect(row.started_at_normalized).toBe('2026-10-23T19:01:00Z');
  });

  it('falls back to head-branch queue parsing and null pull_requests', () => {
    const run = {
      ...BASE_RUN,
      event: 'merge_group',
      head_branch: 'gh-readonly-queue/main/pr-22868-1a2b3c4d',
      pull_requests: [],
    };
    const row = jobAttemptRow({
      run,
      job: BASE_JOB,
      collectedAt: '2026-10-23T19:12:30Z',
    });
    expect(row.pr_number).toBe(22868);
  });
});

describe('computeQueueDepth', () => {
  it('sums queued and in-progress entries', () => {
    expect(computeQueueDepth(4, 2)).toBe(6);
    expect(computeQueueDepth(0, 0)).toBe(0);
  });
});

describe('queueEventRow', () => {
  it('captures queue enter/start/end/merge plus depth and join keys', () => {
    const run = {
      ...BASE_RUN,
      event: 'merge_group',
      head_branch: 'gh-readonly-queue/main/pr-22868-1a2b3c4d',
    };
    const row = queueEventRow({
      run,
      mergedAt: '2026-10-23T19:15:00Z',
      queueDepth: 3,
      collectedAt: '2026-10-23T19:12:30Z',
    });
    expect(row.row_type).toBe('queue_event');
    expect(row.pr_number).toBe(22868);
    expect(row.head_sha).toBe('abc123def456');
    expect(row.run_id).toBe(5001);
    expect(row.run_attempt).toBe(1);
    expect(row.queue_enter_at).toBe('2026-10-23T19:00:00Z');
    expect(row.queue_start_at).toBe('2026-10-23T19:00:05Z');
    expect(row.queue_end_at).toBe('2026-10-23T19:12:00Z');
    expect(row.merged_at).toBe('2026-10-23T19:15:00Z');
    expect(row.queue_depth).toBe(3);
  });

  it('leaves merged_at null when the run did not merge', () => {
    const run = {
      ...BASE_RUN,
      event: 'merge_group',
      head_branch: 'gh-readonly-queue/main/pr-22868-1a2b3c4d',
      conclusion: 'failure',
    };
    const row = queueEventRow({
      run,
      mergedAt: null,
      queueDepth: 1,
      collectedAt: '2026-10-23T19:12:30Z',
    });
    expect(row.merged_at).toBeNull();
  });
});

describe('collectRunRows', () => {
  it('paginates the jobs API, emits one row per job, and stops under the page cap', async () => {
    const calls = [];
    const fetchJson = async path => {
      calls.push(path);
      return {
        total_count: 2,
        jobs: [BASE_JOB, { ...BASE_JOB, id: 90002, name: 'Unit Tests (5/10)' }],
      };
    };
    const result = await collectRunRows({
      run: BASE_RUN,
      fetchJson,
      collectedAt: '2026-10-23T19:12:30Z',
    });
    expect(result.rows.length).toBe(2);
    expect(result.truncated).toBe(false);
    expect(result.rows[0].job_id).toBe(90001);
    expect(result.rows[1].job_name).toBe('Unit Tests (5/10)');
    // Attempt-scoped jobs endpoint: the general /runs/{id}/jobs URL serves
    // the latest attempt and races reruns.
    expect(calls[0]).toBe(
      `/repos/{owner}/{repo}/actions/runs/5001/attempts/1/jobs?per_page=${CAPS.jobsPerPage}`
    );
    expect(calls[0]).not.toContain('filter_run_attempt');
  });

  it('keeps a rerun attempt on its own attempt-scoped endpoint', async () => {
    const calls = [];
    const fetchJson = async path => {
      calls.push(path);
      return { total_count: 1, jobs: [BASE_JOB] };
    };
    await collectRunRows({
      run: { ...BASE_RUN, run_attempt: 2 },
      fetchJson,
      collectedAt: '2026-10-23T19:12:30Z',
    });
    expect(calls[0]).toContain('/attempts/2/jobs');
  });

  it('fetches exactly two pages for 101 jobs', async () => {
    const calls = [];
    const jobs = Array.from({ length: 101 }, (_, i) => ({
      ...BASE_JOB,
      id: 100000 + i,
    }));
    const fetchJson = async path => {
      calls.push(path);
      const page = path.includes('page=2') ? 2 : 1;
      return {
        total_count: 101,
        jobs: page === 1 ? jobs.slice(0, 100) : jobs.slice(100),
      };
    };
    const result = await collectRunRows({
      run: BASE_RUN,
      fetchJson,
      collectedAt: '2026-10-23T19:12:30Z',
    });
    expect(result.jobsFetched).toBe(101);
    expect(result.jobPagesFetched).toBe(2);
    expect(result.truncated).toBe(false);
    expect(calls).toHaveLength(2);
    expect(calls[1]).toContain('page=2');
  });

  it('enforces the rows-per-run cap and reports truncation', async () => {
    const jobs = [];
    for (let i = 0; i < CAPS.maxRowsPerRunEvent + 100; i += 1) {
      jobs.push({ ...BASE_JOB, id: 100000 + i });
    }
    const fetchJson = async () => ({ total_count: jobs.length, jobs });
    const result = await collectRunRows({
      run: BASE_RUN,
      fetchJson,
      collectedAt: '2026-10-23T19:12:30Z',
    });
    expect(result.truncated).toBe(true);
    expect(result.rows.length).toBe(CAPS.maxRowsPerRunEvent);
  });

  it('caps API pages at maxJobPages', async () => {
    let pages = 0;
    const fetchJson = async () => {
      pages += 1;
      return { total_count: 999999, jobs: [BASE_JOB] };
    };
    const result = await collectRunRows({
      run: BASE_RUN,
      fetchJson,
      collectedAt: '2026-10-23T19:12:30Z',
    });
    expect(pages).toBe(CAPS.maxJobPages);
    expect(result.truncated).toBe(true);
  });

  it('adds one queue_event row with depth for merge_group runs', async () => {
    const run = {
      ...BASE_RUN,
      event: 'merge_group',
      head_branch: 'gh-readonly-queue/main/pr-22868-1a2b3c4d',
      conclusion: 'success',
    };
    const seen = [];
    const fetchJson = async path => {
      seen.push(path);
      if (path.includes('/jobs')) return { total_count: 1, jobs: [BASE_JOB] };
      if (path.includes('status=queued'))
        return { total_count: 2, workflow_runs: [] };
      if (path.includes('status=in_progress'))
        return { total_count: 1, workflow_runs: [] };
      if (path.includes('/pulls/'))
        return { merged: true, merged_at: '2026-10-23T19:15:00Z' };
      throw new Error(`unexpected path ${path}`);
    };
    const result = await collectRunRows({
      run,
      fetchJson,
      collectedAt: '2026-10-23T19:12:30Z',
    });
    expect(result.rows.length).toBe(2);
    const queueRows = result.rows.filter(r => r.row_type === 'queue_event');
    expect(queueRows.length).toBe(1);
    expect(queueRows[0].queue_depth).toBe(3);
    expect(queueRows[0].merged_at).toBe('2026-10-23T19:15:00Z');
    expect(seen.some(p => p.includes('status=queued'))).toBe(true);
  });

  it('does not emit queue_event rows for pull_request runs', async () => {
    const fetchJson = async () => ({ total_count: 1, jobs: [BASE_JOB] });
    const result = await collectRunRows({
      run: BASE_RUN,
      fetchJson,
      collectedAt: '2026-10-23T19:12:30Z',
    });
    expect(result.rows.filter(r => r.row_type === 'queue_event').length).toBe(
      0
    );
  });
});

describe('toNdjson', () => {
  it('serializes one JSON document per line', () => {
    const text = toNdjson([{ a: 1 }, { b: 2 }]);
    const lines = text.trim().split('\n');
    expect(lines.length).toBe(2);
    expect(JSON.parse(lines[0]).a).toBe(1);
    expect(JSON.parse(lines[1]).b).toBe(2);
  });
});

describe('ghApi CLI adapter', () => {
  it('passes the resolved endpoint to gh api', async () => {
    const seen = [];
    const run = async args => {
      seen.push(args);
      return { code: 0, stdout: '{"ok":true}', stderr: '', deferred: false };
    };
    const out = await ghApi(
      { owner: 'JovieInc', repo: 'Jovie' },
      'GET',
      '/repos/{owner}/{repo}/actions/runs/5001/attempts/1/jobs?per_page=100',
      undefined,
      { run, pacer: async () => {} }
    );
    expect(out).toEqual({ ok: true });
    expect(seen[0][0]).toBe('api');
    expect(seen[0][1]).toBe(
      '/repos/JovieInc/Jovie/actions/runs/5001/attempts/1/jobs?per_page=100'
    );
  });

  it('paces writes (method != GET) through the injected pacer', async () => {
    const paced = [];
    const run = async args => {
      seen.push(args);
      return { code: 0, stdout: '{"sha":"x"}', stderr: '', deferred: false };
    };
    const seen = [];
    await ghApi(
      { owner: 'JovieInc', repo: 'Jovie' },
      'POST',
      '/repos/{owner}/{repo}/git/blobs',
      { content: 'x', encoding: 'utf-8' },
      {
        run,
        pacer: async () => {
          paced.push(1);
        },
      }
    );
    expect(paced).toHaveLength(1);
    expect(seen[0]).toContain('-X');
    expect(seen[0]).toContain('POST');
    expect(seen[0]).toContain('/repos/JovieInc/Jovie/git/blobs');
  });
});

describe('createWritePacer', () => {
  it('waits out the write spacing between consecutive writes, bounded', async () => {
    let clock = 1000;
    const sleeps = [];
    const pace = createWritePacer({
      now: () => clock,
      sleep: async ms => {
        sleeps.push(ms);
        clock += ms;
      },
    });
    await pace(); // first write: no wait
    expect(sleeps).toEqual([]);
    await pace(); // second write inside the window: wait one interval
    expect(sleeps).toEqual([WRITE_SPACING_MS]);
    await pace(); // consecutive writes stay spaced one interval apart
    expect(sleeps).toEqual([WRITE_SPACING_MS, WRITE_SPACING_MS]);
  });
});

describe('pruneDeletions', () => {
  const blob = (path, sha = 'b1') => ({ path, type: 'blob', sha });

  it('deletes only stale data/YYYY-MM-DD/ blobs via null-SHA entries', () => {
    const tree = {
      tree: [
        blob('data/2026-09-01/run-1-a1.ndjson'),
        blob('data/2026-11-10/run-2-a1.ndjson'), // fresh: at the cutoff day
        blob('data/2026-10-31-extra/run-3-a1.ndjson'), // not a day dir
        blob('data/nodate/run-4.ndjson'),
        blob('README.md'),
        { path: 'data/2026-09-01', type: 'tree' },
      ],
    };
    const deletions = pruneDeletions(tree, {
      cutoffMs: Date.parse('2026-11-10T00:00:00Z'),
    });
    expect(deletions).toEqual([
      { path: 'data/2026-09-01/run-1-a1.ndjson', sha: null },
    ]);
  });

  it('caps deletions and never prunes a truncated listing', () => {
    const tree = {
      tree: Array.from({ length: CAPS.maxPruneDeletes + 5 }, (_, i) =>
        blob(`data/2026-09-01/run-${i}-a1.ndjson`)
      ),
    };
    const limits = { cutoffMs: Date.parse('2026-11-10T00:00:00Z') };
    expect(pruneDeletions(tree, limits)).toHaveLength(CAPS.maxPruneDeletes);
    expect(pruneDeletions({ ...tree, truncated: true }, limits)).toBeNull();
    expect(pruneDeletions(null, limits)).toBeNull();
  });
});

describe('backfill run selection', () => {
  const listed = attrs => ({
    id: attrs.id,
    run_attempt: 1,
    name: attrs.name,
    path: `.github/workflows/${attrs.name.toLowerCase()}.yml`,
    event: attrs.event ?? 'pull_request',
    status: 'completed',
    created_at: attrs.created_at,
    updated_at: attrs.updated_at ?? attrs.created_at,
    conclusion: 'success',
  });
  const WINDOW_START = Date.parse('2026-11-10T12:00:00Z');

  it('filters to CI / Source Validation BEFORE the run cap, trigger first', () => {
    const trigger = listed({
      id: 1,
      name: 'CI',
      created_at: '2026-11-10T12:05:00Z',
    });
    const noise = Array.from({ length: 25 }, (_, i) =>
      listed({
        id: 100 + i,
        name: 'Shipping SLO',
        created_at: '2026-11-10T12:08:00Z',
      })
    );
    const ci = Array.from({ length: 25 }, (_, i) =>
      listed({
        id: 200 + i,
        name: 'Source Validation',
        created_at: '2026-11-10T12:09:00Z',
      })
    );
    expect(isBackfillRun(trigger)).toBe(true);
    expect(isBackfillRun(noise[0])).toBe(false);
    const selected = selectBackfillRuns({
      triggerRun: trigger,
      listedRuns: [...noise, ...ci],
      windowStartMs: WINDOW_START,
    });
    expect(selected).toHaveLength(CAPS.maxBackfillRuns);
    expect(selected[0].id).toBe(1); // triggering run reserved first
    expect(selected.every(run => isBackfillRun(run))).toBe(true);
  });

  it('admits a long-running run finished inside the window via updated_at', () => {
    const longRunning = listed({
      id: 7,
      name: 'CI',
      created_at: '2026-11-10T10:00:00Z', // created before the window
      updated_at: '2026-11-10T12:10:00Z', // finished inside it
    });
    const stale = listed({
      id: 8,
      name: 'CI',
      created_at: '2026-11-10T09:00:00Z',
      updated_at: '2026-11-10T11:00:00Z', // finished before the window
    });
    const selected = selectBackfillRuns({
      triggerRun: null,
      listedRuns: [longRunning, stale],
      windowStartMs: WINDOW_START,
    });
    expect(selected.map(run => run.id)).toEqual([7]);
  });

  it('keys by (run_id, run_attempt) so a rerun cannot displace the trigger', () => {
    const trigger = listed({
      id: 1,
      name: 'CI',
      created_at: '2026-11-10T12:05:00Z',
    });
    const sameRunNewAttempt = { ...trigger, run_attempt: 2 };
    const selected = selectBackfillRuns({
      triggerRun: trigger,
      listedRuns: [sameRunNewAttempt],
      windowStartMs: WINDOW_START,
    });
    expect(selected).toHaveLength(2);
    expect(selected[0].run_attempt).toBe(1);
    expect(selected[1].run_attempt).toBe(2);
  });
});

describe('runner pool queue wait', () => {
  it('classifies the gem pool and measures created -> started', () => {
    expect(runnerPool(['self-hosted', 'Linux', 'X64', 'jovie-fixed'])).toBe(
      'self-hosted'
    );
    expect(runnerPool(['ubuntu-latest'])).toBe('hosted');
    expect(runnerPool(undefined)).toBe('hosted');
    expect(
      queueWaitSeconds({
        created_at: '2026-10-29T16:00:00Z',
        started_at: '2026-10-29T16:02:00Z',
      })
    ).toBe(120);
    expect(queueWaitSeconds({ created_at: '2026-10-29T16:00:00Z' })).toBeNull();
    const row = jobAttemptRow({
      run: BASE_RUN,
      job: {
        ...BASE_JOB,
        labels: ['self-hosted', 'jovie-fixed'],
        created_at: '2026-10-23T19:00:30Z',
      },
      collectedAt: '2026-10-23T20:00:00Z',
    });
    expect(row).toMatchObject({ runner_pool: 'self-hosted', queue_wait_s: 30 });
  });

  it('reports p50/p95 per pool from job_attempt rows only', () => {
    const rows = [
      ...[3, 3, 4, 5, 33].map(w => ({
        row_type: 'job_attempt',
        runner_pool: 'hosted',
        queue_wait_s: w,
      })),
      ...[69, 120, 192, 451].map(w => ({
        row_type: 'job_attempt',
        runner_pool: 'self-hosted',
        queue_wait_s: w,
      })),
      { row_type: 'queue_event', queue_wait_s: 999 },
    ];
    expect(poolQueueWait(rows)).toEqual({
      hosted: { n: 5, p50S: 4, p95S: 33 },
      'self-hosted': { n: 4, p50S: 120, p95S: 451 },
    });
  });
});
