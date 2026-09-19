import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  classifyStall,
  escalate,
  openLoopRecord,
  planFounderContact,
} from '../no-unattended-red.mjs';
import {
  ALREADY_IN_FLIGHT_SCHEMA,
  evaluateHumanFire,
  inferHumanFireIntent,
  LIVE_STATE_POLICY,
  LIVE_STATE_SCHEMA,
} from '../summer-live-state.mjs';

const NOW = '2026-09-19T13:04:00.000Z';
const HEAD = 'a'.repeat(40);
const REPO = 'JovieInc/Jovie';

function livePr(overrides = {}) {
  return {
    source: 'github-live',
    prNumber: 17995,
    exists: true,
    isInMergeQueue: true,
    prReadyEnrolled: true,
    mergeable: 'MERGEABLE',
    mergeStateStatus: 'AWAITING_CHECKS',
    mergeQueuePosition: 1,
    observedAt: NOW,
    ...overrides,
  };
}

function openRecord() {
  return openLoopRecord(
    classifyStall(
      {
        repository: REPO,
        stallClass: 'queue-eviction',
        issue: 'JOV-17995',
        pr: 17995,
        headSha: HEAD,
      },
      { now: NOW }
    ),
    { now: NOW }
  );
}

describe('summer-live-state-no-false-human-fire-v1', () => {
  it('classifies human-fire prose without matching machine kebab reasons', () => {
    assert.equal(
      inferHumanFireIntent({
        reason: 'envelope PR is nonexistent; ask a human to land it',
      }),
      'claim-envelope-missing'
    );
    assert.equal(
      inferHumanFireIntent({
        exactQuestion: 'Please create the PR so we can land the envelope',
      }),
      'ask-human-create-pr'
    );
    assert.equal(
      inferHumanFireIntent({
        reason: 'authority-budget-exhausted:dropped-controller-event',
      }),
      null
    );
    assert.equal(
      inferHumanFireIntent({
        reason: 'missing-failing-checks:create-bounded-ci-repair-pr',
      }),
      null
    );
  });

  it('blocks false human-fire when the live PR is already in the merge queue', () => {
    const gate = evaluateHumanFire({
      intent: 'ask-human-land-pr',
      livePr: livePr(),
      hostJson: { prNumber: null, missing: true },
      gbrain: { envelopePr: 'nonexistent' },
      now: NOW,
    });
    assert.equal(gate.schema, LIVE_STATE_SCHEMA);
    assert.equal(gate.policy, LIVE_STATE_POLICY);
    assert.equal(gate.decision, 'forbidden');
    assert.equal(gate.escalationAllowed, false);
    assert.equal(gate.reason, 'pr-already-in-merge-queue');
    assert.equal(gate.alreadyInFlight.schema, ALREADY_IN_FLIGHT_SCHEMA);
    assert.equal(gate.alreadyInFlight.prNumber, 17995);
    assert.equal(gate.alreadyInFlight.isInMergeQueue, true);

    const blocked = escalate(
      openRecord(),
      'envelope PR is nonexistent; ask a human to land it',
      NOW,
      {
        livePr: livePr(),
        hostJson: { missing: true },
        gbrain: { missing: true },
      }
    );
    assert.equal(blocked.outcome, 'healthy');
    assert.equal(blocked.dispatchState, 'already-in-flight');
    assert.equal(blocked.reason, 'already-in-flight:pr-already-in-merge-queue');
    assert.equal(blocked.escalation, null);
    assert.equal(blocked.alreadyInFlight.schema, ALREADY_IN_FLIGHT_SCHEMA);
  });

  it('forbids a missing-PR claim unless live GitHub evidence is present', () => {
    const staleOnly = evaluateHumanFire({
      intent: 'claim-pr-missing',
      hostJson: { status: 'released', closureStatus: 'red' },
      gbrain: { pr: null },
      now: NOW,
    });
    assert.equal(staleOnly.decision, 'forbidden');
    assert.equal(staleOnly.reason, 'live-github-evidence-required');
    assert.equal(staleOnly.liveEvidence, false);

    const liveMissing = evaluateHumanFire({
      intent: 'claim-pr-missing',
      livePr: livePr({
        exists: false,
        prNumber: null,
        isInMergeQueue: false,
        prReadyEnrolled: false,
      }),
      now: NOW,
    });
    assert.equal(liveMissing.decision, 'allow');
    assert.equal(liveMissing.reason, 'live-github-evidence');
  });

  it('forbids founder contact when PR Ready is already enrolled', () => {
    const record = escalate(openRecord(), 'founder-action-required', NOW);
    assert.equal(record.outcome, 'escalated');
    const planned = planFounderContact(
      record,
      {
        severity: 'production',
        recoveryExhausted: true,
        safeRollbackAvailable: false,
        featureFlagAvailable: false,
        founderReviewOpenedAt: '2026-09-19T12:00:00.000Z',
        ackWindowMs: 15 * 60 * 1000,
        destination: 'ovie',
        destinationConsented: true,
        provider: 'ovie-push',
        providerAllowed: true,
        livePr: livePr({ isInMergeQueue: false, prReadyEnrolled: true }),
      },
      { now: NOW }
    );
    assert.equal(planned.status, 'blocked');
    assert.equal(planned.reason, 'already-in-flight:pr-ready-already-enrolled');
    assert.equal(planned.contact, null);
    assert.equal(planned.record.alreadyInFlight.prReadyEnrolled, true);
  });
});
