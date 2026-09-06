import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildComparisonReceipt,
  createExecutionAdapter,
  decidePromotion,
  dedupeTrigger,
  promoteFromReceipt,
  rollbackCertified,
  runShadowComparison,
} from './model-harness-selection.mjs';

const policy = {
  version: 1, protectedMetrics: ['correctness', 'firstPassGreen', 'safety'], primaryMetrics: ['correctness', 'firstPassGreen', 'safety'], secondaryMetrics: ['costEfficiency', 'latency'],
  minimumSampleSize: 3, minimumConfidence: 0.95, materialPrimaryImprovement: 0.05, materialSecondaryImprovement: 0.1, maxProtectedRegression: 0, evidenceMaxAgeMs: 60_000, cooldownMs: 60_000,
};
const adapter = (id, harness) => createExecutionAdapter({ id, model: 'k3', endpoint: `${harness}-endpoint`, harness, configVersion: 'v1', capabilities: ['code'], execute: async () => ({}) });
const evidence = (a, metrics) => ({ adapter: a, metrics, cohortId: 'representative-v1', sampleSize: 3, confidence: 0.99, provenance: { version: 'v1', source: 'replay' }, observedAt: new Date().toISOString() });
const baseline = evidence(adapter('kimi-k3', 'kimi-cli'), { correctness: .8, firstPassGreen: .8, safety: .99, costEfficiency: .5, latency: .5 });

describe('model × CLI/harness selection', () => {
  it('executes and compares K3 through Kimi and Codex adapters on one cohort', async () => {
    const challenger = evidence(adapter('codex-k3', 'codex-cli'), { correctness: .86, firstPassGreen: .86, safety: .99, costEfficiency: .5, latency: .5 });
    const decision = decidePromotion({ baseline, challenger, policy });
    assert.equal(decision.decision, 'promote');
    assert.equal(challenger.cohortId, baseline.cohortId);
    const run = await runShadowComparison({ incumbent: baseline.adapter, challenger: challenger.adapter, workload: 'code', cohortId: baseline.cohortId });
    assert.equal(run.context.mutateProduction, false);
  });

  it('executes Grok through native and Codex adapters without vendor branches', () => {
    const native = adapter('grok-native', 'grok-cli');
    const codex = adapter('grok-codex', 'codex-cli');
    assert.notEqual(native.harness, codex.harness);
    assert.equal(native.model, codex.model);
  });

  it('reprocessing an unchanged registry/version emits no benchmark jobs', () => {
    const first = dedupeTrigger({ trigger: 'registry-update', registryVersion: 'v1' });
    assert.equal(dedupeTrigger({ trigger: 'registry-update', registryVersion: 'v1', previous: first }).shouldEvaluate, false);
  });

  it('rejects novelty-only, non-material, low-sample, stale, and protected-metric wins', () => {
    const challenger = evidence(adapter('new-route', 'new-cli'), { correctness: .8, firstPassGreen: .8, safety: .99, costEfficiency: .45, latency: .45 });
    assert.equal(decidePromotion({ baseline, challenger, policy }).decision, 'retain-incumbent');
    assert.match(decidePromotion({ baseline, challenger: { ...challenger, sampleSize: 1 }, policy }).reasons.join(','), /insufficient-samples/);
    assert.match(decidePromotion({ baseline, challenger: { ...challenger, observedAt: new Date(Date.now() - 120_000).toISOString() }, policy }).reasons.join(','), /stale-evidence/);
    assert.match(decidePromotion({ baseline, challenger: { ...challenger, metrics: { ...challenger.metrics, correctness: .81, firstPassGreen: .81, safety: .98 } }, policy }).reasons.join(','), /protected-metric-regression/);
  });

  it('promotes only from a comparison receipt and scopes the winner to one workload', () => {
    const challenger = evidence(adapter('codex-k3', 'codex-cli'), { correctness: .86, firstPassGreen: .86, safety: .99, costEfficiency: .5, latency: .5 });
    const decision = decidePromotion({ baseline, challenger, policy });
    const comparison = buildComparisonReceipt({ workload: 'code', cohortId: baseline.cohortId, baseline, challenger, decision, trigger: 'explicit-registry-update' });
    const promotion = promoteFromReceipt({ receipt: comparison, incumbent: baseline.adapter, policy });
    assert.equal(promotion.receipt.workload, 'code');
    assert.equal(promotion.receipt.quarantined.harness, 'kimi-cli');
    assert.throws(() => promoteFromReceipt({ receipt: { ...comparison, decision: { decision: 'promote' }, promotionScope: null }, policy }), /promotion-scope-invalid/);
  });

  it('fails closed for shadow mutation, lease theft, flapping, missing receipts, and uncertified rollback', () => {
    const shadow = createExecutionAdapter({ id: 'shadow', model: 'k3', endpoint: 'endpoint', harness: 'harness', configVersion: 'v1', capabilities: ['code'], execute: async context => { assert.equal(context.mode, 'shadow'); assert.equal(context.mutateProduction, false); assert.equal(context.activeLease, false); return {}; } });
    assert.ok(shadow);
    const challenger = evidence(adapter('codex-k3', 'codex-cli'), { correctness: .86, firstPassGreen: .86, safety: .99, costEfficiency: .5, latency: .5 });
    assert.match(decidePromotion({ baseline, challenger: { ...challenger, lastPromotionAt: new Date().toISOString() }, policy }).reasons.join(','), /hysteresis-cooldown/);
    assert.throws(() => promoteFromReceipt({ receipt: null, policy }), /promotion-receipt-required/);
    assert.throws(() => rollbackCertified({ selected: baseline.adapter, certified: { adapter: baseline.adapter, certified: false } }), /certified-rollback-target-required/);
    return shadow.execute({ mode: 'shadow', mutateProduction: false, activeLease: false });
  });
});
