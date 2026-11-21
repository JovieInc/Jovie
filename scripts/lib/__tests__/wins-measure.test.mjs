import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { load } from 'js-yaml';
import { holds, weeklyMetrics, winStatus } from '../wins-ledger.mjs';
import {
  classifyMetric,
  dueMeasurePlan,
  isNeedsProbeWin,
  isQueryableWin,
  measureDueWins,
  measureGatewayReport,
  measureJsonFile,
  normalizeFeatureTag,
  readJsonPath,
} from '../wins-measure/index.mjs';

const merged = '2026-10-20T00:00:00Z';
const dueNow = Date.parse(merged) + 25 * 3_600_000;

const pending = (over = {}) => ({
  schema: 'jovie.win/v1',
  id: 'win-2026-10-20-sample',
  date: '2026-10-20',
  area: 'ci',
  theme: 'merge-throughput',
  claim: 'Sample pending measure',
  pendingAfter: true,
  prs: [{ repo: 'a/b', number: 1, mergedAt: merged }],
  metrics: [
    {
      name: 'ejection',
      unit: 'rate',
      better: 'lower',
      before: 0.9,
      after: 0.4,
      source: 'docs/metrics/shipping-slo-latest.json#queueEjectionRate',
      query: 'docs/metrics/shipping-slo-latest.json#queueEjectionRate',
    },
  ],
  verifyLink: 'https://example.com/run',
  receipts: [],
  ...over,
});

test('classify: shipping-slo JSON path is queryable; prose source is needs-probe', () => {
  assert.deepEqual(
    classifyMetric({
      source: 'docs/metrics/shipping-slo-latest.json#queueEjectionRate',
      query: 'docs/metrics/shipping-slo-latest.json#queueEjectionRate',
    }),
    {
      adapter: 'json-file',
      file: 'docs/metrics/shipping-slo-latest.json',
      path: 'queueEjectionRate',
    }
  );
  assert.deepEqual(
    classifyMetric({
      source: 'docs/metrics/shipping-slo-latest.json',
      query: 'throughput.mergesPerDay',
    }),
    {
      adapter: 'json-file',
      file: 'docs/metrics/shipping-slo-latest.json',
      path: 'throughput.mergesPerDay',
    }
  );
  assert.equal(
    classifyMetric({
      source: 'playwright pageerror on https://jov.ie/',
      query: 'node playwright goto https://jov.ie/',
    }).adapter,
    'needs-probe'
  );
  assert.deepEqual(
    classifyMetric({
      name: 'golden-path review Gateway requests per 7d',
      unit: 'count',
      source: 'Gateway report feature:golden-path-review',
      query: 'node scripts/ai-gateway-report.mjs',
    }),
    {
      adapter: 'gateway-report',
      feature: 'golden-path-review',
      field: 'requests',
    }
  );
  assert.equal(
    classifyMetric({
      name: 'golden-path review spend per 7d',
      unit: 'usd',
      source: 'Gateway report feature:golden-path-review',
      query: 'node scripts/ai-gateway-report.mjs',
    }).field,
    'costUsd'
  );
});

test('json-file adapter reads a nested numeric field', () => {
  const fixture = {
    throughput: { mergesPerDay: 66.5 },
    queueEjectionRate: 0.42,
  };
  assert.equal(readJsonPath(fixture, 'throughput.mergesPerDay'), 66.5);
  assert.equal(readJsonPath(fixture, 'queueEjectionRate'), 0.42);
  const measured = measureJsonFile(
    { file: 'virtual.json', path: 'queueEjectionRate' },
    { readFile: () => JSON.stringify(fixture) }
  );
  assert.equal(measured.value, 0.42);
  assert.equal(measured.evidence, 'virtual.json#queueEjectionRate');
});

test('gateway-report matches production feature: prefixed tag keys', async () => {
  // sdk.ts tags calls as `feature:<id>`; classify stores the bare name.
  assert.equal(
    normalizeFeatureTag('feature:golden-path-review'),
    'golden-path-review'
  );
  assert.equal(normalizeFeatureTag('golden-path-review'), 'golden-path-review');
  const fetchImpl = /** @type {any} */ (
    async () =>
      new Response(
        JSON.stringify({
          results: [
            {
              tag: 'feature:golden-path-review',
              total_cost: 7,
              request_count: 42,
              input_tokens: 0,
              cached_input_tokens: 0,
            },
            {
              tag: 'feature:other',
              total_cost: 1,
              request_count: 2,
              input_tokens: 0,
              cached_input_tokens: 0,
            },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
  );
  const measured = await measureGatewayReport(
    { feature: 'golden-path-review', field: 'requests' },
    { apiKey: 'test-key', days: 7, fetchImpl }
  );
  assert.equal(measured.value, 42);
  assert.match(measured.evidence, /feature:golden-path-review/);
});

test('measure-due: queryable fixture gets a receipt and becomes verified', async () => {
  const win = pending();
  assert.equal(winStatus(win), 'pending-measure');
  assert.equal(isQueryableWin(win), true);
  const report = await measureDueWins([win], {
    nowMs: dueNow,
    at: '2026-10-21T12:00:00Z',
    measureJson: () => ({
      value: 0.35,
      evidence: 'docs/metrics/shipping-slo-latest.json#queueEjectionRate',
    }),
  });
  assert.equal(report.measured.length, 1);
  assert.equal(report.skipped.length, 0);
  assert.equal(report.errors.length, 0);
  assert.equal(win.receipts.length, 1);
  assert.equal(win.receipts[0].value, 0.35);
  assert.ok(holds(win.metrics[0], 0.35));
  assert.equal(winStatus(win), 'verified');
  assert.equal(report.statuses[win.id], 'verified');
});

test('measure-due: unqueryable due wins are explicit needs-probe skips', async () => {
  const win = pending({
    id: 'win-2026-10-20-probe',
    metrics: [
      {
        name: 'blank flashes',
        unit: 'count',
        better: 'lower',
        before: 1,
        after: 0,
        source: 'golden-path cert walk',
        query: 'ffmpeg signalstats',
      },
    ],
  });
  assert.equal(isNeedsProbeWin(win), true);
  const plan = dueMeasurePlan([win], dueNow);
  assert.deepEqual(plan.queryable, []);
  assert.equal(plan.needsProbe[0].id, win.id);
  const report = await measureDueWins([win], { nowMs: dueNow });
  assert.equal(report.measured.length, 0);
  assert.equal(report.skipped.length, 1);
  assert.equal(report.skipped[0].adapter, 'needs-probe');
  assert.equal(win.receipts.length, 0);
  assert.equal(winStatus(win), 'pending-measure');
});

test('weeklyMetrics splits pending-measure into queryable vs needs-probe', () => {
  const queryable = pending();
  const probe = pending({
    id: 'win-2026-10-20-probe',
    metrics: [
      {
        name: 'x',
        unit: 'count',
        better: 'lower',
        before: 1,
        after: 0,
        source: 'manual outage note',
        query: 'eyeball the dashboard',
      },
    ],
  });
  const m = weeklyMetrics([queryable, probe]);
  assert.equal(m.winsPendingMeasure, 2);
  assert.equal(m.winsPendingMeasureQueryable, 1);
  assert.equal(m.winsNeedsProbe, 1);
});

test('measure-due dry-run does not append receipts', async () => {
  const win = pending();
  const report = await measureDueWins([win], {
    nowMs: dueNow,
    dryRun: true,
    measureJson: () => ({ value: 0.3, evidence: 'e' }),
  });
  assert.equal(report.measured.length, 1);
  assert.equal(win.receipts.length, 0);
  assert.equal(winStatus(win), 'pending-measure');
});

test('measure-due: missing gateway key is a skip, not a hard error', async () => {
  const win = pending({
    id: 'win-2026-10-20-gateway',
    metrics: [
      {
        name: 'requests',
        unit: 'count',
        better: 'lower',
        before: 100,
        after: null,
        source: 'Gateway report feature:golden-path-review',
        query: 'node scripts/ai-gateway-report.mjs',
      },
    ],
  });
  const report = await measureDueWins([win], {
    nowMs: dueNow,
    apiKey: undefined,
    measureGateway: async () => {
      throw new Error('gateway-report: AI_GATEWAY_API_KEY is not set');
    },
  });
  assert.equal(report.errors.length, 0);
  assert.equal(report.measured.length, 0);
  assert.equal(report.skipped[0].adapter, 'gateway-report');
  assert.match(report.skipped[0].reason, /AI_GATEWAY_API_KEY/);
  assert.equal(win.receipts.length, 0);
  assert.equal(winStatus(win), 'pending-measure');
});

test('measure-due: partial queryable failure writes no receipts (stays pending-measure)', async () => {
  const win = pending({
    id: 'win-2026-10-20-multi',
    metrics: [
      {
        name: 'requests',
        unit: 'count',
        better: 'lower',
        before: 100,
        after: 40,
        source: 'Gateway report feature:golden-path-review',
        query: 'node scripts/ai-gateway-report.mjs',
      },
      {
        name: 'spend',
        unit: 'usd',
        better: 'lower',
        before: 3,
        after: 1,
        source: 'Gateway report feature:golden-path-review',
        query: 'node scripts/ai-gateway-report.mjs',
      },
    ],
  });
  let calls = 0;
  const report = await measureDueWins([win], {
    nowMs: dueNow,
    measureGateway: async ({ field }) => {
      calls += 1;
      if (field === 'requests')
        return { value: 40, evidence: 'gateway requests' };
      throw new Error('gateway boom');
    },
  });
  assert.equal(calls, 2);
  assert.equal(report.measured.length, 0);
  assert.equal(report.errors.length, 1);
  assert.match(report.errors[0].reason, /gateway boom/);
  assert.equal(win.receipts.length, 0);
  assert.equal(winStatus(win), 'pending-measure');
});

test('measure-due: all queryable metrics succeed atomically', async () => {
  const win = pending({
    id: 'win-2026-10-20-multi-ok',
    metrics: [
      {
        name: 'requests',
        unit: 'count',
        better: 'lower',
        before: 100,
        after: 40,
        source: 'Gateway report feature:golden-path-review',
        query: 'node scripts/ai-gateway-report.mjs',
      },
      {
        name: 'spend',
        unit: 'usd',
        better: 'lower',
        before: 3,
        after: 1,
        source: 'Gateway report feature:golden-path-review',
        query: 'node scripts/ai-gateway-report.mjs',
      },
    ],
  });
  const report = await measureDueWins([win], {
    nowMs: dueNow,
    at: '2026-10-21T12:00:00Z',
    measureGateway: async ({ field }) =>
      field === 'requests'
        ? { value: 40, evidence: 'gateway requests' }
        : { value: 1, evidence: 'gateway spend' },
  });
  assert.equal(report.measured.length, 2);
  assert.equal(report.errors.length, 0);
  assert.equal(win.receipts.length, 2);
  assert.equal(winStatus(win), 'verified');
});

test('shipping-slo workflow measures due wins before branch checkouts', () => {
  const text = readFileSync(
    join(
      resolve(import.meta.dirname, '../../..'),
      '.github/workflows/shipping-slo.yml'
    ),
    'utf8'
  );
  const doc = /** @type {any} */ (load(text));
  const steps = doc.jobs.measure.steps;
  const names = steps.map(s => s.name ?? '');
  const measureIdx = names.indexOf('Measure due wins into the runtime store');
  const snapshotIdx = names.indexOf('Open latest snapshot PR');
  const ratchetIdx = names.indexOf('Open baseline ratchet PR');
  const slack = steps.find(s => s.name === 'Slack alert on regressions');
  assert.ok(measureIdx > 0, 'measure-due step present');
  assert.ok(measureIdx < snapshotIdx, 'measure-due before snapshot branch');
  assert.ok(measureIdx < ratchetIdx, 'measure-due before ratchet checkout');
  assert.equal(
    steps[measureIdx].continueOnError ?? steps[measureIdx]['continue-on-error'],
    undefined
  );
  assert.match(String(steps[measureIdx].run ?? ''), /\|\| true/);
  assert.match(String(slack?.if ?? ''), /always\(\)/);
  assert.match(steps.map(s => s.run ?? '').join('\n'), /measure-due --store/);
  assert.ok(doc.on.schedule || doc.on.workflow_dispatch);
});
