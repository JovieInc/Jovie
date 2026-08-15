import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildFlowMetrics,
  queryDeliveryFlow,
} from '../delivery-flow-metrics.mjs';

const HEAD = 'a'.repeat(40);
const NOW = '2026-08-15T12:00:00.000Z';

function receipt(stage, minute, key = 'JOV-1') {
  return {
    schema: 'jovie-delivery-receipt/v1',
    receiptKey: `${key}-${stage}-${minute}`,
    observedAt: `2026-08-15T${String(10 + Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}:00.000Z`,
    stage,
    event: { issue: key, pr: 1, headSha: HEAD },
  };
}

function complete(key) {
  return [
    'ready',
    'leased',
    'draft-pr',
    'ci-pending',
    'ci-green',
    'queued',
    'merged',
    'production-proven',
  ].map((stage, index) => receipt(stage, index * 2, key));
}

describe('delivery flow metrics', () => {
  it('reports empty and partial data as insufficient rather than fabricating percentiles', () => {
    const empty = buildFlowMetrics([], { now: NOW });
    assert.equal(empty.throughput.exactProductionProofCount, 0);
    assert.equal(
      empty.stageTiming.readyToProduction.status,
      'insufficient-sample'
    );
    const partial = buildFlowMetrics(
      [receipt('ready', 0), receipt('leased', 2)],
      { now: NOW }
    );
    assert.equal(partial.stageTiming.readyToAdmitted.sampleSize, 1);
    assert.equal(partial.stageTiming.readyToAdmitted.p50Ms, null);
  });

  it('deduplicates replayed receipts and only publishes percentiles with five measured samples', () => {
    const receipts = Array.from({ length: 5 }, (_, index) =>
      complete(`JOV-${index}`)
    ).flat();
    receipts.push(receipts[0]);
    const metrics = buildFlowMetrics(receipts, { now: NOW });
    assert.equal(metrics.source.receipts, 40);
    assert.equal(metrics.stageTiming.readyToProduction.status, 'available');
    assert.equal(metrics.stageTiming.readyToProduction.sampleSize, 5);
  });

  it('keeps late receipts as evidence and surfaces the oldest current queue wait', () => {
    const oldQueue = receipt('queued', 0, 'JOV-queue');
    const later = receipt('ci-pending', 10, 'JOV-ci');
    const metrics = buildFlowMetrics([oldQueue, later], { now: NOW });
    assert.equal(metrics.waiting.oldestByStage.queued.key, 'issue:JOV-queue');
    assert.equal(metrics.bottleneck.kind, 'queue');
  });

  it('reports active lanes, readiness depth, bounded failures/retries, and resource constraints', () => {
    const repair = {
      ...receipt('repair-pending', 2, 'JOV-repair'),
      transition: { event: 'retry-once' },
    };
    const metrics = buildFlowMetrics(
      [
        receipt('ready', 0, 'JOV-ready'),
        receipt('ci-pending', 1, 'JOV-ci'),
        repair,
      ],
      {
        now: NOW,
        resources: {
          saturated: true,
          creditsAvailable: false,
          constraint: 'model-credit',
        },
      }
    );
    assert.equal(metrics.activeLaneCount, 1);
    assert.equal(metrics.readyWorkDepth, 1);
    assert.equal(metrics.failureRetry.failures, 1);
    assert.equal(metrics.failureRetry.retries, 1);
    assert.equal(metrics.bottleneck.kind, 'model-credit');
  });

  it('uses one query core for compact CLI-ready status, percentiles, and issue timeline reads', () => {
    const receipts = complete('JOV-123');
    const status = queryDeliveryFlow(receipts, { now: NOW });
    const metrics = buildFlowMetrics(receipts, { now: NOW });
    assert.deepEqual(status.throughput, metrics.throughput);
    assert.deepEqual(
      queryDeliveryFlow(receipts, { query: 'percentiles', now: NOW }),
      metrics.stageTiming
    );
    assert.equal(
      queryDeliveryFlow(receipts, {
        query: 'issue-timeline',
        issue: 'JOV-123',
        now: NOW,
      }).latestStage,
      'production-proven'
    );
  });
});
