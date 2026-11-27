import { describe, expect, it } from 'vitest';
import {
  observeGithubWorkflow,
  observeWorkflowFailureStreak,
} from '../../automation-liveness.mjs';
import {
  evaluateEntry,
  evaluateLiveness,
  livenessDecisions,
} from '../automation-registry.mjs';

const nowMs = Date.parse('2026-11-27T05:30:00Z');
const iso = minutesAgo => new Date(nowMs - minutesAgo * 60_000).toISOString();
const jobName = 'Check automation heartbeats';
const receipt = {
  kind: 'github-workflow',
  repo: 'JovieInc/Jovie',
  workflow: 'automation-liveness.yml',
  branch: 'main',
  job: jobName,
  conclusions: ['success'],
};
const entry = {
  receipt,
  id: 'github:jovie:automation-liveness',
  maxStalenessMinutes: 60,
};

function run(id, minutesAgo, conclusion = 'success', attempt = 1) {
  return {
    id,
    run_attempt: attempt,
    conclusion,
    status: 'completed',
    created_at: iso(minutesAgo),
    run_started_at: iso(minutesAgo),
    updated_at: iso(minutesAgo - 1),
  };
}

function job(row, conclusion, completed = 2) {
  return {
    id: row.id + 100000,
    run_id: row.id,
    run_attempt: row.run_attempt,
    name: jobName,
    status: 'completed',
    conclusion,
    started_at: iso(completed + 1),
    completed_at: iso(completed),
    html_url: `https://github.com/JovieInc/Jovie/actions/runs/${row.id}/job/${row.id + 100000}`,
  };
}

function response(body) {
  return { status: 200, json: async () => body };
}

function fetchFixtures(runs, jobsByRun, total = runs.length) {
  const urls = [];
  return {
    urls,
    fetchImpl: async url => {
      urls.push(url);
      const match = url.match(/\/runs\/(\d+)\/attempts\/(\d+)\/jobs/);
      if (!match) return response({ workflow_runs: runs, total_count: total });
      const item = jobsByRun.get(Number(match[1]));
      if (!item) throw new Error(`unexpected jobs read: ${url}`);
      return response('jobs' in item ? item : { jobs: [item], total_count: 1 });
    },
  };
}

describe('automation liveness exact job receipt', () => {
  it('does not let a green throttled run hide the latest failed heartbeat', async () => {
    const skipped = run(45884945943, 3);
    const failed = run(45883090926, 7, 'failure', 2);
    const olderSuccess = run(45881000000, 22);
    const fixture = fetchFixtures(
      [skipped, failed, olderSuccess],
      new Map([
        [skipped.id, job(skipped, 'skipped', 2)],
        [failed.id, job(failed, 'failure', 6)],
        [olderSuccess.id, job(olderSuccess, 'success', 20)],
      ])
    );
    const result = await observeGithubWorkflow(receipt, { ...fixture, nowMs });
    expect(result).toMatchObject({
      lastProofAt: null,
      outcome: 'failed',
      ref: String(failed.id),
      url: job(failed, 'failure').html_url,
    });
    expect(evaluateEntry(entry, result, nowMs)).toMatchObject({
      status: 'missing',
      reason: `heartbeat-job-failure[${failed.id}]`,
    });
    expect(fixture.urls).toHaveLength(3);
    expect(fixture.urls.at(-1)).toContain(`/runs/${failed.id}/attempts/2/jobs`);
  });

  it('retains the actual prior job completion through a legitimate no-op', async () => {
    const skipped = run(12, 2);
    const heartbeat = run(11, 29, 'failure');
    const fixture = fetchFixtures(
      [skipped, heartbeat],
      new Map([
        [skipped.id, job(skipped, 'skipped', 1)],
        [heartbeat.id, job(heartbeat, 'success', 27)],
      ])
    );
    const result = await observeGithubWorkflow(receipt, { ...fixture, nowMs });
    expect(result).toMatchObject({
      lastProofAt: iso(27),
      outcome: 'completed',
    });
    expect(evaluateEntry(entry, result, nowMs)).toMatchObject({
      status: 'fresh',
      ageMinutes: 27,
    });
  });

  it('fails closed on partial pages, different attempts and a capped skip history', async () => {
    const rows = Array.from({ length: 9 }, (_, index) =>
      run(100 - index, 10 + index)
    );
    const skipped = new Map(rows.map(row => [row.id, job(row, 'skipped', 2)]));
    const fixture = fetchFixtures(rows.slice(0, 8), skipped, rows.length);
    const capped = await observeGithubWorkflow(receipt, { ...fixture, nowMs });
    expect(capped).toMatchObject({
      ok: false,
      lastProofAt: null,
      reason: 'heartbeat-job-search-capped',
    });
    expect(fixture.urls).toHaveLength(9);
    const newest = rows[0];
    const ambiguous = [
      { jobs: [job(newest, 'success')], total_count: 101 },
      { ...job(newest, 'success'), run_attempt: 2 },
    ];
    for (const item of ambiguous) {
      const scenario = fetchFixtures([newest], new Map([[newest.id, item]]));
      expect(
        await observeGithubWorkflow(receipt, { ...scenario, nowMs })
      ).toMatchObject({ ok: false });
    }
  });
});

describe('workflow failure streak freshness', () => {
  const streakReceipt = {
    ...receipt,
    workflow: 'production-controller.yml',
    streak: 3,
  };
  const tracked = { ...entry, receipt: streakReceipt, maxStalenessMinutes: 30 };
  const observe = rows =>
    observeWorkflowFailureStreak(streakReceipt, {
      fetchImpl: async () => response({ workflow_runs: rows }),
      nowMs,
    });

  it('keeps stale, empty and inconclusive histories from proving freshness', async () => {
    const old = await observe([
      { ...run(20, 65, 'success'), updated_at: iso(0) },
    ]);
    expect(old.lastProofAt).toBe(iso(65));
    expect(evaluateEntry(tracked, old, nowMs).status).toBe('stale');
    for (const rows of [[], [run(19, 3, 'skipped')], [run(18, 3, 'failure')]]) {
      const result = await observe(rows);
      expect(result.lastProofAt).toBeNull();
      expect(evaluateEntry(tracked, result, nowMs).status).toBe('missing');
    }
    const future = await observe([run(17, 0, 'success')]);
    expect(future).toMatchObject({ ok: false });
  });

  it('reports the newest actual evidence from a broken streak and keeps a proven streak red', async () => {
    const interrupted = await observe([
      run(3, 6, 'failure'),
      run(2, 9, 'success'),
    ]);
    expect(interrupted.lastProofAt).toBe(iso(6));
    expect(evaluateEntry(tracked, interrupted, nowMs).status).toBe('fresh');
    const exposed = await observe([
      run(5, 2, 'failure'),
      run(4, 3, 'skipped'),
      run(3, 6, 'failure'),
      run(2, 9, 'failure'),
      run(1, 12, 'success'),
    ]);
    expect(evaluateEntry(tracked, exposed, nowMs)).toMatchObject({
      status: 'missing',
      reason: '3-consecutive-failures[5,3,2]',
    });
  });
});

describe('registry coverage', () => {
  it('reports a live unmeasured loop as unknown without filing a new alert', () => {
    const entries = [
      { ...entry, status: 'live' },
      {
        id: 'vercel:sample:cron',
        owner: 'web',
        status: 'live',
        receipt: { kind: 'none' },
        gap: 'No readable cron execution receipt',
        purpose: 'Scheduled test loop (default-off)',
        critical: false,
      },
      {
        id: 'gem:sample:tick',
        owner: 'hostops',
        status: 'live',
        receipt: { kind: 'host-local' },
      },
      { id: 'retired:sample', status: 'retired', receipt: { kind: 'none' } },
    ];
    const observations = new Map([
      [entry.id, { ok: true, lastProofAt: iso(1) }],
    ]);
    const report = evaluateLiveness({ entries }, observations, nowMs);
    expect(report.status).toBe('degraded');
    expect(report.results).toHaveLength(1);
    expect(report.results[0].status).toBe('fresh');
    expect(report.unmeasured).toMatchObject([
      {
        id: 'vercel:sample:cron',
        owner: 'web',
        status: 'unknown',
        receipt: 'none',
        gap: 'No readable cron execution receipt',
        purpose: 'Scheduled test loop (default-off)',
      },
      { id: 'gem:sample:tick', status: 'host-local', receipt: 'host-local' },
    ]);
    expect(livenessDecisions(report)).toEqual([]);
    expect(
      evaluateLiveness(
        { entries: [entries[0], entries[2], entries[3]] },
        observations,
        nowMs
      ).status
    ).toBe('healthy');
  });
});
