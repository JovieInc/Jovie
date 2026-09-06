// JOV-INV-030: evidence-ratcheted model x CLI/harness selection.
import { createHash } from 'node:crypto';
import { readInvariantRegistry } from '../invariants/registry.mjs';

export const MODEL_HARNESS_SELECTION_SCHEMA = 'symphony-model-harness-selection/v1';
export const COMPARISON_RECEIPT_SCHEMA = 'symphony-model-harness-comparison/v1';
export const PROMOTION_RECEIPT_SCHEMA = 'symphony-model-harness-promotion/v1';

const POLICY_KEY = 'symphony.model-harness-selection.contract';

export function selectionPolicy(registry = readInvariantRegistry()) {
  const invariant = registry.invariants.find(item => item.policy?.key === POLICY_KEY);
  if (!invariant?.policy?.value) throw new Error('model-harness-policy-missing');
  return invariant.policy.value;
}

function requiredString(value, name) {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${name}-required`);
  return value.trim();
}

export function createExecutionAdapter(candidate) {
  const adapter = {
    id: requiredString(candidate?.id, 'adapter-id'),
    model: requiredString(candidate?.model, 'adapter-model'),
    endpoint: requiredString(candidate?.endpoint, 'adapter-endpoint'),
    harness: requiredString(candidate?.harness, 'adapter-harness'),
    configVersion: requiredString(candidate?.configVersion, 'adapter-config-version'),
    capabilities: [...new Set(candidate?.capabilities || [])],
    execute: candidate?.execute,
  };
  if (typeof adapter.execute !== 'function') throw new Error('adapter-execute-required');
  if (adapter.capabilities.length === 0) throw new Error('adapter-capabilities-required');
  return Object.freeze(adapter);
}

export async function runShadowComparison({ incumbent, challenger, workload, cohortId }) {
  if (!incumbent || !challenger || incumbent === challenger) throw new Error('distinct-adapters-required');
  requiredString(workload, 'workload');
  requiredString(cohortId, 'cohort-id');
  const context = { mode: 'shadow', workload, cohortId, mutateProduction: false, activeLease: false };
  const [baseline, candidate] = await Promise.all([incumbent.execute(context), challenger.execute(context)]);
  return { cohortId, workload, context, baseline, challenger };
}

function hash(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 24);
}

function validMetric(value) {
  return Number.isFinite(value) && value >= 0 && value <= 1;
}

function protectedRegression(baseline, challenger, policy) {
  return policy.protectedMetrics.some(metric =>
    challenger.metrics[metric] < baseline.metrics[metric] - policy.maxProtectedRegression
  );
}

export function decidePromotion({ baseline, challenger, policy = selectionPolicy(), now = Date.now() }) {
  const reasons = [];
  const required = [...policy.protectedMetrics, ...policy.primaryMetrics, ...policy.secondaryMetrics];
  if (!baseline || !challenger || !baseline.adapter || !challenger.adapter) reasons.push('missing-candidate-provenance');
  if (!baseline?.cohortId || baseline.cohortId !== challenger?.cohortId) reasons.push('cohort-mismatch');
  if (!Number.isInteger(challenger?.sampleSize) || challenger.sampleSize < policy.minimumSampleSize) reasons.push('insufficient-samples');
  if (challenger?.confidence == null || challenger.confidence < policy.minimumConfidence) reasons.push('insufficient-confidence');
  if (!challenger?.provenance?.version || !challenger.provenance?.source) reasons.push('missing-provenance');
  const observedAt = Date.parse(challenger?.observedAt || '');
  if (!Number.isFinite(observedAt) || now - observedAt > policy.evidenceMaxAgeMs) reasons.push('stale-evidence');
  for (const metric of required) if (!validMetric(baseline?.metrics?.[metric]) || !validMetric(challenger?.metrics?.[metric])) reasons.push(`invalid-metric:${metric}`);
  if (protectedRegression(baseline, challenger, policy)) reasons.push('protected-metric-regression');
  const primaryDelta = Math.max(...policy.primaryMetrics.map(metric => challenger?.metrics?.[metric] - baseline?.metrics?.[metric]), -Infinity);
  const secondaryDelta = Math.max(...policy.secondaryMetrics.map(metric => baseline?.metrics?.[metric] - challenger?.metrics?.[metric]), -Infinity);
  if (primaryDelta < policy.materialPrimaryImprovement && secondaryDelta < policy.materialSecondaryImprovement) reasons.push('non-material-delta');
  if (challenger?.lastPromotionAt && now - Date.parse(challenger.lastPromotionAt) < policy.cooldownMs) reasons.push('hysteresis-cooldown');
  return {
    decision: reasons.length === 0 ? 'promote' : 'retain-incumbent',
    reasons,
    deltas: { primary: primaryDelta, secondary: secondaryDelta },
  };
}

export function buildComparisonReceipt({ workload, cohortId, baseline, challenger, decision, trigger, evaluatedAt = new Date().toISOString() }) {
  if (!decision || !baseline || !challenger) throw new Error('comparison-evidence-required');
  return {
    schema: COMPARISON_RECEIPT_SCHEMA,
    receiptId: `comparison-${hash({ workload, cohortId, baseline: baseline.adapter, challenger: challenger.adapter, evaluatedAt })}`,
    evaluatedAt,
    workload,
    cohortId,
    trigger,
    baseline: { adapter: baseline.adapter, metrics: baseline.metrics, sampleSize: baseline.sampleSize, confidence: baseline.confidence },
    challenger: { adapter: challenger.adapter, metrics: challenger.metrics, sampleSize: challenger.sampleSize, confidence: challenger.confidence, provenance: challenger.provenance },
    decision,
    promotionScope: decision.decision === 'promote' ? { workload } : null,
  };
}

export function promoteFromReceipt({ receipt, incumbent, policy = selectionPolicy() }) {
  if (receipt?.schema !== COMPARISON_RECEIPT_SCHEMA || receipt.decision?.decision !== 'promote') throw new Error('promotion-receipt-required');
  if (!receipt.promotionScope?.workload || receipt.promotionScope.workload !== receipt.workload) throw new Error('promotion-scope-invalid');
  const promotion = {
    schema: PROMOTION_RECEIPT_SCHEMA,
    receiptId: `promotion-${hash(receipt)}`,
    comparisonReceiptId: receipt.receiptId,
    workload: receipt.workload,
    incumbent: receipt.baseline.adapter,
    winner: receipt.challenger.adapter,
    quarantined: incumbent || receipt.baseline.adapter,
    certifiedFloor: receipt.challenger.metrics,
    policyVersion: policy.version,
    promotedAt: receipt.evaluatedAt,
  };
  return { route: receipt.challenger.adapter, receipt: promotion };
}

export function dedupeTrigger({ trigger, registryVersion, previous }) {
  const key = hash({ trigger, registryVersion });
  return { key, shouldEvaluate: previous?.key !== key };
}

export function rollbackCertified({ selected, certified }) {
  if (!certified?.adapter || certified.certified !== true) throw new Error('certified-rollback-target-required');
  return { route: certified.adapter, reason: 'certified-floor-regression', unrelatedLeasesPreserved: true, previous: selected };
}
