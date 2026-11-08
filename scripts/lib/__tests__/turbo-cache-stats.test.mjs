import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CAPS, collectRunRows, turboLogJobs } from '../ci-timing-collector.mjs';
import {
  laneName,
  parseTurboCacheLog,
  summarizeHitRate,
} from '../turbo-cache-stats.mjs';
import {
  cloudflareReadOnlyEnv,
  SIGNATURE_STANZA,
  signedTurboJson,
} from '../turbo-remote-cache.mjs';

// Shapes copied from real Source Validation / merge-group logs (2026-10-29).
const SV_LOG = [
  '2026-10-29T05:37:07.7624104Z turbo-cache: backend=cloudflare-r2 role=ro signed=yes',
  '2026-10-29T16:38:56.6778671Z    • Running typecheck in 3 packages',
  '2026-10-29T16:40:53.3427437Z  Tasks:    9 successful, 9 total',
  '2026-10-29T16:40:53.3427878Z Cached:    4 cached, 9 total',
  '2026-10-29T16:41:00.0000000Z Cached:    1 cached, 1 total',
].join('\n');

describe('parseTurboCacheLog', () => {
  it('sums every turbo run in a job and reads the selected backend', () => {
    expect(parseTurboCacheLog(SV_LOG)).toEqual({
      backend: 'cloudflare-r2',
      role: 'ro',
      remoteDisabled: false,
      turboRuns: 2,
      tasksCached: 5,
      tasksTotal: 10,
    });
  });

  it('reports a disabled remote and legacy backend without a role', () => {
    const log =
      'turbo-cache: backend=legacy (no Cloudflare credentials)\n • Remote caching disabled\nCached:    0 cached, 1 total';
    const stats = parseTurboCacheLog(log);
    expect(stats.backend).toBe('legacy');
    expect(stats.role).toBeNull();
    expect(stats.remoteDisabled).toBe(true);
    expect(stats.tasksTotal).toBe(1);
  });

  it('treats a log without turbo as zero tasks', () => {
    expect(parseTurboCacheLog(undefined)).toMatchObject({
      turboRuns: 0,
      tasksTotal: 0,
      backend: null,
    });
  });
});

describe('summarizeHitRate', () => {
  it('folds matrix shards into one lane and ignores turbo-free jobs', () => {
    const s = summarizeHitRate([
      { job_name: 'Unit Tests (1/14)', tasks_cached: 1, tasks_total: 1 },
      { job_name: 'Unit Tests (2/14)', tasks_cached: 0, tasks_total: 1 },
      { job_name: 'Source Validation', tasks_cached: 0, tasks_total: 0 },
    ]);
    expect(s.hitRate).toBe(0.5);
    expect(s.lanes['Unit Tests']).toEqual({
      cached: 1,
      total: 2,
      jobs: 2,
      hitRate: 0.5,
    });
    expect(s.lanes['Source Validation']).toBeUndefined();
    expect(laneName('Build + Layout (combined)')).toBe(
      'Build + Layout (combined)'
    );
  });
});

describe('collector turbo_cache rows', () => {
  const run = {
    id: CAPS.turboCacheSampleModulo * 1000,
    run_attempt: 2,
    head_sha: 'abc',
    head_branch: 'gh-readonly-queue/main/pr-23525-deadbeef',
    name: 'CI',
    event: 'merge_group',
    status: 'completed',
    conclusion: 'failure',
    created_at: '2026-10-29T16:00:00Z',
    run_started_at: '2026-10-29T16:00:05Z',
    updated_at: '2026-10-29T16:10:00Z',
    pull_requests: [],
  };
  const job = (id, name, conclusion = 'success') => ({
    id,
    name,
    conclusion,
    head_sha: 'abc',
    run_attempt: 2,
    started_at: '2026-10-29T16:01:00Z',
    completed_at: '2026-10-29T16:05:00Z',
  });
  const jobs = [
    job(1, 'Unit Tests (1/14)'),
    job(2, 'Unit Tests (2/14)', 'cancelled'),
    job(3, 'Path Changes'),
    job(4, 'Build + Layout (combined)'),
  ];
  const fetchJson = async path => {
    if (path.includes('/jobs?')) return { total_count: jobs.length, jobs };
    if (path.includes('actions/runs?'))
      return { total_count: 0, workflow_runs: [] };
    throw new Error(`unexpected ${path}`);
  };

  it('samples turbo jobs only and records hit counts per job', async () => {
    const fetched = [];
    const { rows } = await collectRunRows({
      run,
      fetchJson,
      fetchText: async path => {
        fetched.push(path);
        if (path.includes('/jobs/4/')) throw new Error('log expired');
        return SV_LOG;
      },
      collectedAt: '2026-10-29T17:00:00Z',
    });
    expect(fetched).toEqual([
      '/repos/{owner}/{repo}/actions/jobs/1/logs',
      '/repos/{owner}/{repo}/actions/jobs/4/logs',
    ]);
    const turbo = rows.filter(r => r.row_type === 'turbo_cache');
    expect(turbo).toHaveLength(1);
    expect(turbo[0]).toMatchObject({
      pr_number: 23525,
      run_attempt: 2,
      job_name: 'Unit Tests (1/14)',
      backend: 'cloudflare-r2',
      role: 'ro',
      tasks_cached: 5,
      tasks_total: 10,
    });
  });

  it('reads no logs for unsampled runs or other workflows', () => {
    expect(turboLogJobs({ ...run, id: run.id + 1 }, jobs)).toEqual([]);
    expect(turboLogJobs({ ...run, name: 'PR Size Guard' }, jobs)).toEqual([]);
    const many = Array.from({ length: 20 }, (_, i) =>
      job(100 + i, `Unit Tests (${i + 1}/20)`)
    );
    expect(turboLogJobs(run, many)).toHaveLength(CAPS.maxTurboLogJobsPerRun);
  });
});

describe('turbo remote cache selection (local / Gem)', () => {
  it('selects the read-only R2 cache and never a writable mode', () => {
    const env = cloudflareReadOnlyEnv({
      url: 'https://cache.example.dev/',
      roToken: 'ro',
      signatureKey: 'k',
      signedJsonPath: '/tmp/t.json',
    });
    expect(env).toEqual({
      TURBO_API: 'https://cache.example.dev',
      TURBO_TOKEN: 'ro',
      TURBO_TEAM: 'jovie',
      TURBO_CACHE: 'local:rw,remote:r',
      TURBO_ROOT_TURBO_JSON: '/tmp/t.json',
      TURBO_REMOTE_CACHE_SIGNATURE_KEY: 'k',
    });
    expect(cloudflareReadOnlyEnv({ url: 'https://x' })).toBeNull();
  });

  it('injects the same signature stanza as the composite action', () => {
    const action = readFileSync(
      new URL(
        '../../../.github/actions/setup-node-pnpm/action.yml',
        import.meta.url
      ),
      'utf8'
    );
    // perl replacement text: {\n  "remoteCache": { "signature": true },
    expect(action).toContain(
      `s/\\{/{${SIGNATURE_STANZA.replace('\n', '\\n')}/`
    );
    const signed = signedTurboJson('// c\n{\n  "tasks": {}\n}\n');
    expect(signed).toBe(
      '// c\n{\n  "remoteCache": { "signature": true },\n  "tasks": {}\n}\n'
    );
  });

  it('exports a read-only mode on every path of the action', () => {
    const action = readFileSync(
      new URL(
        '../../../.github/actions/setup-node-pnpm/action.yml',
        import.meta.url
      ),
      'utf8'
    );
    expect(
      action.match(/TURBO_CACHE_READ=local:r"? >> "\$GITHUB_ENV"/g)
    ).toHaveLength(2);
    expect(action).toContain('echo "TURBO_CACHE_READ=local:r,remote:r"');
  });
});
