#!/usr/bin/env node

/**
 * Receipt-derived flow timing for the delivery controller.
 *
 * The report reads the controller's immutable receipt files and writes only a
 * local summary. It neither fills historical gaps nor changes Linear, GitHub,
 * queue, CI, deployment, or resource settings.
 */

import { mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

import { DELIVERY_RECEIPT_SCHEMA } from './delivery-state-machine.mjs';

export const FLOW_METRICS_SCHEMA = 'jovie-delivery-flow-metrics/v1';
export const MIN_PERCENTILE_SAMPLE_SIZE = 5;
export const SUMMARY_STALE_MS = 2 * 60 * 60 * 1000;

const STAGE_TIMESTAMPS = Object.freeze({
  ready: 'readyAt',
  classified: 'readyAt',
  leased: 'admittedAt',
  'draft-pr': 'prOpenedAt',
  'ci-pending': 'ciStartedAt',
  'ci-green': 'ciGreenAt',
  queued: 'queuedAt',
  merged: 'mergedAt',
  'production-proven': 'productionProvenAt',
});

const WAITING_STAGES = new Set([
  'ready',
  'classified',
  'leased',
  'draft-pr',
  'ci-pending',
  'ci-green',
  'queue-pending',
  'queued',
  'deployment-pending',
]);

function validTime(value) {
  const parsed = typeof value === 'string' ? Date.parse(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function medianPercentile(sorted, ratio) {
  const index = Math.ceil(sorted.length * ratio) - 1;
  return sorted[Math.max(0, Math.min(sorted.length - 1, index))];
}

function percentile(values) {
  const sorted = [...values].sort((left, right) => left - right);
  if (sorted.length < MIN_PERCENTILE_SAMPLE_SIZE) {
    return {
      status: 'insufficient-sample',
      sampleSize: sorted.length,
      minimumSampleSize: MIN_PERCENTILE_SAMPLE_SIZE,
      p50Ms: null,
      p95Ms: null,
    };
  }
  return {
    status: 'available',
    sampleSize: sorted.length,
    minimumSampleSize: MIN_PERCENTILE_SAMPLE_SIZE,
    p50Ms: medianPercentile(sorted, 0.5),
    p95Ms: medianPercentile(sorted, 0.95),
  };
}

function workKey(receipt) {
  const event = receipt.event || {};
  if (event.issue) return `issue:${event.issue}`;
  if (event.pr && event.headSha) return `pr:${event.pr}:${event.headSha}`;
  return `delivery:${event.deliveryKey || receipt.receiptKey}`;
}

function uniqueReceipts(receipts) {
  const seen = new Set();
  return receipts
    .filter(receipt => receipt?.schema === DELIVERY_RECEIPT_SCHEMA)
    .filter(receipt => {
      if (
        typeof receipt.receiptKey !== 'string' ||
        seen.has(receipt.receiptKey)
      )
        return false;
      seen.add(receipt.receiptKey);
      return validTime(receipt.observedAt) !== null;
    })
    .sort(
      (left, right) =>
        Date.parse(left.observedAt) - Date.parse(right.observedAt)
    );
}

function timelines(receipts) {
  const grouped = new Map();
  for (const receipt of uniqueReceipts(receipts)) {
    const key = workKey(receipt);
    const current = grouped.get(key) || [];
    current.push(receipt);
    grouped.set(key, current);
  }
  return [...grouped.entries()].map(([key, entries]) => {
    const timestamps = {};
    for (const receipt of entries) {
      const field = STAGE_TIMESTAMPS[receipt.stage];
      if (field && timestamps[field] === undefined)
        timestamps[field] = receipt.observedAt;
    }
    return { key, entries, timestamps, latest: entries.at(-1) };
  });
}

function duration(timeline, start, end) {
  const from = validTime(timeline.timestamps[start]);
  const to = validTime(timeline.timestamps[end]);
  return from !== null && to !== null && to >= from ? to - from : null;
}

function stagePercentiles(allTimelines) {
  const pairs = {
    readyToAdmitted: ['readyAt', 'admittedAt'],
    admittedToPrOpen: ['admittedAt', 'prOpenedAt'],
    prOpenToCiStart: ['prOpenedAt', 'ciStartedAt'],
    ciStartToGreen: ['ciStartedAt', 'ciGreenAt'],
    greenToQueueAdmission: ['ciGreenAt', 'queuedAt'],
    queueToMerge: ['queuedAt', 'mergedAt'],
    mergeToProductionProof: ['mergedAt', 'productionProvenAt'],
    readyToProduction: ['readyAt', 'productionProvenAt'],
  };
  return Object.fromEntries(
    Object.entries(pairs).map(([name, [start, end]]) => {
      const values = allTimelines
        .map(timeline => duration(timeline, start, end))
        .filter(value => value !== null);
      return [name, percentile(values)];
    })
  );
}

function activeWaiting(timelines, now) {
  const waiting = timelines
    .filter(timeline => WAITING_STAGES.has(timeline.latest.stage))
    .map(timeline => ({
      key: timeline.key,
      stage: timeline.latest.stage,
      ageMs: Math.max(
        0,
        Date.parse(now) - Date.parse(timeline.latest.observedAt)
      ),
    }));
  const oldestByStage = Object.fromEntries(
    [...new Set(waiting.map(item => item.stage))].map(stage => {
      const oldest = waiting
        .filter(item => item.stage === stage)
        .sort((left, right) => right.ageMs - left.ageMs)[0];
      return [stage, oldest];
    })
  );
  return { waiting, oldestByStage };
}

function bottleneck(waiting, resources) {
  const constraint =
    typeof resources?.constraint === 'string' ? resources.constraint : null;
  if (resources?.saturated === true || resources?.creditsAvailable === false) {
    return {
      kind: constraint || 'resource-or-model-credit',
      evidence: 'resource-receipt',
    };
  }
  const oldest = [...waiting].sort(
    (left, right) => right.ageMs - left.ageMs
  )[0];
  if (!oldest)
    return {
      kind: 'insufficient-instrumentation',
      evidence: 'no-active-receipt',
    };
  const kind =
    oldest.stage === 'queued' || oldest.stage === 'queue-pending'
      ? 'queue'
      : oldest.stage === 'ci-pending' || oldest.stage === 'ci-green'
        ? 'ci'
        : oldest.stage === 'deployment-pending'
          ? 'deployment'
          : 'implementation-or-readiness';
  return { kind, evidence: `${oldest.key}:${oldest.stage}:${oldest.ageMs}ms` };
}

function throughput(timelines, since, now) {
  return timelines.filter(timeline => {
    const provedAt = validTime(timeline.timestamps.productionProvenAt);
    return (
      provedAt !== null &&
      provedAt >= Date.parse(since) &&
      provedAt <= Date.parse(now)
    );
  }).length;
}

/** Calculate only from supplied receipts. No absent stage is inferred. */
export function buildFlowMetrics(
  receipts = [],
  { now = new Date().toISOString(), resources = {} } = {}
) {
  const allTimelines = timelines(receipts);
  const { waiting, oldestByStage } = activeWaiting(allTimelines, now);
  const latestReceipts = allTimelines.map(timeline => timeline.latest);
  const failures = latestReceipts.filter(
    receipt => receipt.stage === 'repair-pending'
  ).length;
  const retries = uniqueReceipts(receipts).filter(receipt =>
    /retry|reconcile/i.test(receipt.transition?.event || '')
  ).length;
  return {
    schema: FLOW_METRICS_SCHEMA,
    observedAt: now,
    source: {
      receipts: uniqueReceipts(receipts).length,
      workItems: allTimelines.length,
    },
    throughput: {
      currentHour: throughput(
        allTimelines,
        new Date(Date.parse(now) - 60 * 60 * 1000).toISOString(),
        now
      ),
      rollingDay: throughput(
        allTimelines,
        new Date(Date.parse(now) - 24 * 60 * 60 * 1000).toISOString(),
        now
      ),
      rollingWeek: throughput(
        allTimelines,
        new Date(Date.parse(now) - 7 * 24 * 60 * 60 * 1000).toISOString(),
        now
      ),
      exactProductionProofCount: allTimelines.filter(
        timeline => timeline.timestamps.productionProvenAt
      ).length,
    },
    stageTiming: stagePercentiles(allTimelines),
    activeLaneCount: latestReceipts.filter(receipt =>
      ['leased', 'draft-pr', 'ci-pending', 'ci-green'].includes(receipt.stage)
    ).length,
    readyWorkDepth: latestReceipts.filter(receipt =>
      ['ready', 'classified'].includes(receipt.stage)
    ).length,
    waiting: { oldestByStage, count: waiting.length },
    failureRetry: {
      failures,
      retries,
      failureRate: latestReceipts.length
        ? failures / latestReceipts.length
        : null,
      retryRate: uniqueReceipts(receipts).length
        ? retries / uniqueReceipts(receipts).length
        : null,
    },
    resources: {
      saturated: resources?.saturated === true,
      creditsAvailable: resources?.creditsAvailable !== false,
      constraint: resources?.constraint || null,
    },
    bottleneck: bottleneck(waiting, resources),
    externalMutations: 0,
  };
}

/** Shared deterministic query core for the operations CLI and local API. */
export function queryDeliveryFlow(
  receipts = [],
  {
    query = 'status',
    issue = null,
    now = new Date().toISOString(),
    resources = {},
  } = {}
) {
  const metrics = buildFlowMetrics(receipts, { now, resources });
  switch (query) {
    case 'status':
      return {
        schema: FLOW_METRICS_SCHEMA,
        observedAt: metrics.observedAt,
        throughput: metrics.throughput,
        activeLaneCount: metrics.activeLaneCount,
        readyWorkDepth: metrics.readyWorkDepth,
        bottleneck: metrics.bottleneck,
        resources: metrics.resources,
      };
    case 'throughput':
      return metrics.throughput;
    case 'bottlenecks':
      return { bottleneck: metrics.bottleneck, waiting: metrics.waiting };
    case 'percentiles':
    case 'sample-sufficiency':
      return metrics.stageTiming;
    case 'resources':
      return metrics.resources;
    case 'issue-timeline': {
      if (typeof issue !== 'string' || !issue.trim()) {
        throw new Error(
          'issue-timeline query requires --issue=<Linear identifier>'
        );
      }
      const timeline = timelines(receipts).find(
        candidate => candidate.key === `issue:${issue.trim()}`
      );
      return timeline
        ? {
            issue: issue.trim(),
            timestamps: timeline.timestamps,
            latestStage: timeline.latest.stage,
            receipts: timeline.entries.map(receipt => ({
              receiptKey: receipt.receiptKey,
              stage: receipt.stage,
              observedAt: receipt.observedAt,
            })),
          }
        : { issue: issue.trim(), status: 'unavailable', reason: 'no-receipts' };
    }
    default:
      throw new Error(`unsupported flow query: ${query}`);
  }
}

export function renderFlowMetricsMarkdown(metrics) {
  const timing = Object.entries(metrics.stageTiming)
    .map(
      ([name, value]) =>
        `| ${name} | ${value.status} | ${value.sampleSize}/${value.minimumSampleSize} | ${value.p50Ms ?? '—'} | ${value.p95Ms ?? '—'} |`
    )
    .join('\n');
  return `# Delivery flow summary\n\nObserved: ${metrics.observedAt}\n\n- Throughput (hour/day/week): ${metrics.throughput.currentHour}/${metrics.throughput.rollingDay}/${metrics.throughput.rollingWeek}\n- Exact production proofs: ${metrics.throughput.exactProductionProofCount}\n- Active lanes / ready depth: ${metrics.activeLaneCount}/${metrics.readyWorkDepth}\n- Bottleneck: ${metrics.bottleneck.kind} (${metrics.bottleneck.evidence})\n- Failure/retry: ${metrics.failureRetry.failures}/${metrics.failureRetry.retries}\n- Resource constraint: ${metrics.resources.constraint ?? 'none reported'}\n\n| Stage | Status | Sample | P50 ms | P95 ms |\n| --- | --- | --- | ---: | ---: |\n${timing}\n`;
}

async function readReceipts(directory) {
  try {
    const names = await readdir(directory);
    return Promise.all(
      names
        .filter(name => name.endsWith('.json'))
        .map(async name => {
          try {
            return JSON.parse(await readFile(join(directory, name), 'utf8'));
          } catch {
            return null;
          }
        })
    );
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }
}

async function writeAtomic(path, contents) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.tmp`;
  await writeFile(temporary, contents, { mode: 0o600 });
  await rename(temporary, path);
}

async function main() {
  const stateDir = resolve(
    process.env.GEM_WORKSPACE || '/home/timwhite/gem-workspace',
    'state/jovie-delivery-controller'
  );
  const receiptsDir =
    process.argv.find(arg => arg.startsWith('--receipts-dir='))?.slice(15) ||
    join(stateDir, 'receipts');
  const outputDir =
    process.argv.find(arg => arg.startsWith('--output-dir='))?.slice(13) ||
    join(stateDir, 'flow-metrics');
  const query = process.argv.find(arg => arg.startsWith('--query='))?.slice(8);
  const issue = process.argv.find(arg => arg.startsWith('--issue='))?.slice(8);
  const resources = process.env.JOVIE_FLOW_RESOURCES
    ? JSON.parse(process.env.JOVIE_FLOW_RESOURCES)
    : {};
  const receipts = (await readReceipts(receiptsDir)).filter(Boolean);
  const metrics = buildFlowMetrics(receipts, { resources });
  const priorPath = join(outputDir, 'latest.json');
  let prior = null;
  try {
    prior = JSON.parse(await readFile(priorPath, 'utf8'));
  } catch {}
  const priorAge = validTime(prior?.observedAt);
  metrics.reconciliation = {
    missedRun:
      priorAge !== null &&
      Date.parse(metrics.observedAt) - priorAge > SUMMARY_STALE_MS,
    action:
      priorAge !== null &&
      Date.parse(metrics.observedAt) - priorAge > SUMMARY_STALE_MS
        ? 'reconcile-receipt-store-only'
        : 'none',
    externalMutations: 0,
  };
  await writeAtomic(priorPath, `${JSON.stringify(metrics, null, 2)}\n`);
  await writeAtomic(
    join(outputDir, 'latest.md'),
    renderFlowMetricsMarkdown(metrics)
  );
  process.stdout.write(
    `${JSON.stringify(query ? queryDeliveryFlow(receipts, { query, issue, resources }) : metrics)}\n`
  );
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  main().catch(error => {
    process.stderr.write(`delivery-flow-metrics: ${error.message}\n`);
    process.exitCode = 1;
  });
}
