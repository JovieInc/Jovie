import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  isRecord,
  requireIsoTimestamp,
  requireString,
  requireStringArray,
} from '../summer-commissioning/receipt-trust.mjs';

/**
 * Company asset + emergent product discovery (JOV-5945).
 *
 * A versioned projection over the existing capability/benchmark/commissioning
 * registries — never a second source of truth. Assets and feature
 * combinations keep stable identity and version lineage; opportunities move
 * through a bounded lifecycle and can recommend, but never autonomously
 * enact, a high-consequence strategic shift.
 */
export const ASSET_REGISTRY_SCHEMA = 'jovie.company-asset-registry/v1';
export const COMPANY_ASSET_SCHEMA = 'jovie.company-asset/v1';
export const OPPORTUNITY_SCHEMA = 'jovie.company-asset.opportunity/v1';

export const ASSET_CLASSES = Object.freeze([
  'capability',
  'workflow',
  'model-router',
  'skill',
  'dataset',
  'graph',
  'distribution-channel',
  'brand-audience',
  'integration',
  'interface',
  'operational-process',
  'feature-combination',
]);

export const MONETIZATION_FORMS = Object.freeze([
  'internal-leverage',
  'service',
  'productized-service',
  'software',
  'api-mcp-cli',
  'licensing',
  'open-source',
  'data-product',
  'partnership',
  'spinout',
]);

/**
 * Signal classes from JOV-5945 with relative evidentiary weights.
 * founder-observation is a high-weight *hypothesis*: it prioritizes
 * investigation but never counts as paid/behavioral proof.
 */
export const SIGNAL_WEIGHTS = Object.freeze({
  'willingness-to-pay': 1.0,
  'retention-expansion-referral': 0.9,
  'one-customer-many-downstream': 0.8,
  'programmatic-or-whitelabel-demand': 0.7,
  'public-use-distribution-loop': 0.6,
  'external-economics-exceed-internal': 0.6,
  'repeated-unexpected-use': 0.5,
  'unanticipated-feature-combination': 0.5,
  'internal-capability-outperforms-external': 0.5,
  'workaround-export-support-signal': 0.4,
  'founder-observation': 0.4,
});

export const SIGNAL_CLASSES = Object.freeze(Object.keys(SIGNAL_WEIGHTS));

/** Cheapest-test classes ordered by ascending cost. */
export const VALIDATION_TESTS = Object.freeze([
  'customer-conversation',
  'landing-page',
  'relabeling-or-packaging',
  'targeted-outbound',
  'pre-sale-or-payment',
  'api-shim',
  'prototype',
  'concierge-delivery',
  'limited-pilot',
]);

export const OPPORTUNITY_STAGES = Object.freeze([
  'signal',
  'asset-match',
  'hypothesis',
  'cheapest-validation',
  'paid-or-behavioral-evidence',
  'bounded-allocation',
  'delivery-model-test',
  'certified-outcome',
  'scale',
  'pause',
  'kill',
  'hold',
]);

const TERMINAL_STAGES = new Set(['scale', 'pause', 'kill', 'hold']);

export const RECOMMENDATION_TYPES = Object.freeze([
  'reuse-in-current-product',
  'new-product-line',
  'icp-or-packaging-change',
  'sell-outcome-as-service',
  'expose-api-cli-mcp',
  'license-or-partner',
  'open-source',
  'spinout-or-pivot',
  'retain-internal-leverage',
]);

/**
 * Recommendations that change portfolio allocation or company direction.
 * They can be proposed with evidence but never enacted by this registry.
 */
export const HIGH_CONSEQUENCE_RECOMMENDATIONS = Object.freeze([
  'new-product-line',
  'icp-or-packaging-change',
  'open-source',
  'spinout-or-pivot',
]);

export function registryPath() {
  return resolve(
    dirname(fileURLToPath(import.meta.url)),
    'company-assets-registry.json'
  );
}

export function loadRegistry(path = registryPath()) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function registryDigest(registry) {
  return createHash('sha256').update(JSON.stringify(registry)).digest('hex');
}

/**
 * Project an existing capability/benchmark/commissioning record into a
 * canonical CompanyAsset. The projection re-points at the source registry
 * instead of copying mutable state, so the source of truth stays singular.
 */
export function projectCompanyAsset(source) {
  if (!isRecord(source)) throw new Error('source record must be an object');
  requireString(source.id, 'source.id');
  requireString(source.sourceRegistry, 'source.sourceRegistry');
  requireString(source.owner, 'source.owner');
  if (!ASSET_CLASSES.includes(source.assetClass)) {
    throw new Error(
      `source.assetClass must be one of ${ASSET_CLASSES.join('|')}`
    );
  }
  requireString(source.version, 'source.version');
  return {
    schema: COMPANY_ASSET_SCHEMA,
    id: source.id,
    assetClass: source.assetClass,
    owner: source.owner,
    version: source.version,
    sourceRegistry: source.sourceRegistry,
    sourceRef: source.sourceRef ?? source.id,
    dependencies: source.dependencies ?? [],
    maturity: source.maturity ?? 'unknown',
    internalValue: normalizeValueEstimate(source.internalValue),
    externalOptionValue: normalizeValueEstimate(source.externalOptionValue),
  };
}

function normalizeValueEstimate(value) {
  if (!isRecord(value)) {
    return { basis: 'unknown', certainty: 'unknown' };
  }
  return {
    basis: requireString(value.basis, 'value.basis'),
    certainty: ['high', 'medium', 'low', 'unknown'].includes(value.certainty)
      ? value.certainty
      : 'unknown',
    hypothesis: value.hypothesis === true,
  };
}

/**
 * Normalize a raw observation into the JOV-5916 canonical evidence shape:
 * stable semantic signature (for dedup), provenance, class, and weight.
 * The same real-world behavior must converge on one signature.
 */
export function normalizeSignal(signal) {
  if (!isRecord(signal)) throw new Error('signal must be an object');
  if (!SIGNAL_CLASSES.includes(signal.class)) {
    throw new Error(`signal.class must be one of ${SIGNAL_CLASSES.join('|')}`);
  }
  requireString(signal.summary, 'signal.summary');
  requireString(signal.provenance, 'signal.provenance');
  requireIsoTimestamp(signal.observedAt, 'signal.observedAt');
  const signature = semanticSignature(signal);
  return {
    class: signal.class,
    summary: signal.summary,
    provenance: signal.provenance,
    observedAt: signal.observedAt,
    subject: signal.subject ?? null,
    semanticSignature: signature,
    evidentiaryWeight: SIGNAL_WEIGHTS[signal.class],
    founderHypothesisOnly: signal.class === 'founder-observation',
    canonicalLifecycle: 'JOV-5916',
  };
}

/**
 * Stable dedup key: class + normalized subject + normalized summary stem.
 * Whitespace/case/punctuation differences must not fork an opportunity.
 */
export function semanticSignature(signal) {
  const subject = String(signal.subject ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, ' ')
    .trim();
  const stem = String(signal.summary ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, ' ')
    .trim()
    .split(' ')
    .slice(0, 12)
    .join(' ');
  return createHash('sha256')
    .update(`${signal.class}|${subject}|${stem}`)
    .digest('hex')
    .slice(0, 24);
}

/**
 * Match a normalized signal to an existing opportunity (dedup) or propose a
 * new one. One observation cannot create backlog spam: equal signatures
 * attach as additional evidence on the same opportunity.
 */
export function matchSignal(signal, opportunities) {
  const normalized = normalizeSignal(signal);
  if (!Array.isArray(opportunities)) {
    throw new Error('opportunities must be an array');
  }
  const existing = opportunities.find(
    opportunity =>
      !TERMINAL_STAGES.has(opportunity.stage) &&
      (opportunity.signalSignatures ?? []).includes(
        normalized.semanticSignature
      )
  );
  if (existing) {
    return { disposition: 'attach', opportunityId: existing.id, normalized };
  }
  return { disposition: 'new-opportunity', normalized };
}

/**
 * A high-consequence recommendation (new line, packaging change, open
 * source, pivot) requires certified comparable expected-value evidence
 * before it may be enacted. This registry only ever *recommends*.
 */
export function requiresGovernedCertification(opportunity) {
  if (!isRecord(opportunity)) return true;
  return HIGH_CONSEQUENCE_RECOMMENDATIONS.includes(
    opportunity.recommendation?.type
  );
}

/**
 * Enact gate: returns true only when a high-consequence recommendation
 * carries certified evidence (comparable EV, downside, reversibility,
 * capacity impact) AND a certified outcome receipt. The registry can never
 * self-enact a pivot from novelty or a single model forecast.
 */
export function canEnactRecommendation(opportunity) {
  if (!requiresGovernedCertification(opportunity)) return true;
  const evidence = opportunity.recommendation?.evidence;
  return (
    opportunity.stage === 'certified-outcome' &&
    isRecord(evidence) &&
    evidence.comparableExpectedValue === true &&
    evidence.downsideAssessed === true &&
    evidence.reversibilityAssessed === true &&
    evidence.capacityImpactAssessed === true &&
    evidence.certifiedOutcomeReceipt === true
  );
}

/**
 * Standalone-product capacity requires explicit success, spend, WIP, and
 * kill thresholds — no silent allocation.
 */
export function canAllocateStandaloneCapacity(opportunity) {
  const cap = opportunity?.capacity;
  return (
    isRecord(cap) &&
    typeof cap.successThreshold === 'string' &&
    cap.successThreshold.length > 0 &&
    typeof cap.spendCap === 'string' &&
    cap.spendCap.length > 0 &&
    typeof cap.wipCap === 'string' &&
    cap.wipCap.length > 0 &&
    typeof cap.killCriteria === 'string' &&
    cap.killCriteria.length > 0
  );
}

/**
 * Ovi projection: surface only opportunities where founder judgment has
 * higher expected value than another autonomous evidence-gathering step —
 * i.e. a decision is actually required (certify test, reject, modify, hold,
 * or request evidence). Routine accumulation stays out of the inbox.
 */
export function oviProjection(registry) {
  validateAssetRegistry(registry);
  return registry.opportunities
    .filter(opportunity => isDecisionWorthy(opportunity))
    .map(opportunity => ({
      opportunityId: opportunity.id,
      assets: opportunity.assets,
      observedSignal: opportunity.observedSignal,
      internalValue: opportunity.internalValue,
      externalHypothesis: opportunity.externalHypothesis,
      expectedEconomics: opportunity.expectedEconomics,
      confidence: opportunity.confidence,
      cheapestTest: opportunity.cheapestTest,
      capacityRequested: opportunity.capacity?.wipCap ?? 'none',
      cannibalizationRisk: opportunity.cannibalizationRisk,
      recommendation: opportunity.recommendation?.type,
      actions: [
        'certify-test',
        'reject',
        'modify',
        'hold-as-option',
        'request-more-evidence',
      ],
    }));
}

function isDecisionWorthy(opportunity) {
  if (TERMINAL_STAGES.has(opportunity.stage)) return false;
  if (opportunity.stage === 'signal' || opportunity.stage === 'asset-match') {
    return false;
  }
  // Founder judgment adds value once a hypothesis exists with a proposed
  // cheapest test or a high-consequence recommendation is on the table.
  return (
    opportunity.requiresFounderDecision === true ||
    requiresGovernedCertification(opportunity) ||
    opportunity.stage === 'bounded-allocation'
  );
}

function validateValueEstimate(value, field) {
  if (!isRecord(value)) throw new Error(`${field} must be an object`);
  requireString(value.basis, `${field}.basis`);
  if (!['high', 'medium', 'low', 'unknown'].includes(value.certainty)) {
    throw new Error(`${field}.certainty must be high|medium|low|unknown`);
  }
}

function validateAsset(asset, field, combinationIds) {
  requireString(asset.id, `${field}.id`);
  if (!ASSET_CLASSES.includes(asset.assetClass)) {
    throw new Error(
      `${field}.assetClass must be one of ${ASSET_CLASSES.join('|')}`
    );
  }
  requireString(asset.owner, `${field}.owner`);
  requireString(asset.version, `${field}.version`);
  requireString(asset.sourceRegistry, `${field}.sourceRegistry`);
  if (
    !Array.isArray(asset.dependencies) ||
    asset.dependencies.some(d => typeof d !== 'string' || d.length === 0)
  ) {
    throw new Error(`${field}.dependencies must be an array of strings`);
  }
  requireString(asset.maturity, `${field}.maturity`);
  validateValueEstimate(asset.internalValue, `${field}.internalValue`);
  validateValueEstimate(
    asset.externalOptionValue,
    `${field}.externalOptionValue`
  );
  requireStringArray(asset.monetizationForms, `${field}.monetizationForms`);
  for (const form of asset.monetizationForms) {
    if (!MONETIZATION_FORMS.includes(form)) {
      throw new Error(`${field}.monetizationForms unknown form ${form}`);
    }
  }
  if (asset.assetClass === 'feature-combination') {
    if (!Array.isArray(asset.components) || asset.components.length < 2) {
      throw new Error(
        `${field}.components must list at least two component assets`
      );
    }
    for (const component of asset.components) {
      if (!combinationIds.has(component)) {
        throw new Error(
          `${field}.components references unknown asset ${component}`
        );
      }
    }
  }
}

function validateCombination(combination, field, assetIds) {
  requireString(combination.id, `${field}.id`);
  if (
    !Array.isArray(combination.components) ||
    combination.components.length < 2
  ) {
    throw new Error(`${field}.components must list at least two assets`);
  }
  for (const component of combination.components) {
    if (!assetIds.has(component)) {
      throw new Error(
        `${field}.components references unknown asset ${component}`
      );
    }
  }
  requireString(combination.candidateProduct, `${field}.candidateProduct`);
  requireString(
    combination.minimumMissingCapability,
    `${field}.minimumMissingCapability`
  );
  if (typeof combination.relabelingCanTestDemand !== 'boolean') {
    throw new Error(`${field}.relabelingCanTestDemand must be boolean`);
  }
}

function validateOpportunity(opportunity, field, assetIds) {
  requireString(opportunity.id, `${field}.id`);
  if (!OPPORTUNITY_STAGES.includes(opportunity.stage)) {
    throw new Error(
      `${field}.stage must be one of ${OPPORTUNITY_STAGES.join('|')}`
    );
  }
  requireString(opportunity.observedSignal, `${field}.observedSignal`);
  if (!SIGNAL_CLASSES.includes(opportunity.signalClass)) {
    throw new Error(`${field}.signalClass must be a known signal class`);
  }
  requireStringArray(opportunity.signalSignatures, `${field}.signalSignatures`);
  requireStringArray(opportunity.assets, `${field}.assets`);
  for (const asset of opportunity.assets) {
    if (!assetIds.has(asset)) {
      throw new Error(`${field}.assets references unknown asset ${asset}`);
    }
  }
  validateValueEstimate(opportunity.internalValue, `${field}.internalValue`);
  if (!isRecord(opportunity.externalHypothesis)) {
    throw new Error(`${field}.externalHypothesis missing`);
  }
  requireString(
    opportunity.externalHypothesis.buyer,
    `${field}.externalHypothesis.buyer`
  );
  requireString(
    opportunity.externalHypothesis.problem,
    `${field}.externalHypothesis.problem`
  );
  requireString(opportunity.cheapestTest, `${field}.cheapestTest`);
  if (!VALIDATION_TESTS.includes(opportunity.cheapestTest)) {
    throw new Error(
      `${field}.cheapestTest must be one of ${VALIDATION_TESTS.join('|')}`
    );
  }
  if (!isRecord(opportunity.capacity)) {
    throw new Error(`${field}.capacity missing`);
  }
  requireString(
    opportunity.capacity.successThreshold,
    `${field}.capacity.successThreshold`
  );
  requireString(
    opportunity.capacity.killCriteria,
    `${field}.capacity.killCriteria`
  );
  requireString(opportunity.confidence, `${field}.confidence`);
  requireString(
    opportunity.cannibalizationRisk,
    `${field}.cannibalizationRisk`
  );
  if (!isRecord(opportunity.recommendation)) {
    throw new Error(`${field}.recommendation missing`);
  }
  if (!RECOMMENDATION_TYPES.includes(opportunity.recommendation.type)) {
    throw new Error(
      `${field}.recommendation.type must be one of ${RECOMMENDATION_TYPES.join('|')}`
    );
  }
  if (
    TERMINAL_STAGES.has(opportunity.stage) &&
    (opportunity.stage === 'kill' || opportunity.stage === 'pause') &&
    typeof opportunity.rejectionReason !== 'string'
  ) {
    throw new Error(
      `${field}.rejectionReason required so rejected/expired opportunities calibrate future scoring`
    );
  }
}

/**
 * Validate the whole registry. Fails closed on schema mismatch; a second
 * evidence ledger or an auto-build queue is a structural violation.
 */
export function validateAssetRegistry(registry) {
  if (!isRecord(registry)) throw new Error('registry must be an object');
  if (registry.schema !== ASSET_REGISTRY_SCHEMA) {
    throw new Error(`schema must be ${ASSET_REGISTRY_SCHEMA}`);
  }
  requireString(registry.issue, 'registry.issue');
  requireIsoTimestamp(registry.auditedAt, 'registry.auditedAt');
  if (registry.evidenceLifecycleIssue !== 'JOV-5916') {
    throw new Error('registry.evidenceLifecycleIssue must be JOV-5916');
  }
  if (registry.secondLedger === true) {
    throw new Error('registry must not create a second source of truth');
  }
  if (registry.autoBuildQueue === true) {
    throw new Error('registry must not be an automatic build queue');
  }
  const assetIds = new Set();
  if (!Array.isArray(registry.assets) || registry.assets.length === 0) {
    throw new Error('registry.assets must be a non-empty array');
  }
  registry.assets.forEach(asset => {
    requireString(asset.id, 'asset.id');
    assetIds.add(asset.id);
  });
  registry.assets.forEach((asset, i) =>
    validateAsset(asset, `assets[${i}]`, assetIds)
  );
  const combinations = registry.featureCombinations ?? [];
  combinations.forEach((combination, i) =>
    validateCombination(combination, `featureCombinations[${i}]`, assetIds)
  );
  if (!Array.isArray(registry.opportunities)) {
    throw new Error('registry.opportunities must be an array');
  }
  const seenSignatures = new Set();
  registry.opportunities.forEach((opportunity, i) => {
    validateOpportunity(opportunity, `opportunities[${i}]`, assetIds);
    for (const signature of opportunity.signalSignatures) {
      if (seenSignatures.has(signature)) {
        throw new Error(
          `signal signature ${signature} claimed by two opportunities: signals must converge`
        );
      }
      seenSignatures.add(signature);
    }
  });
  // Revenue-critical precedence: no opportunity may preempt a declared
  // revenue blocker without an explicit challenger allocation record.
  requireStringArray(
    registry.revenuePathBlockers,
    'registry.revenuePathBlockers'
  );
  for (const opportunity of registry.opportunities) {
    if (
      opportunity.preemptsRevenueBlocker === true &&
      opportunity.challengerAllocation == null
    ) {
      throw new Error(
        `opportunity ${opportunity.id} preempts a revenue blocker without an explicit challenger allocation`
      );
    }
  }
  return true;
}
