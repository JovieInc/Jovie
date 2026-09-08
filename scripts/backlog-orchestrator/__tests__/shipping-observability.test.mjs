import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildDeliveryReceipt } from '../delivery-state-machine.mjs';
import {
  projectShippingChain,
  projectShippingPortfolio,
  transitionShippingReceipt,
  UNKNOWN,
} from '../shipping-observability.mjs';

const HEAD = 'a'.repeat(40);
const ISSUE = 'JOV-9000';
const NOW = '2026-09-08T20:10:00.000Z';

function shipping(role, id, overrides = {}) {
  return {
    actor: { role, id, evidence: `receipt:${role}:${id}` },
    execution: {
      state: 'active',
      provider: 'openai',
      model: 'gpt-5.3-codex-spark',
      harness: 'codex-cli',
      taskId: 'task-9000',
      attemptId: 'attempt-1',
      evidence: 'runtime:task-9000:attempt-1',
    },
    refs: { issue: ISSUE, pr: 19000, headSha: HEAD, runId: 'run-1' },
    value: {
      authority: 'founder-request',
      decisionId: 'task-01a082d7',
      rationale: 'Expose and shorten the critical shipping path',
      expectedBenefit: 'Reduce approval-to-production lead time',
      observedOutcome: 'One exact build reached production',
    },
    ...overrides,
  };
}

function completeChain() {
  const received = buildDeliveryReceipt(
    {
      delivery_key: 'delivery-9000',
      issue_identifier: ISSUE,
      pr_number: 19000,
      head_sha: HEAD,
      evidence: { shipping: shipping('coordinator', 'summer') },
    },
    { now: '2026-09-08T20:00:00.000Z' }
  );
  const leased = transitionShippingReceipt(
    received,
    { stage: 'leased' },
    shipping('executor', 'agent-17'),
    { now: '2026-09-08T20:01:00.000Z' }
  );
  const ci = transitionShippingReceipt(
    leased,
    { stage: 'ci-pending' },
    shipping('reviewer', 'review-agent-3'),
    { now: '2026-09-08T20:03:00.000Z' }
  );
  const merged = transitionShippingReceipt(
    ci,
    { stage: 'merged' },
    shipping('mergeActor', 'github-merge-queue'),
    { now: '2026-09-08T20:05:00.000Z' }
  );
  const production = transitionShippingReceipt(
    merged,
    { stage: 'production-proven', deployedSha: HEAD },
    shipping('deploymentActor', 'vercel-production'),
    { now: NOW }
  );
  return [received, leased, ci, merged, production];
}

describe('shipping observability projection', () => {
  it('attributes one exact source-to-production chain without conflating actors', () => {
    const result = projectShippingChain(completeChain(), { now: NOW });
    assert.equal(result.qualification.status, 'measured');
    assert.equal(result.qualification.value, 'production-proven');
    assert.equal(result.actors.coordinator.value, 'summer');
    assert.equal(result.actors.executor.value, 'agent-17');
    assert.equal(result.actors.reviewer.value, 'review-agent-3');
    assert.equal(result.actors.mergeActor.value, 'github-merge-queue');
    assert.equal(result.actors.deploymentActor.value, 'vercel-production');
    assert.equal(result.execution.value.model, 'gpt-5.3-codex-spark');
    assert.equal(result.refs.value.headSha, HEAD);
    assert.equal(result.leadTimeMs.value, 10 * 60 * 1000);
  });

  it('qualifies missing, mismatched, stale, and disconnected evidence as UNKNOWN', () => {
    const missing = completeChain().map((receipt, index) =>
      index === 1
        ? {
            ...receipt,
            transition: { ...receipt.transition, evidence: undefined },
          }
        : receipt
    );
    assert.equal(
      projectShippingChain(missing, { now: NOW }).qualification.status,
      UNKNOWN
    );

    const mismatch = completeChain();
    mismatch[2] = {
      ...mismatch[2],
      transition: {
        ...mismatch[2].transition,
        evidence: {
          shipping: shipping('reviewer', 'review-agent-3', {
            refs: {
              issue: ISSUE,
              pr: 19000,
              headSha: 'b'.repeat(40),
              runId: 'run-1',
            },
          }),
        },
      },
    };
    assert.equal(
      projectShippingChain(mismatch, { now: NOW }).qualification.status,
      UNKNOWN
    );
    assert.match(
      projectShippingChain(completeChain(), { now: '2026-09-08T21:00:01.000Z' })
        .qualification.reason,
      /stale-observation/
    );
    const disconnected = completeChain();
    disconnected[2] = { ...disconnected[2], previousReceiptKey: 'missing' };
    assert.equal(
      projectShippingChain(disconnected, { now: NOW }).qualification.status,
      UNKNOWN
    );
  });

  it('keeps measured zero separate from unknown and active separate from waiting', () => {
    const complete = completeChain();
    const portfolio = projectShippingPortfolio([complete], { now: NOW });
    assert.equal(portfolio.throughput.status, 'measured');
    assert.equal(portfolio.throughput.value, 1);
    assert.equal(portfolio.active.value, 0);
    assert.equal(portfolio.waiting.value, 0);
    assert.equal(portfolio.retries.value, 0);
    assert.equal(portfolio.oldestBlocked.status, 'measured');
    assert.equal(portfolio.oldestBlocked.value, null);

    const unknown = projectShippingPortfolio([[{ schema: 'wrong' }]], {
      now: NOW,
    });
    assert.equal(unknown.qualification.status, UNKNOWN);
    assert.equal(unknown.throughput.status, UNKNOWN);
  });

  it('reports retry causes and the oldest qualified blocked chain', () => {
    const received = completeChain()[0];
    const blocked = transitionShippingReceipt(
      received,
      { stage: 'repair-pending', failure: 'ci-failed' },
      shipping('coordinator', 'summer', {
        execution: undefined,
        retry: { count: 2, cause: 'ci-failed' },
      }),
      { now: '2026-09-08T20:02:00.000Z' }
    );
    const result = projectShippingPortfolio([[received, blocked]], {
      now: NOW,
    });
    assert.equal(result.qualification.status, 'measured');
    assert.equal(result.retries.value, 2);
    assert.equal(result.items[0].failureCauses['ci-failed'], 2);
    assert.equal(result.oldestBlocked.value.deliveryKey, 'delivery-9000');
  });
});
