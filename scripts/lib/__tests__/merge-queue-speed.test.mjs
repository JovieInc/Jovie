import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { collect } from '../../merge-queue-speed.mjs';
import {
  criticalPath,
  digestBlock,
  queueWaits,
  runWallSeconds,
  successByWindow,
  summarize,
} from '../merge-queue-speed.mjs';

const NOW = Date.UTC(2026, 9, 31, 24, 0, 0);
const at = minutesAgo => new Date(NOW - minutesAgo * 60_000).toISOString();
const run = (id, conclusion, minutesAgo, wallMin = 10, extra = {}) => ({
  id,
  status: 'completed',
  conclusion,
  created_at: at(minutesAgo),
  run_started_at: at(minutesAgo),
  updated_at: at(minutesAgo - wallMin),
  ...extra,
});
const job = (name, startAgo, endAgo, conclusion = 'success') => ({
  name,
  conclusion,
  started_at: at(startAgo),
  completed_at: at(endAgo),
});

describe('merge-queue speed', () => {
  it('rates group success over trailing windows, excluding cancelled from the gate', () => {
    const runs = [
      run(1, 'success', 30),
      run(2, 'failure', 60),
      run(3, 'cancelled', 90),
      run(4, 'success', 600),
      { ...run(5, 'success', 10), status: 'in_progress' },
    ];
    const w = successByWindow(runs, NOW);
    expect(w['2h']).toMatchObject({
      success: 1,
      failure: 1,
      cancelled: 1,
      successRate: 0.5,
      successRateInclCancelled: 0.333,
    });
    expect(w['24h'].successRate).toBe(0.667);
  });

  it('names the job that finished last, skipping summary and ready jobs', () => {
    const sampled = [
      {
        run: run(1, 'success', 20),
        jobs: [
          job('ci-fast (remaining)', 19, 11),
          job('Unit Tests 1/14', 19, 13),
          job('PR Ready', 11, 10),
          job('lint', 19, 18, 'skipped'),
        ],
      },
      { run: run(2, 'failure', 20), jobs: [job('Unit Tests 1/14', 19, 2)] },
    ];
    const [first, second] = criticalPath(sampled);
    expect(first).toMatchObject({
      name: 'ci-fast (remaining)',
      p50: 480,
      lastShare: 1,
    });
    expect(second).toMatchObject({ name: 'Unit Tests 1/14', lastShare: 0 });
  });

  it('keeps a short job that ends runs even when it is not among the longest', () => {
    const sampled = [
      {
        run: run(1, 'success', 20),
        jobs: [job('long', 19, 12), job('smoke', 13, 10)],
      },
    ];
    expect(criticalPath(sampled, { top: 1 }).map(r => r.name)).toEqual([
      'long',
      'smoke',
    ]);
  });

  it('measures enqueue-to-merge from the last add before the merge', () => {
    expect(
      queueWaits([
        { mergedAt: at(0), enqueuedAt: [at(50), at(20), at(-5)] },
        { mergedAt: at(0), enqueuedAt: [] },
        { mergedAt: null, enqueuedAt: [at(5)] },
      ])
    ).toEqual([1200]);
  });

  it('summarizes the digest numbers and the batch-size gate', () => {
    const groupRuns = [
      run(1, 'success', 30, 12),
      run(2, 'success', 60, 10),
      run(3, 'failure', 300, 9),
    ];
    const summary = summarize({
      prRuns: [run(9, 'success', 100, 6)],
      groupRuns,
      sampledGroupJobs: [
        { run: groupRuns[0], jobs: [job('a', 30, 20)] },
        { run: groupRuns[1], jobs: [job('a', 60, 50)] },
        { run: groupRuns[2], jobs: [job('a', 300, 290)] },
      ],
      mergedPrs: [
        { mergedAt: at(10), enqueuedAt: [at(40)] },
        { mergedAt: at(2000), enqueuedAt: [at(2010)] },
      ],
      now: NOW,
      collection: { status: 'collected', collectionId: 'run-1' },
    });
    expect(summary).toMatchObject({
      merges: 1,
      mergesPerHour: 0.04,
      groupSuccessRate: 0.667,
      mergeGroupCiSeconds: { n: 2, p50: 720 },
      prCiSeconds: { n: 1, p50: 360 },
      queueWaitSeconds: { n: 1, p50: 1800 },
      mergeGroupRunnerMinutesPerMerge: 30,
      batchSizeGate: { success2h: 1, eligible: true },
    });
    expect(digestBlock(summary, { now: NOW })).toEqual({
      mergesPerHour: 0.04,
      groupSuccessRate: 0.667,
      groupSuccessRate2h: 1,
      mergeGroupP50Seconds: 720,
      queueWaitP50Seconds: 1800,
      generatedAt: summary.generatedAt,
    });
    expect(digestBlock(null)).toBeNull();
  });

  it('reports nulls instead of zeros when nothing was sampled', () => {
    const summary = summarize({ now: NOW });
    expect(summary.groupSuccessRate).toBeNull();
    expect(summary.mergeGroupRunnerMinutesPerMerge).toBeNull();
    expect(summary.batchSizeGate.eligible).toBe(false);
  });
});

describe('bounded collection correctness', () => {
  it('computes arbitrary windows and excludes old and future samples', () => {
    const s = summarize({
      now: NOW,
      windowHours: 3,
      groupRuns: [
        run(1, 'success', 30),
        run(2, 'failure', 200),
        run(3, 'success', -10),
      ],
      mergedPrs: [
        { mergedAt: at(10), enqueuedAt: [at(20)] },
        { mergedAt: at(300), enqueuedAt: [at(320)] },
        { mergedAt: at(-5), enqueuedAt: [at(20)] },
      ],
    });
    expect(s.groupSuccessRate).toBe(1);
    expect(s.mergeGroupCiSeconds.n).toBe(1);
    expect(s.queueWaitSeconds.n).toBe(1);
    expect(s.merges).toBe(1);
  });
  it('does not extrapolate runner spend from a biased job sample', () => {
    const a = run(1, 'success', 30),
      b = run(2, 'failure', 40);
    const s = summarize({
      now: NOW,
      groupRuns: [a, b],
      sampledGroupJobs: [{ run: a, jobs: [job('a', 30, 20)] }],
      mergedPrs: [{ mergedAt: at(1) }],
    });
    expect(s.mergeGroupRunnerMinutesPerMerge).toBeNull();
  });
  it('names latest-attempt timing without claiming first-attempt duration', () => {
    const r = run(1, 'success', 60, 10, {
      run_attempt: 2,
      run_started_at: at(20),
      updated_at: at(10),
    });
    expect(runWallSeconds(r)).toBe(600);
    expect(summarize({ now: NOW }).timingBasis).toBe(
      'latest-attempt-start-to-workflow-update'
    );
  });
  it('rejects stale, future, failed and different-run digest receipts', () => {
    const s = summarize({
      now: NOW,
      collection: { status: 'collected', collectionId: 'current' },
    });
    expect(
      digestBlock(s, { now: NOW, collectionId: 'current' })
    ).not.toBeNull();
    for (const options of [
      { now: NOW + 27 * 3600000 },
      { now: NOW - 1 },
      { now: NOW, collectionId: 'next' },
    ])
      expect(digestBlock(s, options)).toBeNull();
    expect(digestBlock({ ...s, collection: null }, { now: NOW })).toBeNull();
  });
  it('marks capped lists and job pages partial without increasing API bounds', () => {
    let calls = 0;
    const gh = args => {
      calls++;
      if (args[0] === 'graphql')
        return {
          data: {
            search: {
              nodes: Array.from({ length: 100 }, (_, i) => ({
                number: i,
                mergedAt: at(10),
                timelineItems: { nodes: [] },
              })),
              pageInfo: { hasNextPage: true, endCursor: 'next' },
            },
          },
        };
      if (args[0].includes('/jobs?'))
        return { jobs: [job('a', 20, 10)], total_count: 101 };
      return {
        workflow_runs: Array.from({ length: 100 }, (_, i) =>
          run(i, 'success', 30)
        ),
        total_count: 2000,
      };
    };
    const s = collect({
      gh,
      repo: 'JovieInc/Jovie',
      now: NOW,
      maxJobs: 2,
      hours: 3,
    });
    expect(calls).toBe(27); // 20 list pages + 2 job reads + 5 search pages
    expect(s.collection).toMatchObject({
      prRunsComplete: false,
      groupRunsComplete: false,
      mergedPrsComplete: false,
      jobsComplete: false,
    });
    expect(s.groupSuccessRate).toBeNull();
    expect(s.mergesPerHour).toBeNull();
    expect(s.batchSizeGate.eligible).toBe(false);
    expect(s.criticalPath).toEqual([]);
  });
  it('rejects invalid arguments before requesting data', () => {
    const gh = () => {
      throw new Error('unexpected API call');
    };
    for (const hours of [0, -1, NaN, Infinity, 25])
      expect(() => collect({ gh, repo: 'x/y', hours })).toThrow('--hours');
    for (const maxJobs of [0, -1, 1.5, 201, NaN])
      expect(() => collect({ gh, repo: 'x/y', maxJobs })).toThrow('--max-jobs');
  });
});

it('withholds queue wait percentiles when bounded enqueue history is incomplete', () => {
  const s = summarize({
    now: NOW,
    mergedPrs: [{ mergedAt: at(1), enqueuedAt: [at(10)] }],
    collection: { queueEventsComplete: false },
  });
  expect(s.queueWaitSeconds).toEqual({ n: 1, p50: null, p95: null });
});

it('publishes complete bounded collections and forwards pagination and the 24h coverage window', () => {
  const calls = [];
  let searchPage = 0;
  const gh = args => {
    calls.push(args);
    if (args[0] === 'graphql') {
      searchPage++;
      return {
        data: {
          search: {
            nodes:
              searchPage === 1
                ? [
                    {
                      number: 1,
                      mergedAt: at(10),
                      timelineItems: {
                        totalCount: 1,
                        nodes: [{ createdAt: at(40) }],
                      },
                    },
                  ]
                : [],
            pageInfo: { hasNextPage: searchPage === 1, endCursor: 'cursor-1' },
          },
        },
      };
    }
    if (args[0].includes('/jobs?'))
      return { jobs: [job('build', 30, 20)], total_count: 1 };
    return { workflow_runs: [run(1, 'success', 30)] };
  };
  const s = collect({
    gh,
    repo: 'JovieInc/Jovie',
    now: NOW,
    hours: 3,
    collectionId: 'current/2',
  });
  expect(calls).toHaveLength(5);
  expect(
    calls
      .filter(args => args[0].includes('/runs?'))
      .every(args =>
        args[0].includes(new Date(NOW - 24 * 3600000).toISOString())
      )
  ).toBe(true);
  expect(calls.at(-1)).toContain('after=cursor-1');
  expect(s.collection).toEqual({
    status: 'collected',
    collectionId: 'current/2',
    prRunsComplete: true,
    groupRunsComplete: true,
    mergedPrsComplete: true,
    jobsComplete: true,
    queueEventsComplete: true,
  });
  expect(s.groupSuccessRate).toBe(1);
  expect(s.mergesPerHour).toBe(0.33);
  expect(s.mergeGroupRunnerMinutesPerMerge).toBe(10);
  expect(s.queueWaitSeconds.p50).toBe(1800);
  expect(
    digestBlock(s, { now: NOW, collectionId: 'current/2' })
  ).not.toBeNull();
});

it('the real CLI writes a fresh receipt bound to its workflow run and attempt', () => {
  const dir = mkdtempSync(join(tmpdir(), 'queue-speed-cli-'));
  try {
    const preload = join(dir, 'api-fixture.mjs');
    writeFileSync(
      preload,
      `import cp from 'node:child_process';
import {syncBuiltinESMExports} from 'node:module';
cp.execFileSync = (command,args) => {
 if (!args[0].endsWith('/packages/api-client/cli.ts') || !args.includes('--priority') || !args.includes('report')) throw new Error('unexpected command');
 return args.includes('graphql') ? JSON.stringify({data:{search:{nodes:[],pageInfo:{hasNextPage:false}}}}) : JSON.stringify({workflow_runs:[]});
};
syncBuiltinESMExports();`
    );
    const out = join(dir, 'snapshot.json');
    const output = execFileSync(
      process.execPath,
      [
        '--import',
        preload,
        resolve(import.meta.dirname, '../../merge-queue-speed.mjs'),
        '--out',
        out,
        '--hours',
        '3',
      ],
      {
        encoding: 'utf8',
        env: {
          ...process.env,
          GITHUB_RUN_ID: 'fixture-run',
          GITHUB_RUN_ATTEMPT: '2',
        },
      }
    );
    const summary = JSON.parse(readFileSync(out, 'utf8'));
    expect(summary.collection).toMatchObject({
      status: 'collected',
      collectionId: 'fixture-run/2',
      mergedPrsComplete: true,
      groupRunsComplete: true,
    });
    expect(output).toContain('Merge-queue speed (3h)');
    expect(
      digestBlock(summary, { now: Date.now(), collectionId: 'fixture-run/2' })
    ).not.toBeNull();
    expect(
      digestBlock(summary, { now: Date.now(), collectionId: 'fixture-run/3' })
    ).toBeNull();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
