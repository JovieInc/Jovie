import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { createGbrainClient } from '../gbrain-client.mjs';
import * as metrics from '../gbrain-metrics.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ORCHESTRATOR_DIR = resolve(__dirname, '..');

const PAGE_JSON = JSON.stringify({
  slug: 'agent-org-chart',
  id: 'p1',
  contentHash: 'rev-1',
  compiled_truth: 'implementation owner: Symphony\nverification owner: Gem',
});

function fakeExecute(outputs) {
  const calls = [];
  const execute = async (command, args) => {
    calls.push(args);
    const next = outputs.shift();
    if (next instanceof Error) throw next;
    return next ?? '';
  };
  return { calls, execute };
}

describe('buildLookupRecord', () => {
  it('normalizes hit records with revisions', () => {
    const record = metrics.buildLookupRecord(
      {
        operation: 'get',
        outcome: 'hit',
        source: 'get',
        ms: 12.6,
        target: 'slug-a',
        resultCount: 1,
        revisions: ['rev-1'],
      },
      { now: () => 1_000 }
    );
    assert.deepEqual(record, {
      schema: 'gbrain-retrieval/v1',
      ts: new Date(1_000).toISOString(),
      operation: 'get',
      outcome: 'hit',
      source: 'get',
      ms: 13,
      resultCount: 1,
      target: 'slug-a',
      revisions: ['rev-1'],
      cacheHit: null,
      error: null,
    });
  });

  it('rejects unknown outcomes and negative latency', () => {
    assert.equal(
      metrics.buildLookupRecord({ operation: 'get', outcome: 'maybe', ms: 1 }),
      null
    );
    assert.equal(
      metrics.buildLookupRecord({ operation: 'get', outcome: 'hit', ms: -1 }),
      null
    );
    assert.equal(metrics.buildLookupRecord(null), null);
  });

  it('maps non-string operations to search and keeps explicit cacheHit', () => {
    const record = metrics.buildLookupRecord({
      operation: 'query',
      outcome: 'clean_miss',
      ms: 4,
      cacheHit: false,
    });
    assert.equal(record.operation, 'search');
    assert.equal(record.cacheHit, false);
  });
});

describe('isTimeoutError', () => {
  it('detects timeout shapes including aggregate errors', () => {
    assert.equal(metrics.isTimeoutError({ code: 'ETIMEDOUT' }), true);
    assert.equal(metrics.isTimeoutError({ killed: true }), true);
    assert.equal(metrics.isTimeoutError({ signal: 'SIGTERM' }), true);
    assert.equal(
      metrics.isTimeoutError(
        new AggregateError([{ code: 'ENOENT' }, { killed: true }], 'x')
      ),
      true
    );
    assert.equal(metrics.isTimeoutError({ code: 'ENOENT' }), false);
  });
});

describe('resolveTelemetryFile', () => {
  it('defaults to the runtime dir outside the git tree', () => {
    const file = metrics.resolveTelemetryFile({
      env: { HOME: '/tmp/jovie-home', XDG_CACHE_HOME: '' },
      orchestratorDir: ORCHESTRATOR_DIR,
    });
    assert.equal(file, '/tmp/jovie-home/.cache/jovie/gbrain-retrieval.jsonl');
  });

  it('honors explicit override and off', () => {
    assert.equal(
      metrics.resolveTelemetryFile({
        env: { JOVIE_GBRAIN_TELEMETRY: '/tmp/t.jsonl' },
        orchestratorDir: ORCHESTRATOR_DIR,
      }),
      '/tmp/t.jsonl'
    );
    assert.equal(
      metrics.resolveTelemetryFile({
        env: { JOVIE_GBRAIN_TELEMETRY: 'off' },
        orchestratorDir: ORCHESTRATOR_DIR,
      }),
      null
    );
  });

  it('refuses paths inside the git tree when checked', () => {
    assert.throws(() =>
      metrics.resolveTelemetryFile({
        env: {
          JOVIE_GBRAIN_TELEMETRY: join(ORCHESTRATOR_DIR, 'telemetry.jsonl'),
        },
        orchestratorDir: ORCHESTRATOR_DIR,
      })
    );
  });
});

describe('createTelemetryObserver', () => {
  it('appends normalized JSONL records and stays fail-soft', () => {
    const dir = mkdtempSync(join(tmpdir(), 'gbrain-telemetry-'));
    const file = join(dir, 'retrieval.jsonl');
    const observe = metrics.createTelemetryObserver({
      env: { JOVIE_GBRAIN_TELEMETRY: file },
      now: () => 5_000,
    });
    observe({ operation: 'get', outcome: 'hit', ms: 3, target: 'x' });
    observe({ operation: 'get', outcome: 'bogus', ms: 3 });
    const lines = readFileSync(file, 'utf8').trim().split('\n');
    assert.equal(lines.length, 1);
    const record = JSON.parse(lines[0]);
    assert.equal(record.schema, 'gbrain-retrieval/v1');
    assert.equal(record.ts, new Date(5_000).toISOString());
  });

  it('is a no-op when telemetry is disabled', () => {
    const observe = metrics.createTelemetryObserver({
      env: { JOVIE_GBRAIN_TELEMETRY: 'off' },
    });
    observe({ operation: 'get', outcome: 'hit', ms: 1 });
  });
});

describe('summarizeGbrainRetrieval', () => {
  it('reports explicit unknowns when no records exist', () => {
    const summary = metrics.summarizeGbrainRetrieval([], {
      now: () => 9_000,
    });
    assert.equal(summary.lookups, 0);
    assert.equal(summary.successRate, null);
    assert.equal(summary.latencyMs.p50, null);
    assert.equal(summary.cache.hitRate, null);
    assert.equal(summary.window.oldestTs, null);
  });

  it('computes rates, percentiles, and per-source split', () => {
    const records = [
      {
        schema: 'gbrain-retrieval/v1',
        ts: '2026-09-29T00:00:00Z',
        operation: 'search',
        outcome: 'hit',
        source: 'keyword',
        ms: 10,
        resultCount: 2,
        revisions: ['a'],
      },
      {
        schema: 'gbrain-retrieval/v1',
        ts: '2026-09-29T00:01:00Z',
        operation: 'search',
        outcome: 'clean_miss',
        source: 'semantic',
        ms: 90,
        resultCount: 0,
        revisions: [],
      },
      {
        schema: 'gbrain-retrieval/v1',
        ts: '2026-09-29T00:02:00Z',
        operation: 'get',
        outcome: 'hit',
        source: 'get',
        ms: 20,
        resultCount: 1,
        revisions: ['a', 'b'],
        cacheHit: true,
      },
      {
        schema: 'gbrain-retrieval/v1',
        ts: '2026-09-29T00:03:00Z',
        operation: 'get',
        outcome: 'timeout',
        source: null,
        ms: 5_000,
        resultCount: null,
        error: 'ETIMEDOUT',
        cacheHit: false,
      },
    ];
    const summary = metrics.summarizeGbrainRetrieval(records, {
      now: () => Date.parse('2026-09-29T01:00:00Z'),
    });
    assert.equal(summary.lookups, 4);
    assert.equal(summary.hits, 2);
    assert.equal(summary.cleanMisses, 1);
    assert.equal(summary.timeouts, 1);
    assert.equal(summary.successRate, 0.75);
    assert.equal(summary.cleanMissRate, 0.25);
    assert.equal(summary.errorRate, 0.25);
    assert.equal(summary.latencyMs.p50, 20);
    assert.equal(summary.latencyMs.max, 5_000);
    assert.equal(summary.bySource.keyword.lookups, 1);
    assert.equal(summary.bySource.semantic.cleanMisses, 1);
    assert.equal(summary.bySource.unknown.timeouts, 1);
    assert.equal(summary.cache.observed, 2);
    assert.equal(summary.cache.hitRate, 0.5);
    assert.equal(summary.revisionsObserved, 2);
    assert.equal(summary.window.oldestTs, '2026-09-29T00:00:00.000Z');
  });
});

describe('gbrain client telemetry instrumentation', () => {
  it('emits hit records with source and revision for get and search', async () => {
    const { execute } = fakeExecute([
      '[x] slug-a -- 1.0\n', // keyword search hit
      PAGE_JSON, // page fetch
    ]);
    const observed = [];
    let tick = 0;
    const client = createGbrainClient({
      execute,
      now: () => (tick += 7),
      observe: record => observed.push(record),
    });
    const result = await client.searchPagesWithEvidence('chart', 1);
    assert.equal(result.source, 'keyword');
    assert.equal(result.pages[0].slug, 'agent-org-chart');
    assert.equal(observed.length, 2);
    assert.equal(observed[0].operation, 'search');
    assert.equal(observed[0].outcome, 'hit');
    assert.equal(observed[0].source, 'keyword');
    assert.equal(observed[1].operation, 'get');
    assert.deepEqual(observed[1].revisions, ['rev-1']);
    assert.ok(observed.every(record => record.ms >= 0));
  });

  it('emits clean_miss when keyword search succeeds with no slugs', async () => {
    const { execute } = fakeExecute(['']);
    const observed = [];
    const client = createGbrainClient({
      execute,
      observe: record => observed.push(record),
    });
    const result = await client.searchPagesWithEvidence('nothing', 1, {
      timeoutMs: 100,
    });
    // Empty keyword output falls through to semantic; that also returns empty.
    assert.deepEqual(result.pages, []);
    const search = observed.find(record => record.operation === 'search');
    assert.equal(search.outcome, 'clean_miss');
    assert.equal(search.source, 'semantic');
  });

  it('emits timeout outcome without swallowing the failure', async () => {
    const timeout = Object.assign(new Error('killed'), {
      killed: true,
      signal: 'SIGTERM',
    });
    const { execute } = fakeExecute([timeout, timeout]);
    const observed = [];
    const client = createGbrainClient({
      execute,
      observe: record => observed.push(record),
    });
    await assert.rejects(() =>
      client.searchPagesWithEvidence('q', 1, { timeoutMs: 5_000 })
    );
    const search = observed.find(record => record.operation === 'search');
    assert.equal(search.outcome, 'timeout');
  });

  it('never lets a throwing observer break a lookup', async () => {
    const { execute } = fakeExecute([PAGE_JSON]);
    const client = createGbrainClient({
      execute,
      observe: () => {
        throw new Error('observer exploded');
      },
    });
    const page = await client.getPage('agent-org-chart');
    assert.equal(page.slug, 'agent-org-chart');
  });
});
