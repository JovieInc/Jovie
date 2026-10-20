import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildReport, stageMarkdown } from '../../shipping-slo-report.mjs';
import { collectStageRaw, parseGhOutput } from '../stage-collect.mjs';
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
    { type: 'ready_for_review', at: ago(250) },
    { type: 'added_to_merge_queue', at: ago(200) },
    { type: 'removed_from_merge_queue', at: ago(190) },
    { type: 'added_to_merge_queue', at: ago(150) },
    { type: 'merged', at: ago(100) },
  ],
  commits: [],
  ...overrides,
});

const job = (name, startedAt, completedAt) => ({
  name,
  conclusion: 'SUCCESS',
  startedAt,
  completedAt,
});

describe('stage derivation from receipts', () => {
  const controllers = {
    production: [
      {
        headSha: 'sha7',
        headCommitAt: ago(120),
        url: 'https://github.com/JovieInc/Jovie/actions/runs/1',
        jobs: [
          job('Production Release / Promote to Production', ago(60), ago(40)),
          job('Production Verified', ago(35), ago(30)),
        ],
      },
    ],
    staging: [
      {
        headSha: 'sha7',
        createdAt: ago(95),
        url: 'https://github.com/JovieInc/Jovie/actions/runs/2',
        jobs: [
          job(
            'Staging Release / Canary Health Gate (staging)',
            ago(80),
            ago(78)
          ),
        ],
      },
    ],
  };

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
      linearIssues: {
        'JOV-7': {
          createdAt: ago(1000),
          startedAt: ago(400),
          initialType: 'backlog',
          history: [{ at: ago(800), fromType: 'backlog', toType: 'unstarted' }],
        },
      },
      feeds: {
        lanes: {
          events: [
            event({
              entityId: 'JOV-7',
              stage: 'worker-start',
              enteredAt: ago(390),
              exitedAt: null,
              outcome: 'open',
            }),
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
    const suite = (conclusion, updatedAt) => ({
      conclusion,
      createdAt: updatedAt,
      updatedAt,
      event: 'pull_request',
    });
    const raw = {
      prs: [
        pr(9, {
          timeline: [{ type: 'labeled', at: ago(170), label: 'lane-fix-ci' }],
          commits: [
            {
              oid: 'aaaaaaaaaaaaaaaa',
              committedDate: ago(200),
              rollup: 'FAILURE',
              suites: [suite('FAILURE', ago(180)), suite('SUCCESS', ago(185))],
            },
            {
              oid: 'bbbb',
              committedDate: ago(160),
              rollup: 'SUCCESS',
              suites: [suite('SUCCESS', ago(140)), suite('SUCCESS', ago(130))],
            },
          ],
        }),
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

  it('derives LogYourBody merge → TestFlight and passes summer feed rows through', () => {
    const raw = {
      lyb: {
        runs: [
          {
            headSha: 'l1',
            createdAt: ago(60),
            url: 'u',
            jobs: [
              job(
                'Deploy to TestFlight / Deploy to TestFlight (alpha)',
                ago(20),
                ago(10)
              ),
            ],
          },
          { headSha: 'l2', createdAt: ago(60), url: 'u', jobs: [] },
        ],
      },
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
  it('parses NDJSON from streaming --jq filters', () => {
    expect(parseGhOutput('{"a":1}\n{"a":2}\n')).toEqual([{ a: 1 }, { a: 2 }]);
    expect(parseGhOutput('[1]')).toEqual([1]);
    expect(parseGhOutput('')).toBeNull();
  });

  it('settles every source to data or a recorded failure, never a silent zero', async () => {
    const calls = [];
    const gh = args => {
      calls.push(args);
      if (args[1] === 'graphql') {
        const query = args.find(a => a.startsWith('query=')) ?? '';
        if (query.includes('search('))
          return JSON.stringify({
            data: {
              search: {
                pageInfo: { hasNextPage: false },
                nodes: [
                  {
                    number: 3,
                    title: 'JOV-3',
                    headRefName: 'x',
                    createdAt: ago(9),
                    mergedAt: ago(2),
                    mergeCommit: { oid: 'm3' },
                  },
                ],
              },
            },
          });
        return JSON.stringify({
          data: {
            nodes: [
              {
                checkSuite: {
                  checkRuns: {
                    nodes: [
                      {
                        name: 'Production Verified',
                        conclusion: 'SUCCESS',
                        startedAt: ago(2),
                        completedAt: ago(1),
                      },
                    ],
                  },
                },
              },
            ],
          },
        });
      }
      if (args[1].includes('LogYourBody'))
        throw new Error('HTTP 404: Not Found');
      if (args[1].includes('production-controller'))
        return JSON.stringify([
          {
            id: 1,
            nodeId: 'N1',
            headSha: 'm3',
            conclusion: 'success',
            createdAt: ago(3),
          },
        ]);
      return '[]';
    };
    const fetchImpl = async url => {
      if (url.includes('linear'))
        return {
          ok: true,
          json: async () => ({
            data: {
              issues: {
                nodes: [
                  {
                    identifier: 'JOV-3',
                    createdAt: ago(50),
                    startedAt: ago(20),
                    history: { nodes: [] },
                  },
                ],
              },
            },
          }),
        };
      return { ok: false, status: 404, text: async () => '' };
    };
    const raw = await collectStageRaw({
      gh,
      fetchImpl: /** @type {typeof fetch} */ (
        /** @type {unknown} */ (fetchImpl)
      ),
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
    // Three 3-day search chunks cover 7 days, plus one batched job lookup.
    expect(calls.filter(a => a[1] === 'graphql')).toHaveLength(4);
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
