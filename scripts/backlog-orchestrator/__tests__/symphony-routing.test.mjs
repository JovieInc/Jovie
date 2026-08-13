import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildRoutingReceipt,
  parseRoutingReceipt,
  selectSymphonyRoute,
} from '../symphony-routing.mjs';

const models = {
  'codex-luna': { model: 'gpt-5.6-luna', capabilities: ['code', 'review'] },
  'codex-terra': { model: 'gpt-5.6-terra', capabilities: ['code', 'review', 'architecture'] },
  'codex-sol': { model: 'gpt-5.6-sol', capabilities: ['architecture', 'root-cause'] },
};
const issue = (title, description = '') => ({ identifier: 'JOV-5029', title, description, labels: { nodes: [] }, comments: { nodes: [] } });

describe('Symphony routing receipts', () => {
  it('routes mechanical work to Luna and standard code to Luna', () => {
    assert.equal(selectSymphonyRoute({ issue: issue('Fix README typo'), availableModels: models }).route.model, 'gpt-5.6-luna');
    assert.equal(selectSymphonyRoute({ issue: issue('Add profile validation'), availableModels: models }).route.model, 'gpt-5.6-luna');
  });

  it('routes architecture and root-cause work to Terra/Sol', () => {
    assert.equal(selectSymphonyRoute({ issue: issue('Repair fleet architecture'), availableModels: models }).route.model, 'gpt-5.6-terra');
    assert.equal(selectSymphonyRoute({ issue: issue('Find root cause of regression'), availableModels: models }).route.model, 'gpt-5.6-sol');
  });

  it('escalates on unavailable or cooldown candidates and fails closed', () => {
    const escalated = selectSymphonyRoute({ issue: issue('Add normal code'), availableModels: { ...models, 'codex-luna': { ...models['codex-luna'], available: false } } });
    assert.equal(escalated.route.model, 'gpt-5.6-terra');
    const blocked = selectSymphonyRoute({ issue: issue('Add normal code'), availableModels: { ...models, 'codex-luna': { ...models['codex-luna'], available: false }, 'codex-terra': { ...models['codex-terra'], available: false } } });
    assert.equal(blocked.status, 'blocked');
    const cooldown = selectSymphonyRoute({ issue: issue('Add normal code'), availableModels: models, cooldowns: { 'codex-luna': 2_000 }, now: 1_000 });
    assert.equal(cooldown.route.model, 'gpt-5.6-terra');
  });

  it('round-trips the durable receipt', () => {
    const current = issue('Repair fleet architecture');
    const decision = selectSymphonyRoute({ issue: current, availableModels: models });
    current.comments.nodes.push({ body: buildRoutingReceipt(decision.route) });
    assert.equal(parseRoutingReceipt(current).fingerprint, decision.route.fingerprint);
  });
});
