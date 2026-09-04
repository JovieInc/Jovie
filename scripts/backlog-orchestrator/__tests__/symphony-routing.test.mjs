import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildRoutingReceipt,
  classifyAppServerObservation,
  parseRoutingReceipt,
  planOfficialSymphonyRoute,
  selectSymphonyRoute,
  settleOfficialSymphonyRoute,
  verifyRoutingReceipt,
} from '../symphony-routing.mjs';

const models = {
  'codex-luna': { model: 'gpt-5.6-luna', capabilities: ['code', 'review'] },
  'codex-terra': {
    model: 'gpt-5.6-terra',
    capabilities: ['code', 'review', 'architecture'],
  },
  'codex-sol': {
    model: 'gpt-5.6-sol',
    capabilities: ['architecture', 'root-cause', 'code'],
  },
};
const issue = (title, description = '') => ({
  identifier: 'JOV-5029',
  title,
  description,
  labels: { nodes: [] },
  comments: { nodes: [] },
});
describe('Symphony routing receipts', () => {
  it('routes mechanical work to Luna and standard code to Luna', () => {
    const mechanical = selectSymphonyRoute({
      issue: issue('Fix README typo'),
      availableModels: models,
    }).route;
    assert.equal(mechanical.model, 'gpt-5.6-luna');
    assert.equal(mechanical.modelTier, 'economical');
    assert.equal(mechanical.usageClass, 'economical-included');
    assert.equal(mechanical.qualityThreshold, 70);
    assert.equal(
      selectSymphonyRoute({
        issue: issue('Add profile validation'),
        availableModels: models,
      }).route.model,
      'gpt-5.6-luna'
    );
  });

  it('routes architecture and root-cause work to Terra/Sol', () => {
    assert.equal(
      selectSymphonyRoute({
        issue: issue('Repair fleet architecture'),
        availableModels: models,
      }).route.model,
      'gpt-5.6-terra'
    );
    assert.equal(
      selectSymphonyRoute({
        issue: issue('Find root cause of regression'),
        availableModels: models,
      }).route.model,
      'gpt-5.6-sol'
    );
  });

  it('deliberate red: keeps protected and founder-review work off the economical tier', () => {
    for (const title of [
      'Rotate production credentials safely',
      'Ship irreversible database migration',
      'Prepare founder review for the release',
      'Repair authentication security regression',
    ]) {
      const decision = selectSymphonyRoute({
        issue: issue(title),
        availableModels: models,
      });
      assert.equal(decision.status, 'selected');
      assert.equal(decision.route.modelTier, 'premium');
      assert.equal(decision.route.model, 'gpt-5.6-sol');
      assert.match(decision.route.reason, /risk|ambiguity|root-cause/);
    }
  });

  it('escalates on unavailable or cooldown candidates and fails closed', () => {
    const escalated = selectSymphonyRoute({
      issue: issue('Add normal code'),
      availableModels: {
        ...models,
        'codex-luna': { ...models['codex-luna'], available: false },
      },
    });
    assert.equal(escalated.route.model, 'gpt-5.6-terra');
    const blocked = selectSymphonyRoute({
      issue: issue('Add normal code'),
      availableModels: {
        ...models,
        'codex-luna': { ...models['codex-luna'], available: false },
        'codex-terra': { ...models['codex-terra'], available: false },
        'codex-sol': { ...models['codex-sol'], available: false },
      },
    });
    assert.equal(blocked.status, 'blocked');
    const cooldown = selectSymphonyRoute({
      issue: issue('Add normal code'),
      availableModels: models,
      cooldowns: { 'codex-luna': 2_000 },
      now: 1_000,
    });
    assert.equal(cooldown.route.model, 'gpt-5.6-terra');
  });

  it('round-trips the durable receipt', () => {
    const current = issue('Repair fleet architecture');
    const decision = selectSymphonyRoute({
      issue: current,
      availableModels: models,
    });
    current.comments.nodes.push({ body: buildRoutingReceipt(decision.route) });
    assert.equal(
      parseRoutingReceipt(current).fingerprint,
      decision.route.fingerprint
    );
  });

  it('verifies receipts semantically and rejects tampering', () => {
    const current = issue('Fix README typo');
    const decision = selectSymphonyRoute({
      issue: current,
      availableModels: models,
    });
    const receiptBody = buildRoutingReceipt(decision.route);
    current.comments.nodes.push({ body: receiptBody });
    assert.equal(
      verifyRoutingReceipt(current, { availableModels: models }).model,
      'gpt-5.6-luna'
    );
    assert.equal(
      verifyRoutingReceipt(current, {
        availableModels: models,
        requireCapacityEvidence: true,
      }),
      null
    );

    const withCapacity = issue('Fix README typo');
    const capacityDecision = selectSymphonyRoute({
      issue: withCapacity,
      availableModels: models,
      capacity: { accounts: 2, ready: 1, active: 'tim-jov-ie' },
    });
    withCapacity.comments.nodes.push({
      body: buildRoutingReceipt(capacityDecision.route),
    });
    assert.equal(
      verifyRoutingReceipt(withCapacity, {
        availableModels: models,
        requireCapacityEvidence: true,
      }).model,
      'gpt-5.6-luna'
    );

    // Arbitrary model swap.
    let forged = issue('Fix README typo');
    forged.comments.nodes.push({
      body: receiptBody.replace('gpt-5.6-luna', 'gpt-5.6-sol'),
    });
    assert.equal(
      verifyRoutingReceipt(forged, { availableModels: models }),
      null
    );

    // Forged fingerprint.
    forged = issue('Fix README typo');
    forged.comments.nodes.push({
      body: receiptBody.replace(decision.route.fingerprint, '0'.repeat(24)),
    });
    assert.equal(
      verifyRoutingReceipt(forged, { availableModels: models }),
      null
    );

    // Stale classification after a title edit.
    const stale = issue('Repair fleet architecture');
    stale.comments.nodes.push({ body: receiptBody });
    assert.equal(
      verifyRoutingReceipt(stale, { availableModels: models }),
      null
    );

    // Altered candidates must not name the selected model.
    forged = issue('Fix README typo');
    forged.comments.nodes.push({
      body: receiptBody.replace(
        '"candidates":[]',
        '"candidates":[{"id":"codex-luna","status":"cooldown","until":1}]'
      ),
    });
    assert.equal(
      verifyRoutingReceipt(forged, { availableModels: models }),
      null
    );
  });

  it('blocks every codex route when capacity is unreadable or empty', () => {
    const blocked = selectSymphonyRoute({
      issue: issue('Add profile validation'),
      availableModels: models,
      capacity: null,
    });
    assert.equal(blocked.status, 'blocked');
    assert.equal(blocked.capacity.readable, false);
    const empty = selectSymphonyRoute({
      issue: issue('Add profile validation'),
      availableModels: models,
      capacity: { accounts: 0, ready: 0, active: null, cooldowns: {} },
    });
    assert.equal(empty.status, 'blocked');
    const saturated = selectSymphonyRoute({
      issue: issue('Add profile validation'),
      availableModels: models,
      capacity: { accounts: 2, ready: 0, active: 'a', cooldowns: {} },
    });
    assert.equal(saturated.status, 'blocked');
    const healthy = selectSymphonyRoute({
      issue: issue('Add profile validation'),
      availableModels: models,
      capacity: { accounts: 2, ready: 1, active: 'a', cooldowns: {} },
    });
    assert.equal(healthy.route.model, 'gpt-5.6-luna');
    assert.deepEqual(healthy.route.capacity, {
      accounts: 2,
      ready: 1,
      active: 'a',
      observedAt: null,
      readable: true,
    });
  });

  it('supersedes a stale receipt with the most recent valid one', () => {
    const current = issue('Fix README typo');
    const first = selectSymphonyRoute({
      issue: current,
      availableModels: models,
    });
    current.comments.nodes.push({ body: buildRoutingReceipt(first.route) });
    const second = selectSymphonyRoute({
      issue: current,
      availableModels: {
        ...models,
        'codex-luna': { ...models['codex-luna'], available: false },
      },
    });
    current.comments.nodes.push({ body: buildRoutingReceipt(second.route) });
    assert.equal(parseRoutingReceipt(current).model, 'gpt-5.6-terra');
  });

  it('deliberate red: escalates monotonically after test and process failures, then stops spend', () => {
    const current = issue('Apply a bounded formatting repair');
    const first = planOfficialSymphonyRoute({
      issue: current,
      availableModels: models,
      now: 1_000,
    });
    assert.equal(first.status, 'selected');
    assert.equal(first.receipt.modelTier, 'economical');
    assert.equal(first.receipt.attemptCount, 1);

    const afterTests = settleOfficialSymphonyRoute({
      state: first.state,
      issueState: 'In Progress',
      processOutcome: { kind: 'test_failure' },
      now: 2_000,
    });
    const second = planOfficialSymphonyRoute({
      issue: current,
      state: afterTests.state,
      availableModels: models,
      now: 3_000,
    });
    assert.equal(second.receipt.modelTier, 'standard');
    assert.equal(second.receipt.model, 'gpt-5.6-terra');
    assert.equal(second.receipt.attemptCount, 2);
    assert.equal(second.receipt.escalation.transitionCount, 1);

    const afterProcess = settleOfficialSymphonyRoute({
      state: second.state,
      issueState: 'In Progress',
      processOutcome: { kind: 'process_failure' },
      now: 4_000,
    });
    const third = planOfficialSymphonyRoute({
      issue: current,
      state: afterProcess.state,
      availableModels: models,
      now: 5_000,
    });
    assert.equal(third.receipt.modelTier, 'premium');
    assert.equal(third.receipt.model, 'gpt-5.6-sol');
    assert.equal(third.receipt.escalation.transitionCount, 2);

    const exhausted = planOfficialSymphonyRoute({
      issue: current,
      state: settleOfficialSymphonyRoute({
        state: third.state,
        issueState: 'In Progress',
        processOutcome: { kind: 'process_failure' },
        now: 6_000,
      }).state,
      availableModels: models,
      now: 7_000,
    });
    assert.equal(exhausted.status, 'blocked');
    assert.equal(exhausted.reason, 'attempt-budget-exhausted');
    assert.equal(exhausted.state.attemptCount, 3);
    assert.equal(exhausted.state.terminal, true);
  });

  it('deliberate red: honors a pre-lease minimum model tier', () => {
    const current = issue('Fix README typo');
    const planned = planOfficialSymphonyRoute({
      issue: current,
      availableModels: models,
      minimumTier: 'standard',
      now: 1_000,
    });
    assert.equal(planned.status, 'selected');
    assert.equal(planned.receipt.modelTier, 'standard');
    assert.equal(planned.receipt.model, 'gpt-5.6-terra');

    const afterFailure = settleOfficialSymphonyRoute({
      state: planned.state,
      issueState: 'In Progress',
      processOutcome: { kind: 'test_failure' },
      now: 2_000,
    });
    const next = planOfficialSymphonyRoute({
      issue: current,
      state: afterFailure.state,
      availableModels: models,
      minimumTier: 'economical',
      now: 3_000,
    });
    assert.equal(next.receipt.modelTier, 'premium');
    assert.equal(next.receipt.model, 'gpt-5.6-sol');
  });

  it('deliberate red: reuses one prepared attempt instead of duplicating spend', () => {
    const current = issue('Fix README typo');
    const first = planOfficialSymphonyRoute({
      issue: current,
      availableModels: models,
      now: 1_000,
    });
    const duplicate = planOfficialSymphonyRoute({
      issue: current,
      state: first.state,
      availableModels: models,
      now: 1_001,
    });
    assert.equal(duplicate.status, 'reused');
    assert.equal(duplicate.receipt.attemptId, first.receipt.attemptId);
    assert.equal(duplicate.state.attemptCount, 1);

    const claimed = planOfficialSymphonyRoute({
      issue: current,
      state: {
        ...first.state,
        execution: {
          attemptId: first.receipt.attemptId,
          status: 'finished',
        },
      },
      availableModels: models,
      now: 1_002,
    });
    assert.equal(claimed.status, 'blocked');
    assert.equal(claimed.reason, 'attempt-awaiting-finalize');
    assert.equal(claimed.state.attemptCount, 1);
  });

  it('deliberate red: reports account unavailability without escalating or spending again', () => {
    const current = issue('Fix README typo');
    const first = planOfficialSymphonyRoute({
      issue: current,
      availableModels: models,
      now: 1_000,
    });
    const unavailable = settleOfficialSymphonyRoute({
      state: first.state,
      issueState: 'In Progress',
      processOutcome: { kind: 'account_unavailable' },
      now: 2_000,
    });
    const blocked = planOfficialSymphonyRoute({
      issue: current,
      state: unavailable.state,
      availableModels: models,
      now: 3_000,
    });
    assert.equal(blocked.status, 'blocked');
    assert.equal(blocked.reason, 'account-unavailable');
    assert.equal(blocked.state.attemptCount, 1);
    assert.equal(blocked.state.modelTier, 'economical');
  });

  it('deliberate red: escalates a tier-specific unavailable model without ping-pong', () => {
    const current = issue('Fix README typo');
    const first = planOfficialSymphonyRoute({
      issue: current,
      availableModels: models,
      now: 1_000,
    });
    const unavailable = settleOfficialSymphonyRoute({
      state: first.state,
      issueState: 'In Progress',
      processOutcome: { kind: 'model_unavailable' },
      now: 2_000,
    });
    const second = planOfficialSymphonyRoute({
      issue: current,
      state: unavailable.state,
      availableModels: models,
      now: 3_000,
    });
    assert.equal(second.receipt.modelTier, 'standard');
    assert.equal(second.receipt.model, 'gpt-5.6-terra');
    assert.equal(second.receipt.escalation.fromTier, 'economical');
    assert.equal(second.receipt.escalation.toTier, 'standard');
  });

  it('deliberate red: terminalizes a routing registry with no compatible model', () => {
    const unavailableModels = Object.fromEntries(
      Object.entries(models).map(([id, model]) => [
        id,
        { ...model, available: false },
      ])
    );
    const blocked = planOfficialSymphonyRoute({
      issue: issue('Fix README typo'),
      availableModels: unavailableModels,
      now: 1_000,
    });
    assert.equal(blocked.status, 'blocked');
    assert.equal(blocked.reason, 'no-compatible-model-available');
    assert.equal(blocked.state.terminal, true);
    const repeated = planOfficialSymphonyRoute({
      issue: issue('Fix README typo'),
      state: blocked.state,
      availableModels: unavailableModels,
      now: 2_000,
    });
    assert.equal(repeated.reason, 'no-compatible-model-available');
    assert.equal(repeated.state.attemptCount, 0);
  });

  it('deliberate red: classifies app-server failures without retaining raw output', () => {
    assert.deepEqual(
      classifyAppServerObservation({
        exitCode: 1,
        output:
          'command=pnpm test exitCode=1 authorization=must-not-be-retained',
      }),
      { kind: 'test_failure' }
    );
    assert.deepEqual(
      classifyAppServerObservation({
        exitCode: 1,
        output: 'HTTP 429 rate limit',
      }),
      { kind: 'rate_limited' }
    );
    assert.deepEqual(
      classifyAppServerObservation({
        exitCode: 1,
        output: 'model gpt-5.6-luna is unavailable',
      }),
      { kind: 'model_unavailable' }
    );
  });
});
