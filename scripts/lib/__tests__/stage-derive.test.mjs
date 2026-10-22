import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildReport, stageMarkdown } from '../../shipping-slo-report.mjs';
import {
  attachRedPrSuites,
  collectArtifactFeed,
  collectLinearIssues,
  collectMergedPrs,
  collectStageRaw,
  listWorkflowRuns,
  parseGhOutput,
  sampleEvenly,
} from '../stage-collect.mjs';
import {
  deriveStageEvents,
  linearIdFor,
  releaseGenerations,
} from '../stage-derive.mjs';
import {
  compactStageTimings,
  computeStageTimings,
  STAGE_EVENT_SCHEMA,
} from '../stage-events.mjs';

const REPO_ROOT = resolve(import.meta.dirname, '..', '..', '..');
const MANIFEST = JSON.parse(
  readFileSync(resolve(REPO_ROOT, 'docs/metrics/stage-manifest.json'), 'utf8')
);
const NOW = Date.parse('2026-10-20T12:00:00Z');
const iso = ms => new Date(ms).toISOString();
const ago = minutes => iso(NOW - minutes * 60_000);
const q = value => JSON.stringify(value);
const event = overrides => ({
  schema: STAGE_EVENT_SCHEMA,
  entityType: 'shipping',
  entityId: 'JovieInc/Jovie#1',
  stage: 'queued',
  enteredAt: ago(30),
  exitedAt: ago(10),
  actor: 'codex',
  outcome: 'advanced',
  sourceReceipt: 'https://github.com/JovieInc/Jovie/pull/1',
  ...overrides,
});
const pr = (number, overrides = {}) => ({
  repository: 'JovieInc/Jovie',
  number,
  title: `fix: thing (JOV-${number})`,
  headRefName: `codex/jov-${number}-x`,
  author: 'bot',
  createdAt: ago(300),
  mergedAt: ago(100),
  mergeCommitSha: `sha${number}`,
  timeline: [
    ['ready_for_review', 250],
    ['added_to_merge_queue', 200],
    ['removed_from_merge_queue', 190],
    ['added_to_merge_queue', 150],
    ['merged', 100],
  ].map(([type, minutes]) => ({ type, at: ago(minutes) })),
  commits: [],
  ...overrides,
});
const job = (name, startedAt, completedAt) => ({
  name,
  conclusion: 'SUCCESS',
  startedAt,
  completedAt,
});
const controllers = JSON.parse(
  `{"production":[{"headSha":"sha7","headCommitAt":${q(ago(120))},"url":"https://github.com/JovieInc/Jovie/actions/runs/1","jobs":[${q(job('Production Release / Promote to Production', ago(60), ago(40)))},${q(job('Production Verified', ago(35), ago(30)))}]}],"staging":[{"headSha":"sha7","createdAt":${q(ago(95))},"url":"https://github.com/JovieInc/Jovie/actions/runs/2","jobs":[${q(job('Staging Release / Canary Health Gate (staging)', ago(80), ago(78)))}]}]}`
);
describe('stage derivation from receipts', () => {
  it('joins generations by merge-commit sha, not the earlier merge-group commit time', () => {
    const generations = releaseGenerations(
      controllers,
      new Map([['sha7', ago(90)]])
    );
    expect(generations[0]).toMatchObject({
      headCommitAt: ago(90),
      deployedAt: ago(40),
      verifiedAt: ago(30),
    });
  });
  it('derives the shipping chain from Linear, GitHub and controller receipts', () => {
    const raw = {
      prs: [pr(7, { mergedAt: ago(90) })],
      controllers,
      linearIssues: JSON.parse(
        `{"JOV-7":{"createdAt":${q(ago(1000))},"startedAt":${q(ago(400))},"initialType":"backlog","history":[{"at":${q(ago(800))},"fromType":"backlog","toType":"unstarted"}]}}`
      ),
      feeds: {
        lanes: {
          events: [
            event(
              JSON.parse(
                `{"entityId":"JOV-7","stage":"worker-start","enteredAt":${q(ago(390))},"exitedAt":null,"outcome":"open"}`
              )
            ),
          ],
        },
      },
    };
    const events = deriveStageEvents(raw, MANIFEST).filter(
      e => e.entityType === 'shipping'
    );
    expect(events.map(e => [e.stage, e.enteredAt])).toEqual([
      ['issue', ago(1000)],
      ['eligible', ago(800)],
      ['admitted', ago(400)],
      ['worker-start', ago(390)],
      ['pr-open', ago(300)],
      ['ready', ago(250)],
      ['queued', ago(150)],
      ['merged', ago(90)],
      ['deployed', ago(40)],
      ['verified', ago(30)],
    ]);
    expect(events[0].actor).toBe('codex');
    const release = deriveStageEvents(raw, MANIFEST).filter(
      e => e.entityType === 'release'
    );
    expect(release.map(e => e.stage)).toEqual([
      'staging',
      'canary',
      'prod',
      'verified',
    ]);
    expect(release[2]).toMatchObject({ enteredAt: ago(60), exitedAt: ago(30) });
  });
  it('derives red → classified → green remediation episodes', () => {
    const at = minutes => q(ago(minutes));
    const suite = (conclusion, minutes) =>
      `{"conclusion":${q(conclusion)},"createdAt":${at(minutes)},"updatedAt":${at(minutes)},"event":"pull_request"}`;
    const raw = {
      prs: [
        pr(
          9,
          JSON.parse(
            `{"timeline":[{"type":"labeled","at":${at(170)},"label":"lane-fix-ci"}],"commits":[{"oid":"aaaaaaaaaaaaaaaa","committedDate":${at(200)},"rollup":"FAILURE","suites":[${suite('FAILURE', 180)},${suite('SUCCESS', 185)}]},{"oid":"bbbb","committedDate":${at(160)},"rollup":"SUCCESS","suites":[${suite('SUCCESS', 140)},${suite('SUCCESS', 130)}]}]}`
          )
        ),
      ],
    };
    const events = deriveStageEvents(raw, MANIFEST).filter(
      e => e.entityType === 'remediation'
    );
    expect(
      events.map(e => [e.entityId, e.stage, e.enteredAt, e.exitedAt])
    ).toEqual([
      ['JovieInc/Jovie#9@aaaaaaaaaaaa', 'red', ago(180), ago(170)],
      ['JovieInc/Jovie#9@aaaaaaaaaaaa', 'classified', ago(170), ago(130)],
      ['JovieInc/Jovie#9@aaaaaaaaaaaa', 'green', ago(130), ago(130)],
    ]);
  });
  it('does not time remediation or queue admission from missing or truncated history', () => {
    const raw = {
      prs: [
        pr(8, { timelineTruncated: true }),
        pr(
          9,
          JSON.parse(
            `{"commitsTruncated":true,"commits":[{"oid":"a","committedDate":${q(ago(180))},"rollup":"FAILURE","suites":[]},{"oid":"b","committedDate":${q(ago(130))},"rollup":"SUCCESS","suites":[]}]}`
          )
        ),
      ],
    };
    const truncated = deriveStageEvents(raw, MANIFEST);
    const shipping = truncated.filter(item => item.entityId.endsWith('#8'));
    expect(shipping.map(item => item.stage)).toEqual(
      expect.arrayContaining(['merged'])
    );
    expect(shipping.map(item => item.stage)).not.toContain('queued');
    expect(shipping.map(item => item.stage)).not.toContain('ready');
    expect(truncated.filter(item => item.entityType === 'remediation')).toEqual(
      []
    );
    Object.assign(raw.prs[1], { commitsTruncated: false });
    expect(
      deriveStageEvents(raw, MANIFEST).filter(
        item => item.entityType === 'remediation'
      )
    ).toEqual([]);
  });
  it('derives LogYourBody merge → TestFlight and passes summer feed rows through', () => {
    const raw = {
      ...JSON.parse(
        `{"lyb":{"runs":[{"headSha":"l1","createdAt":${q(ago(60))},"url":"u","jobs":[${q(job('Deploy to TestFlight / Deploy to TestFlight (alpha)', ago(20), ago(10)))}]},{"headSha":"l2","createdAt":${q(ago(60))},"url":"u","jobs":[]}]}}`
      ),
      feeds: {
        summer: {
          events: [
            event({
              entityType: 'summer-turn',
              entityId: 'c1:1',
              stage: 'event',
            }),
          ],
        },
      },
    };
    const events = deriveStageEvents(raw, MANIFEST);
    expect(events.map(e => `${e.entityType}:${e.stage}`)).toEqual([
      'ios-release:merge',
      'ios-release:testflight',
      'summer-turn:event',
    ]);
    expect(
      linearIdFor({ headRefName: 'fix/x', title: 'feat: y [jov-12]' })
    ).toBe('JOV-12');
  });
});
describe('stage collector', () => {
  beforeEach(() => vi.stubEnv('JOVIE_API_STATE', 'memory'));
  afterEach(() => vi.unstubAllEnvs());
  it('parses NDJSON from streaming --jq filters', () => {
    expect(parseGhOutput('{"a":1}\n{"a":2}\n')).toEqual([{ a: 1 }, { a: 2 }]);
    expect(parseGhOutput('[1]')).toEqual([1]);
    expect(parseGhOutput('')).toBeNull();
  });
  it('settles every source to data or a recorded failure, never a silent zero', async () => {
    const calls = [];
    const at = minutes => q(ago(minutes));
    const gh = args => {
      calls.push(args);
      if (args[1] === 'graphql') {
        const query = args.find(a => a.startsWith('query=')) ?? '';
        if (query.includes('search('))
          return `{"data":{"search":{"pageInfo":{"hasNextPage":false},"nodes":[{"number":3,"title":"JOV-3","headRefName":"x","createdAt":${at(9)},"mergedAt":${at(2)},"mergeCommit":{"oid":"m3"}}]}}}`;
        return `{"data":{"nodes":[{"checkSuite":{"checkRuns":{"nodes":[{"name":"Production Verified","conclusion":"SUCCESS","startedAt":${at(2)},"completedAt":${at(1)}}]}}}]}}`;
      }
      if (args[1].includes('LogYourBody'))
        throw new Error('HTTP 404: Not Found');
      if (args[1].includes('production-controller'))
        return `[{"id":1,"nodeId":"N1","title":"Production Controller ${'a'.repeat(40)} from CI 1 attempt 1","headSha":"m3","conclusion":"success","createdAt":${at(3)}}]`;
      return '[]';
    };
    const fetchImpl = async url => {
      if (String(url).includes('linear'))
        return Response.json(
          JSON.parse(
            `{"data":{"issues":{"nodes":[{"identifier":"JOV-3","createdAt":${at(50)},"startedAt":${at(20)},"history":{"nodes":[]}}]}}}`
          )
        );
      return new Response('', { status: 404 });
    };
    const raw = await collectStageRaw({
      gh,
      fetchImpl,
      env: { LINEAR_API_KEY: 'k' },
      manifest: MANIFEST,
      now: NOW,
      days: 7,
    });
    expect(raw.sources['github-pr']).toEqual({ ok: true, n: 1 });
    expect(raw.sources['github-lyb']).toMatchObject({
      ok: false,
      error: 'HTTP 404: Not Found',
    });
    expect(raw.sources['linear-history']).toEqual({ ok: true, n: 1 });
    expect(raw.sources['lanes-stage-feed']).toMatchObject({
      ok: false,
      error: 'HTTP 404',
    });
    expect(raw.sources['revenue-funnel-timings']).toMatchObject({
      ok: false,
      error: 'CRON_SECRET not set',
    });
    expect(raw.controllers.production[0].jobs[0].name).toBe(
      'Production Verified'
    );
    expect(raw.controllers.production[0].headSha).toBe('a'.repeat(40));
    // Three 3-day search chunks cover 7 days, plus one batched job lookup.
    expect(calls.filter(a => a[1] === 'graphql')).toHaveLength(4);
  });
  it('defers a rate-limited Linear read without spending retry budget', async () => {
    const fetchImpl = vi.fn(async () => new Response('', { status: 429 }));
    await expect(
      collectLinearIssues({
        fetchImpl,
        apiKey: 'stage-collector-test',
        identifiers: ['JOV-1'],
      })
    ).rejects.toMatchObject({ exitCode: 75 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
  it('flags truncated PR timelines and commits', () => {
    const failures = [];
    const prs = collectMergedPrs({
      gh: () =>
        `{"data":{"search":{"pageInfo":{"hasNextPage":false},"nodes":[{"number":9,"title":"t","headRefName":"x","createdAt":${q(ago(10))},"mergedAt":${q(ago(1))},"timelineItems":{"pageInfo":{"hasNextPage":true},"nodes":[]},"commits":{"pageInfo":{"hasPreviousPage":true},"nodes":[]}}]}}}`,
      repository: 'JovieInc/Jovie',
      sinceMs: NOW - 86_400_000,
      nowMs: NOW,
      failures,
    });
    expect(prs[0].timelineTruncated).toBe(true);
    expect(prs[0].commitsTruncated).toBe(true);
    expect(failures.join('\n')).toMatch(/timeline truncated/);
    expect(failures.join('\n')).toMatch(/commits truncated/);
  });
  it('keeps merged PRs when one commit-suite batch fails', () => {
    const failures = [];
    const prs = attachRedPrSuites({
      gh: () => {
        throw new Error('HTTP 403 secondary rate limit');
      },
      failures,
      prs: [
        JSON.parse(
          '{"number":4,"commits":[{"id":"C1","oid":"abc","rollup":"FAILURE","suites":[]}]}'
        ),
      ],
    });
    expect(prs).toHaveLength(1);
    expect(prs[0].commits[0].suites).toEqual([]);
    expect(failures[0]).toMatch(/403/);
  });
  it('records invalid timings JSON as a source failure', async () => {
    const gh = args =>
      args[1] === 'graphql'
        ? '{"data":{"search":{"pageInfo":{"hasNextPage":false},"nodes":[]}}}'
        : '[]';
    const raw = await collectStageRaw({
      gh,
      fetchImpl: async () => new Response('not-json', { status: 200 }),
      env: {},
      manifest: JSON.parse(
        '{"sources":{"timings":{"kind":"timings","url":"https://example.test/t"}}}'
      ),
      now: NOW,
      days: 1,
    });
    expect(raw.sources.timings.error).toMatch(/invalid JSON/);
    expect(raw.external).toEqual({});
  });
  it('splits workflow listings into weeks and records a full slice', () => {
    const ranges = [];
    const gh = args => {
      const range = decodeURIComponent(args[1].match(/created=([^&]+)/)[1]);
      ranges.push(range);
      const page = Number(args[1].match(/&page=(\d+)/)[1]);
      if (range.startsWith('2026-10-01') && page <= 10)
        return `[${Array.from({ length: 100 }, (_, index) => `{"id":"${range}-${page}-${index}","createdAt":"2026-10-01T00:00:00Z"}`).join(',')}]`;
      return `[{"id":${q(range)},"createdAt":"2026-10-08T00:00:00Z"}]`;
    };
    const failures = [];
    const runs = listWorkflowRuns({
      gh,
      repository: 'JovieInc/Jovie',
      workflow: 'ios-release-loop.yml',
      sinceMs: Date.parse('2026-10-01T00:00:00Z'),
      nowMs: Date.parse('2026-10-20T12:00:00Z'),
      failures,
    });
    expect(ranges[0]).toBe('2026-10-01..2026-10-07');
    expect(failures[0]).toMatch(/1000-result cap/);
    expect(runs.map(run => run.id)).toEqual(
      expect.arrayContaining([
        '2026-10-08..2026-10-14',
        '2026-10-15..2026-10-20',
      ])
    );
  });
});
describe('shipping SLO integration', () => {
  it('embeds stage timings and the compact summary in the SLO snapshot', () => {
    const baseline = JSON.parse(
      readFileSync(
        resolve(REPO_ROOT, 'docs/metrics/shipping-slo-baseline.json'),
        'utf8'
      )
    );
    const report = buildReport(
      {
        runs: {},
        mergedPrs: [],
        stages: {
          prs: [pr(7)],
          controllers: {},
          sources: { 'github-pr': { ok: true, n: 1 } },
        },
      },
      baseline,
      { now: NOW, stageManifest: MANIFEST }
    );
    expect(report.stageTimings.entities.shipping.stages.queued['24h']).toEqual({
      n: 1,
      p50: 3000,
      p95: 3000,
    });
    expect(stageMarkdown(report.stageTimings).join('\n')).toContain(
      '| shipping:queued | derived | 1 | 50m | 50m | 1 |'
    );
    expect(report.gistSlo.stages).toMatchObject({
      schema: 'jovie-stage-summary/v1',
      regressions: [],
    });
    const without = buildReport({ runs: {}, mergedPrs: [] }, baseline, {
      now: NOW,
    });
    expect(without.stageTimings).toBeNull();
    expect(without.gistSlo.stages).toBeUndefined();
  });
  it('replaces tighten candidates when stage lag overrides the legacy value', () => {
    const mergedAt = ago(100);
    const baseline = JSON.parse(
      '{"schemaVersion":1,"thresholds":{"improvementFraction":0.1,"improvementHoldDays":3,"regressionFraction":0.2},"metrics":{"production_lag.merged_to_verified.p95":{"value":1000,"unit":"seconds","direction":"lower"}},"history":[{"date":"2026-10-18","values":{"production_lag.merged_to_verified.p95":80}},{"date":"2026-10-19","values":{"production_lag.merged_to_verified.p95":70}}]}'
    );
    const report = buildReport(
      {
        runs: {},
        mergedPrs: [
          JSON.parse(
            `{"number":7,"title":"x","headRefName":"codex/jov-7-x","createdAt":${q(ago(300))},"mergedAt":${q(mergedAt)},"mergeCommitSha":"sha7"}`
          ),
        ],
        productionVerifications: [
          {
            sha: 'sha7',
            verifiedAt: new Date(Date.parse(mergedAt) + 60_000).toISOString(),
          },
        ],
        stages: {
          prs: [pr(7)],
          controllers,
          sources: { 'github-pr': { ok: true, n: 1 } },
        },
      },
      baseline,
      { now: NOW, stageManifest: MANIFEST }
    );
    expect(
      report.flat['production_lag.merged_to_verified.p95']
    ).toBeGreaterThan(1000);
    expect(
      report.evaluation.tightenCandidates.map(item => item.key)
    ).not.toContain('production_lag.merged_to_verified.p95');
    expect(report.evaluation.regressions.map(item => item.key)).toContain(
      'production_lag.merged_to_verified.p95'
    );
  });
});
describe('committed stage-timings snapshot', () => {
  it('packs windows as [n, p50, p95] and regressions as primitive arrays', () => {
    const t = computeStageTimings(
      [event({ enteredAt: ago(30), exitedAt: ago(10) })],
      MANIFEST,
      { now: NOW }
    );
    const compact = compactStageTimings(t);
    expect(compact.entities.shipping.stages.queued).toMatchObject({
      status: 'derived',
      '24h': [1, 1200, 1200],
      '28d': [1, 1200, 1200],
      regression: [false, null, 1200, null, 1, 0],
    });
    expect(compact.entities.shipping.stages.verified).toMatchObject({
      terminal: true,
      regression: null,
    });
    expect(compact.windowFormat).toEqual(['n', 'p50', 'p95']);
  });
});

describe('artifact stage sources', () => {
  const runRow = (id, minutesAgo, stage = 'started') =>
    JSON.stringify({
      schema: 'jovie-stage-event/v1',
      entityType: 'automation-run',
      entityId: `github:jovie:x@${id}`,
      stage,
      enteredAt: ago(minutesAgo + 1),
      exitedAt: ago(minutesAgo),
      actor: null,
      outcome: stage === 'finished' ? 'completed' : 'advanced',
      sourceReceipt: `run ${id}`,
    });
  const listing = rows => args =>
    args[0] === 'api' && args[1].includes('/actions/artifacts?name=')
      ? rows.map(r => JSON.stringify(r)).join('\n')
      : '[]';

  it('reads every artifact in the window, dedupes repeats and skips expired ones', () => {
    const files = {
      11: [runRow(1, 30), runRow(1, 29, 'finished')].join('\n'),
      12: [runRow(1, 30), runRow(1, 29, 'finished'), runRow(2, 5)].join('\n'),
    };
    const read = [];
    const feed = collectArtifactFeed({
      gh: listing([
        { id: 2, created_at: ago(4), expired: false, run: 12 },
        { id: 1, created_at: ago(28), expired: false, run: 11 },
        { id: 0, created_at: ago(40), expired: true, run: 10 },
        { id: 9, created_at: ago(40 * 24 * 60), expired: false, run: 9 },
      ]),
      readArtifact: ({ run, name, file }) => {
        read.push([run, name, file]);
        return files[run];
      },
      repository: 'JovieInc/Jovie',
      artifact: 'automation-liveness-receipts/stage-events.ndjson',
      manifest: MANIFEST,
      sinceMs: NOW - 29 * 86_400_000,
    });
    expect(read).toEqual([
      [12, 'automation-liveness-receipts', 'stage-events.ndjson'],
      [11, 'automation-liveness-receipts', 'stage-events.ndjson'],
    ]);
    expect(feed.events.map(e => `${e.entityId}:${e.stage}`).sort()).toEqual([
      'github:jovie:x@1:finished',
      'github:jovie:x@1:started',
      'github:jovie:x@2:started',
    ]);
    expect(feed.artifacts).toEqual({ listed: 2, sampled: 2, read: 2 });
  });

  it('samples evenly and keeps the newest and oldest artifacts', () => {
    const items = Array.from({ length: 1000 }, (_, i) => i);
    const picked = sampleEvenly(items, 120);
    expect(picked).toHaveLength(120);
    expect(picked[0]).toBe(0);
    expect(picked.at(-1)).toBe(999);
  });

  it('is a source failure, not an empty success, when no artifact can be read', async () => {
    const gh = args =>
      args[1] === 'graphql'
        ? '{"data":{"search":{"pageInfo":{"hasNextPage":false},"nodes":[]}}}'
        : args[1]?.includes('/actions/artifacts?name=')
          ? JSON.stringify({
              id: 1,
              created_at: ago(5),
              expired: false,
              run: 7,
            })
          : '[]';
    const raw = await collectStageRaw({
      gh,
      fetchImpl: async () => new Response('', { status: 404 }),
      env: {},
      manifest: MANIFEST,
      now: NOW,
      days: 7,
      readArtifact: () => {
        throw new Error('HTTP 410 artifact expired');
      },
    });
    expect(raw.sources['automation-liveness-receipts']).toMatchObject({
      ok: false,
      error: expect.stringMatching(/no artifact readable.*410/),
    });
  });

  it('feeds artifact rows into stage timings', async () => {
    const gh = args =>
      args[1] === 'graphql'
        ? '{"data":{"search":{"pageInfo":{"hasNextPage":false},"nodes":[]}}}'
        : args[1]?.includes('name=automation-liveness-receipts')
          ? JSON.stringify({
              id: 1,
              created_at: ago(5),
              expired: false,
              run: 7,
            })
          : '[]';
    const raw = await collectStageRaw({
      gh,
      fetchImpl: async () => new Response('', { status: 404 }),
      env: {},
      manifest: MANIFEST,
      now: NOW,
      days: 7,
      readArtifact: () => [runRow(1, 30), runRow(1, 20, 'finished')].join('\n'),
    });
    expect(raw.sources['automation-liveness-receipts']).toMatchObject({
      ok: true,
      n: 2,
      artifacts: { listed: 1, sampled: 1, read: 1 },
    });
    expect(raw.sources['release-replay-receipts']).toMatchObject({
      ok: true,
      n: 0,
    });
    const timings = computeStageTimings(
      deriveStageEvents(raw, MANIFEST),
      MANIFEST,
      { now: NOW }
    );
    expect(timings.entities['automation-run'].stages.started['24h'].n).toBe(1);
    expect(
      timings.entities['automation-run'].endToEnd['started->finished']['24h'].n
    ).toBe(1);
  });
});
