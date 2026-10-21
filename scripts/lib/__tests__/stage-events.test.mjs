import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkStageManifest } from '../../stage-manifest-check.mjs';
import {
  buildStageSummary,
  chainStages,
  computeStageTimings,
  parseStageEventFeed,
  regressionFlag,
  STAGE_EVENT_SCHEMA,
  validateStageEvent,
  validateStageManifest,
} from '../stage-events.mjs';

const REPO_ROOT = resolve(import.meta.dirname, '..', '..', '..');
const MANIFEST = JSON.parse(
  readFileSync(resolve(REPO_ROOT, 'docs/metrics/stage-manifest.json'), 'utf8')
);
const NOW = Date.parse('2026-10-20T12:00:00Z');
const iso = ms => new Date(ms).toISOString();
const ago = minutes => iso(NOW - minutes * 60_000);
const clone = value => JSON.parse(JSON.stringify(value));

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

describe('stage manifest', () => {
  it('accepts the committed manifest and registers every delivery workflow', () => {
    expect(validateStageManifest(MANIFEST)).toEqual({ ok: true, errors: [] });
    expect(checkStageManifest({ repoRoot: REPO_ROOT })).toEqual([]);
  });

  it('rejects unregistered sources, owner-less spec stages and unordered pairs', () => {
    const broken = clone(MANIFEST);
    broken.entities.shipping.stages[0].source = 'nowhere';
    delete broken.entities['summer-turn'].stages[0].owner;
    broken.entities.release.endToEnd = [['verified', 'staging']];
    broken.producers.workflows['ci.yml'] = ['shipping:typo'];
    const { ok, errors } = validateStageManifest(broken);
    expect(ok).toBe(false);
    expect(errors).toEqual(
      expect.arrayContaining([
        'shipping.issue: source "nowhere" is not registered',
        'summer-turn.event: spec stages name an owner',
        'release: endToEnd ["verified","staging"] is not ordered',
        'producers.workflows.ci.yml: unknown stage shipping:typo',
      ])
    );
  });

  it('fails CI for a new delivery workflow that is not registered', () => {
    const root = mkdtempSync(join(tmpdir(), 'stage-manifest-'));
    mkdirSync(join(root, '.github/workflows'), { recursive: true });
    for (const file of Object.keys({
      ...MANIFEST.producers.workflows,
      ...MANIFEST.producers.exempt,
    }))
      writeFileSync(join(root, '.github/workflows', file), 'name: x\n');
    writeFileSync(join(root, '.github/workflows/web-deploy.yml'), 'name: x\n');
    writeFileSync(join(root, '.github/workflows/lint.yml'), 'name: x\n');
    expect(checkStageManifest({ repoRoot: root, manifest: MANIFEST })).toEqual([
      '.github/workflows/web-deploy.yml: delivery workflow is not registered in docs/metrics/stage-manifest.json producers (add its stages, or an exempt reason)',
    ]);
  });
});

describe('stage event contract', () => {
  it('validates fields, registered stages and time order', () => {
    expect(validateStageEvent(event({}), MANIFEST)).toEqual([]);
    expect(
      validateStageEvent(
        event({
          stage: 'shipped',
          exitedAt: ago(40),
          outcome: 'done',
          sourceReceipt: '',
        }),
        MANIFEST
      )
    ).toEqual([
      'unknown stage shipping:shipped',
      'exitedAt precedes enteredAt',
      'outcome must be one of advanced,completed,failed,abandoned,open',
      'sourceReceipt must name the evidence',
    ]);
  });

  it('parses NDJSON feeds and counts rejected rows instead of dropping them silently', () => {
    const text = [
      JSON.stringify(event({})),
      '{not json',
      JSON.stringify(event({ entityType: 'unknown' })),
      '',
    ].join('\n');
    const parsed = parseStageEventFeed(text, MANIFEST);
    expect(parsed.events).toHaveLength(1);
    expect(parsed.rejected.map(r => r.line)).toEqual([2, 3]);
  });

  it('chains observed stages, skips unobserved ones and clamps inversions', () => {
    const events = chainStages(
      'shipping',
      'JovieInc/Jovie#2',
      [
        { stage: 'merged', at: ago(10), sourceReceipt: 'r' },
        { stage: 'pr-open', at: ago(100), sourceReceipt: 'r' },
        { stage: 'queued', at: ago(5), sourceReceipt: 'r' },
        { stage: 'verified', at: ago(1), sourceReceipt: 'r' },
      ],
      MANIFEST,
      { actor: 'codex' }
    );
    expect(events.map(e => [e.stage, e.outcome])).toEqual([
      ['pr-open', 'advanced'],
      ['queued', 'advanced'],
      ['merged', 'advanced'],
      ['verified', 'completed'],
    ]);
    // queued (5m ago) → merged (10m ago) is inverted: dwell clamps to zero.
    expect(events[1].exitedAt).toBe(events[1].enteredAt);
    expect(
      events.every(e => validateStageEvent(e, MANIFEST).length === 0)
    ).toBe(true);
    const open = chainStages(
      'shipping',
      'x',
      [{ stage: 'ready', at: ago(3), sourceReceipt: 'r' }],
      MANIFEST
    );
    expect(open[0]).toMatchObject({ outcome: 'open', exitedAt: null });
  });
});

describe('stage timings', () => {
  const dwell = (stage, minutesAgo, seconds, id) =>
    event({
      stage,
      entityId: id,
      enteredAt: iso(NOW - minutesAgo * 60_000 - seconds * 1000),
      exitedAt: ago(minutesAgo),
    });

  it('computes p50/p95/n per window and arrivals for terminal stages', () => {
    const events = [
      dwell('queued', 60, 100, 'a'),
      dwell('queued', 3 * 1440, 300, 'b'),
      dwell('queued', 20 * 1440, 900, 'c'),
      event({
        stage: 'verified',
        entityId: 'a',
        enteredAt: ago(30),
        exitedAt: ago(30),
        outcome: 'completed',
      }),
    ];
    const t = computeStageTimings(events, MANIFEST, { now: NOW });
    const queued = t.entities.shipping.stages.queued;
    expect(queued['24h']).toEqual({ n: 1, p50: 100, p95: 100 });
    expect(queued['7d']).toEqual({ n: 2, p50: 100, p95: 300 });
    expect(queued['28d']).toEqual({ n: 3, p50: 300, p95: 900 });
    expect(t.entities.shipping.stages.verified).toMatchObject({
      terminal: true,
      '24h': { n: 1, p50: null, p95: null, failed: 0, failRate: 0 },
      regression: null,
    });
    expect(t.coverage).toEqual({
      stagesTotal: 33,
      stagesWithData: 2,
      events: 4,
    });
  });

  it('reports failures and the failure rate on terminal stages', () => {
    const outcome = (id, outcome) =>
      event({
        entityType: 'summer-turn',
        stage: 'outcome',
        entityId: id,
        enteredAt: ago(30),
        exitedAt: ago(30),
        outcome,
      });
    const t = computeStageTimings(
      [
        outcome('a', 'failed'),
        outcome('b', 'failed'),
        outcome('c', 'completed'),
        outcome('d', 'failed'),
      ],
      MANIFEST,
      { now: NOW }
    );
    expect(t.entities['summer-turn'].stages.outcome['24h']).toEqual({
      n: 4,
      p50: null,
      p95: null,
      failed: 3,
      failRate: 0.75,
    });
  });

  it('flags a p95 regression only beyond noise', () => {
    const rule = MANIFEST.regression;
    const samples = [
      ...Array.from({ length: 25 }, (_, i) => ({
        at: NOW - (10 + (i % 15)) * 86_400_000,
        value: 600,
      })),
      ...Array.from({ length: 12 }, (_, i) => ({
        at: NOW - (i % 6) * 86_400_000 - 1000,
        value: 1200,
      })),
    ];
    expect(regressionFlag(samples, NOW, rule)).toMatchObject({
      regressed: true,
      recentP95: 1200,
      baselineP95: 600,
      ratio: 2,
    });
    // Too few recent samples: no flag however bad.
    expect(regressionFlag(samples.slice(0, 30), NOW, rule).regressed).toBe(
      false
    );
    // Doubling a 20s stage is below the absolute floor.
    const tiny = samples.map(s => ({ ...s, value: s.value / 30 }));
    expect(regressionFlag(tiny, NOW, rule).regressed).toBe(false);
  });

  it('uses privacy-bound pre-aggregated timings and summarises the slowest stages', () => {
    const windows = {
      '24h': { n: 4, p50: 60, p95: 90 },
      '7d': { n: 30, p50: 80, p95: 400 },
      '28d': { n: 90, p50: 70, p95: 300 },
    };
    const t = computeStageTimings([dwell('queued', 60, 100, 'a')], MANIFEST, {
      now: NOW,
      external: {
        'revenue-funnel': {
          stages: { signup: { windows, regression: null } },
          endToEnd: {},
        },
      },
    });
    expect(t.entities['revenue-funnel'].stages.signup['7d']).toEqual(
      windows['7d']
    );
    const summary = buildStageSummary(t);
    expect(summary.slowestP95_7d.map(s => s.stage)).toEqual([
      'revenue-funnel:signup',
      'shipping:queued',
    ]);
    expect(summary.endToEnd7d['shipping:pr-open->merged']).toEqual({
      n: 0,
      p50: null,
      p95: null,
    });
  });
});
