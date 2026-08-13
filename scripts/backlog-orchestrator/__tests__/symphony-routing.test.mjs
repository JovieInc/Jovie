import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildRoutingReceipt,
  parseRoutingReceipt,
  selectSymphonyRoute,
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
    capabilities: ['architecture', 'root-cause'],
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
    assert.equal(
      selectSymphonyRoute({
        issue: issue('Fix README typo'),
        availableModels: models,
      }).route.model,
      'gpt-5.6-luna'
    );
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
});
