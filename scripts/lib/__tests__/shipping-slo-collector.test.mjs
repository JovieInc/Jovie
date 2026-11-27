import { describe, expect, it, vi } from 'vitest';

const calls = [];
const now = Date.now();
const iso = minutesAgo => new Date(now - minutesAgo * 60_000).toISOString();

// Mimics the real gh CLI: `--paginate --slurp` with `--jq` is rejected before
// any request, and a streaming `--jq` filter prints NDJSON.
function fakeGh(args) {
  calls.push(args);
  if (args.includes('--slurp') && args.includes('--jq'))
    throw new Error('the `--slurp` option is not supported with `--jq`');
  if (args[0] === 'pr' && args[1] === 'list') {
    const search = args[args.indexOf('--search') + 1];
    if (!search.endsWith(new Date(now).toISOString().slice(0, 10))) return '[]';
    return JSON.stringify([
      {
        number: 7,
        title: 't',
        headRefName: 'codex/jov-7',
        headRefOid: 'h7',
        createdAt: iso(90),
        mergedAt: iso(30),
        mergeCommit: { oid: 'm7' },
      },
    ]);
  }
  const endpoint = args[1] ?? '';
  if (endpoint.endsWith('/issues/7/timeline'))
    return `${JSON.stringify({ type: 'added_to_merge_queue', at: iso(50) })}\n${JSON.stringify({ type: 'merged', at: iso(30) })}\n`;
  if (endpoint.includes('production-controller.yml/runs'))
    return `${JSON.stringify({ id: 11, head_sha: 'm7' })}\n`;
  if (endpoint.includes('/actions/runs/11/jobs'))
    return JSON.stringify([
      {
        jobs: [
          {
            name: 'Production Verified',
            conclusion: 'success',
            completed_at: iso(10),
          },
        ],
      },
    ]);
  if (endpoint.includes('/pulls/7/files'))
    return JSON.stringify([
      [{ filename: 'a.ts', status: 'modified', previous_filename: null }],
    ]);
  return '[]';
}

vi.mock('node:child_process', async importOriginal => ({
  ...(await importOriginal()),
  execFileSync: (_file, args) => fakeGh(args),
}));

const { buildReport, collectRaw, parseGhOutput } = await import(
  '../../shipping-slo-report.mjs'
);

describe('shipping SLO collector against real gh output shapes', () => {
  it('parses NDJSON, never combines --slurp with --jq, and slices merged-PR search', () => {
    const raw = collectRaw({ workflows: ['ci.yml'], days: 12 });
    expect(calls.some(a => a.includes('--slurp') && a.includes('--jq'))).toBe(
      false
    );
    const searches = calls
      .filter(a => a[0] === 'pr' && a[1] === 'list')
      .map(a => a[a.indexOf('--search') + 1]);
    expect(searches.length).toBeGreaterThanOrEqual(3);
    expect(
      searches.every(q => /^merged:\d{4}-\d\d-\d\d\.\.\d{4}-\d\d-\d\d$/.test(q))
    ).toBe(true);
    expect(raw.mergedPrs.map(p => p.number)).toEqual([7]);
    expect(raw.timelines[7].map(e => e.type)).toEqual([
      'added_to_merge_queue',
      'merged',
    ]);
    expect(raw.productionVerifications).toEqual([
      { sha: 'm7', verifiedAt: iso(10) },
    ]);
    expect(raw.mergedPrs[0].files).toEqual([
      { filename: 'a.ts', status: 'modified', previousFilename: null },
    ]);

    const report = buildReport(raw, { schemaVersion: 1, metrics: {} }, { now });
    expect(report.metrics.mergeQueue.wait.n).toBe(1);
    expect(report.metrics.productionLag.lag.n).toBe(1);
  });

  it('parses single documents, NDJSON and empty output', () => {
    expect(parseGhOutput('[1,2]')).toEqual([1, 2]);
    expect(parseGhOutput('{"a":1}\n{"a":2}\n')).toEqual([{ a: 1 }, { a: 2 }]);
    expect(parseGhOutput('  ')).toBeNull();
  });
});

const {
  CI_GATE_TIMING_BASIS,
  checkCiGateSnapshot,
  collectCiGateEvidence,
  summarizeCiGateEvidence,
} = await import('../ci-gate-timing.mjs');

function gateRun(id, event, created = iso(15)) {
  return {
    id,
    event,
    path: `.github/workflows/${event === 'merge_group' ? 'ci' : 'source-validation'}.yml`,
    created_at: created,
    updated_at: iso(0),
    status: 'completed',
    conclusion: 'failure',
    run_attempt: 2,
  };
}

function gateJob(runId, conclusion = 'success') {
  return {
    id: runId + 1000,
    run_id: runId,
    run_attempt: 1,
    name: 'PR Ready',
    status: 'completed',
    conclusion,
    completed_at: iso(8),
  };
}

const gateBaseline = {
  metrics: {
    'ci_walltime.pull_request.p95': { value: 900 },
    'ci_walltime.merge_group.p95': { value: 1200 },
  },
};

describe('canonical CI gate timing', () => {
  it('uses the correct workflow event and first attempt including a page-two gate after which an advisory job failed', async () => {
    const requests = [];
    const runs = {
      pull_request: [
        ...Array.from({ length: 22 }, (_, index) =>
          gateRun(10 + index, 'pull_request')
        ),
        { ...gateRun(99, 'pull_request'), path: '.github/workflows/ci.yml' },
        gateRun(98, 'pull_request', iso(8 * 24 * 60)),
      ],
      merge_group: [
        ...Array.from({ length: 20 }, (_, index) =>
          gateRun(200 + index, 'merge_group')
        ),
        { ...gateRun(220, 'merge_group'), status: 'in_progress' },
      ],
    };
    const receipts = await collectCiGateEvidence(
      runs,
      path => {
        requests.push(path);
        const [, id] = path.match(/\/runs\/(\d+)\/attempts\/1\/jobs/);
        const runId = Number(id);
        const job = gateJob(
          runId,
          runId === 10 ? 'failure' : runId === 11 ? 'cancelled' : 'success'
        );
        if (runId === 220) job.completed_at = iso(-1);
        if (runId === 200) {
          return path.endsWith('page=1')
            ? {
                total_count: 101,
                jobs: Array.from({ length: 100 }, () => ({ name: 'Advisory' })),
              }
            : { total_count: 101, jobs: [job] };
        }
        return { total_count: 1, jobs: [job] };
      },
      { now }
    );
    expect(requests).toHaveLength(44);
    expect(requests).not.toContain(expect.stringMatching(/\/runs\/9[89]\//));
    const report = buildReport({ ciGateEvidence: receipts }, gateBaseline, {
      now,
    });
    expect(report.metrics.ci.pull_request).toMatchObject({
      n: 20,
      sampled: 22,
      p95: 420,
      coverage: 'ready',
      outcomes: { success: 20, failure: 1, cancelled: 1 },
    });
    expect(report.metrics.ci.merge_group).toMatchObject({
      n: 20,
      p95: 420,
      outcomes: { success: 20, unfinished: 1 },
    });
    expect(report.metrics.ci.merge_group.successful).toContainEqual(
      expect.objectContaining({
        runId: 200,
        jobId: 1200,
        attempt: 1,
        listedAttempt: 2,
        latestWorkflowConclusion: 'failure',
      })
    );
    expect(report.gistSlo.ciGateTiming.basis).toBe(CI_GATE_TIMING_BASIS);
    expect(
      checkCiGateSnapshot(report.gistSlo, gateBaseline, now).map(r => r.status)
    ).toEqual(['within SLO', 'within SLO']);
    const regressed = {
      ...gateBaseline,
      metrics: {
        ...gateBaseline.metrics,
        'ci_walltime.merge_group.p95': { value: 300 },
      },
    };
    expect(
      checkCiGateSnapshot(report.gistSlo, regressed, now).map(r => r.status)
    ).toEqual(['within SLO', 'breached']);
    expect(
      checkCiGateSnapshot(
        report.gistSlo,
        gateBaseline,
        now + 31 * 3_600_000
      ).map(r => r.status)
    ).toEqual(['unknown', 'unknown']);
  });

  it('caps the job budget at two pages for thirty runs per cohort', async () => {
    const runs = {
      pull_request: Array.from({ length: 100 }, (_, index) =>
        gateRun(1 + index, 'pull_request')
      ),
      merge_group: Array.from({ length: 100 }, (_, index) =>
        gateRun(200 + index, 'merge_group')
      ),
    };
    let requests = 0;
    const evidence = await collectCiGateEvidence(
      runs,
      path => {
        requests++;
        const [, runId, page] = path.match(
          /\/runs\/(\d+)\/attempts\/1\/jobs.*page=(\d+)$/
        );
        return page === '1'
          ? {
              total_count: 101,
              jobs: Array.from({ length: 100 }, () => ({ name: 'Advisory' })),
            }
          : { total_count: 101, jobs: [gateJob(Number(runId))] };
      },
      { now }
    );
    expect(requests).toBe(120);
    expect(
      Object.values(evidence.cohorts).map(c => c.observations.length)
    ).toEqual([30, 30]);
  });

  it('requires consecutive prior days from the same endpoint contract before tightening', () => {
    const evidence = {
      basis: CI_GATE_TIMING_BASIS,
      collectedAt: iso(0),
      cohorts: {
        pull_request: {
          availableRuns: 20,
          observations: Array.from({ length: 20 }, (_, i) => ({
            runId: i + 1,
            outcome: 'success',
            createdAt: iso(15),
            completedAt: iso(8),
          })),
        },
      },
    };
    const key = 'ci_walltime.pull_request.p95';
    const daily = [
      { date: iso(2 * 24 * 60).slice(0, 10), values: { [key]: 420 } },
      { date: iso(24 * 60).slice(0, 10), values: { [key]: 420 } },
    ];
    const read = (basis, days) =>
      buildReport({ ciGateEvidence: evidence }, gateBaseline, {
        now,
        previousCiGateTiming: { basis, daily: days },
      }).evaluation.tightenCandidates;
    expect(read('workflow-updated-at/v0', daily)).toEqual([]);
    expect(read(CI_GATE_TIMING_BASIS, [daily[0]])).toEqual([]);
    expect(read(CI_GATE_TIMING_BASIS, daily)).toContainEqual(
      expect.objectContaining({ key, observed: 420, heldDays: 3 })
    );
  });

  it('reports missing, unreadable and unfinished gates without a reassuring percentile', async () => {
    const evidence = await collectCiGateEvidence(
      {
        pull_request: [
          gateRun(1, 'pull_request'),
          gateRun(2, 'pull_request'),
          { ...gateRun(3, 'pull_request'), status: 'in_progress' },
          gateRun(4, 'pull_request'),
        ],
      },
      path => {
        if (path.includes('/runs/2/')) throw new Error('read failed');
        if (path.includes('/runs/4/'))
          return { total_count: 2, jobs: [gateJob(4)] };
        return { total_count: 0, jobs: [] };
      },
      { now }
    );
    expect(summarizeCiGateEvidence(evidence, now).pull_request).toMatchObject({
      coverage: 'incomplete',
      p95: null,
      outcomes: { missing: 2, unavailable: 1, unfinished: 1 },
    });
    expect(summarizeCiGateEvidence(evidence, now).merge_group).toMatchObject({
      coverage: 'insufficient',
      p95: null,
      outcomes: {},
    });
    expect(summarizeCiGateEvidence(null, now).pull_request.coverage).toBe(
      'unavailable'
    );
    expect(
      summarizeCiGateEvidence(evidence, now + 27 * 3_600_000).pull_request
        .coverage
    ).toBe('stale');
    expect(
      checkCiGateSnapshot(
        { at: iso(0), ciP95Seconds: { pull_request: 629 } },
        gateBaseline,
        now
      ).map(r => r.status)
    ).toEqual(['unknown', 'unknown']);
  });
});
