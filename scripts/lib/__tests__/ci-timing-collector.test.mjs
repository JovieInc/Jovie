import { describe, expect, it } from 'vitest';
import {
  CAPS,
  collectRunRows,
  computeQueueDepth,
  jobAttemptRow,
  parseQueuePrNumber,
  queueEventRow,
  SCHEMA_VERSION,
  toNdjson,
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
    expect(row.anomalous_earlier_start).toBeTrue();
    expect(row.started_at).toBe('2026-10-23T19:58:00Z');
    expect(row.started_at_normalized).toBe('2026-10-23T20:00:00Z');
  });

  it('does not flag normal jobs and normalizes to the raw started_at', () => {
    const row = jobAttemptRow({
      run: BASE_RUN,
      job: BASE_JOB,
      collectedAt: '2026-10-23T19:12:30Z',
    });
    expect(row.anomalous_earlier_start).toBeFalse();
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
    expect(result.truncated).toBeFalse();
    expect(result.rows[0].job_id).toBe(90001);
    expect(result.rows[1].job_name).toBe('Unit Tests (5/10)');
    expect(calls[0]).toContain('/actions/runs/5001/jobs');
    expect(calls[0]).toContain('filter_run_attempt=1');
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
    expect(result.truncated).toBeTrue();
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
    expect(result.truncated).toBeTrue();
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
    expect(seen.some(p => p.includes('status=queued'))).toBeTrue();
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
