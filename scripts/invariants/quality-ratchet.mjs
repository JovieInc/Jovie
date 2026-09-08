#!/usr/bin/env node
// JOV-INV-027: continuous quality ratchet. canon/invariants.jsonl stays the
// sole authority ledger; canon/quality-contracts.jsonl is the versioned
// QualityContract registry it governs. This pure validator enforces the
// contract shape and the company responsiveness defaults inside the existing
// invariant validation process. It adds no service, polling loop, LLM judge,
// API call, workflow, required context, or CI job.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const QUALITY_RATCHET_INVARIANT_ID = 'JOV-INV-027';
export const QUALITY_RATCHET_SCHEMA = 'jovie-quality-ratchet/v1';
export const QUALITY_CONTRACTS_PATH = 'canon/quality-contracts.jsonl';
export const QUALITY_CONTRACTS_SCHEMA = 'jovie-quality-contracts/v1';
export const QUALITY_CONTRACT_SCHEMA = 'jovie-quality-contract/v1';

const DEFAULT_REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));

export const QUALITY_DIMENSIONS = Object.freeze([
  'responsiveness',
  'correctness',
  'reliability',
  'usability',
  'accessibility',
  'consistency',
  'trustSafety',
  'costEfficiency',
]);

// Initial company defaults from the JOV-5943 invariant. A contract may be
// stricter; looser requires an explicit, evidence-backed, expiring exception.
export const RESPONSIVENESS_DEFAULTS = Object.freeze({
  localInputAcknowledgement: Object.freeze({
    targetMs: 16,
    floorMs: 50,
    note: 'next rendered frame where possible',
  }),
  toolbarContextMenuOpen: Object.freeze({
    targetMs: 100,
    floorMs: 100,
    percentile: 'p95',
    noNetworkForInitialVisualResponse: true,
  }),
  selectionPressNavigationFeedback: Object.freeze({
    targetMs: 50,
    floorMs: 50,
    noDeadClick: true,
  }),
  conversationMessageEcho: Object.freeze({ targetMs: 50, floorMs: 50 }),
  conversationActiveState: Object.freeze({ targetMs: 100, floorMs: 100 }),
  conversationFirstUsefulOutput: Object.freeze({
    targetMs: 750,
    floorMs: 2000,
    targetPercentile: 'p50',
    floorPercentile: 'p95',
    eligiblePathsOnly: true,
    progressRequiredWhenDependencyBound: true,
  }),
  animations: Object.freeze({
    sustainDeviceRefreshRate: true,
    noAvoidableMainThreadStalls: true,
  }),
  noUnboundedWait: true,
});

export const CLOSED_LOOP_STEPS = Object.freeze([
  'observe',
  'compare-floor-and-baseline',
  'attribute',
  'estimate-impact',
  'hold-or-rollback-on-floor-breach',
  'prioritized-work-on-baseline-regression',
  'scoped-rollout-certification',
  'ratchet-only-on-material-evidence',
  'preserve-before-after-receipt',
]);

const CANDIDATE_SOURCES = Object.freeze([
  'observed-friction',
  'tail-latency',
  'failures',
  'support-interactions',
  'design-system-deviations',
  'human-corrections',
  'cost-waste',
  'benchmark-gaps',
]);

const RANK_BY = Object.freeze([
  'expected-value',
  'evidence-strength',
  'confidence',
  'implementation-cost',
  'blast-radius',
  'reversibility',
]);

const REJECT_WHEN = Object.freeze([
  'negligible-delta',
  'unmeasurable',
  'duplicative',
  'dimension-trade-off',
]);

const REQUIRES_BEFORE_EXECUTION = Object.freeze([
  'falsifiable-hypothesis',
  'baseline',
  'success-threshold',
  'guardrails',
  'rollback',
]);

const PULL_OUTCOMES = Object.freeze(['certify-ratchet', 'iterate', 'revert']);

const PULL_CONTROLS = Object.freeze(['cooldowns', 'diminishing-returns']);

const REQUIRED_CONTRACT_FIELDS = Object.freeze([
  'schema',
  'id',
  'version',
  'capability',
  'surface',
  'interactionClass',
  'criticalUserJourney',
  'applicability',
  'dimensions',
  'lastKnownGood',
  'regression',
  'ownership',
  'certification',
  'exception',
  'links',
]);

const REQUIRED_APPLICABILITY_FIELDS = Object.freeze([
  'segment',
  'deviceClass',
  'region',
  'dependencyEnvelope',
  'riskTier',
]);

const REQUIRED_OBSERVED_FIELDS = Object.freeze([
  'value',
  'percentile',
  'window',
  'sampleSize',
  'confidence',
]);

const REQUIRED_EXCEPTION_FIELDS = Object.freeze([
  'owner',
  'rationale',
  'scope',
  'compensatingControls',
  'expiry',
]);

const REQUIRED_LINK_FIELDS = Object.freeze([
  'traces',
  'sessions',
  'evals',
  'rolloutEvidence',
  'incidents',
  'remediation',
]);

function hasText(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function sameSet(actual, expected) {
  return (
    Array.isArray(actual) &&
    actual.length === expected.length &&
    expected.every(item => actual.includes(item))
  );
}

function utcDay(value) {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return new Date(
      Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate())
    );
  }
  if (!hasText(value)) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const day = new Date(`${match[0]}T00:00:00Z`);
  return Number.isNaN(day.getTime()) ? null : day;
}

function textFor(path, repoRoot, files) {
  if (Object.hasOwn(files, path)) return files[path];
  return readFileSync(resolve(repoRoot, path), 'utf8');
}

export function qualityRatchetInvariant(registry) {
  if (!registry || !Array.isArray(registry.invariants)) return null;
  return (
    registry.invariants.find(
      item => item?.id === QUALITY_RATCHET_INVARIANT_ID
    ) ?? null
  );
}

export function readQualityContractRegistry({
  repoRoot = DEFAULT_REPO_ROOT,
  files = {},
} = {}) {
  const rows = textFor(QUALITY_CONTRACTS_PATH, repoRoot, files)
    .split(/\r?\n/)
    .filter(Boolean)
    .map(line => JSON.parse(line));
  const [metadata, ...contracts] = rows;
  return { ...metadata, contracts };
}

/** Validate the JOV-INV-027 policy value recorded in canon/invariants.jsonl. */
export function validateQualityRatchetPolicy(registry) {
  const invariant = qualityRatchetInvariant(registry);
  if (!invariant) {
    return [
      `quality-ratchet-missing: ${QUALITY_RATCHET_INVARIANT_ID} is absent from canon/invariants.jsonl`,
    ];
  }
  const errors = [];
  if (invariant.lifecycle?.state !== 'adopted') {
    errors.push(
      `quality-ratchet-not-adopted: ${QUALITY_RATCHET_INVARIANT_ID} must be adopted`
    );
  }
  const policy = invariant.policy?.value;
  if (policy?.schema !== QUALITY_RATCHET_SCHEMA) {
    errors.push(
      `quality-ratchet-schema: policy.value.schema must be ${QUALITY_RATCHET_SCHEMA}`
    );
  }
  if (policy?.registry !== QUALITY_CONTRACTS_PATH) {
    errors.push(
      `quality-ratchet-registry: policy.value.registry must be ${QUALITY_CONTRACTS_PATH}`
    );
  }
  if (policy?.contractSchema !== QUALITY_CONTRACT_SCHEMA) {
    errors.push(
      `quality-ratchet-contract-schema: policy.value.contractSchema must be ${QUALITY_CONTRACT_SCHEMA}`
    );
  }
  if (!sameSet(policy?.dimensions, QUALITY_DIMENSIONS)) {
    errors.push(
      `quality-ratchet-dimensions: policy must cover ${QUALITY_DIMENSIONS.join(', ')}`
    );
  }
  if (
    stable(policy?.responsivenessDefaults) !== stable(RESPONSIVENESS_DEFAULTS)
  ) {
    errors.push(
      'quality-ratchet-defaults: responsiveness defaults drifted from the company floor'
    );
  }
  if (policy?.tailLatencyFirstClass !== true) {
    errors.push('quality-ratchet-tail: tail latency must be first-class');
  }
  if (policy?.dashboardAloneInsufficient !== true) {
    errors.push(
      'quality-ratchet-closure: a dashboard alone does not satisfy the invariant'
    );
  }
  if (!sameSet(policy?.closedLoop, CLOSED_LOOP_STEPS)) {
    errors.push(
      `quality-ratchet-closed-loop: steps must be ${CLOSED_LOOP_STEPS.join(', ')}`
    );
  }
  const pull = policy?.autonomousPull ?? {};
  if (pull.noHigherValueWorkRequired !== true) {
    errors.push(
      'quality-ratchet-pull: autonomous pull requires an empty higher-value objective queue'
    );
  }
  /** @type {ReadonlyArray<readonly [string, ReadonlyArray<string>]>} */
  const pullSets = [
    ['candidateSources', CANDIDATE_SOURCES],
    ['rankBy', RANK_BY],
    ['rejectWhen', REJECT_WHEN],
    ['requiresBeforeExecution', REQUIRES_BEFORE_EXECUTION],
    ['outcomes', PULL_OUTCOMES],
    ['controls', PULL_CONTROLS],
  ];
  for (const [field, expected] of pullSets) {
    if (!sameSet(pull[field], expected)) {
      errors.push(
        `quality-ratchet-pull: ${field} must be ${expected.join(', ')}`
      );
    }
  }
  if (policy?.certification?.machine !== true) {
    errors.push(
      'quality-ratchet-certification: machine certification required'
    );
  }
  if (
    !sameSet(policy?.certification?.receipts, ['ovi', 'certification-registry'])
  ) {
    errors.push(
      'quality-ratchet-certification: receipts must be preserved in ovi and certification-registry'
    );
  }
  if (policy?.exceptions?.requireExpiry !== true) {
    errors.push('quality-ratchet-exceptions: exceptions must expire');
  }
  if (policy?.optimizationContract?.class !== 'non-product') {
    errors.push(
      'quality-ratchet-optimization: governance machinery must declare a non-product optimization exception'
    );
  }
  return errors;
}

function validateObserved(contract, dimension, observed, errors) {
  const label = `${contract?.id || '<unknown>'}.${dimension}`;
  for (const field of REQUIRED_OBSERVED_FIELDS) {
    if (observed?.[field] === undefined) {
      errors.push(`${label}: observed missing ${field}`);
    }
  }
  if (typeof observed?.sampleSize !== 'number' || observed.sampleSize < 0) {
    errors.push(`${label}: observed.sampleSize must be a non-negative number`);
  }
  if (observed?.value === null && observed?.sampleSize !== 0) {
    errors.push(
      `${label}: an unmeasured value requires sampleSize 0 (uncalibrated seed)`
    );
  }
  if (typeof observed?.value === 'number' && observed?.sampleSize === 0) {
    errors.push(`${label}: a measured value requires a non-zero sampleSize`);
  }
}

function validateException(contract, now, errors) {
  const exception = contract.exception;
  if (exception === null || exception === undefined) return false;
  const label = `${contract.id || '<unknown>'}.exception`;
  for (const field of REQUIRED_EXCEPTION_FIELDS) {
    if (
      exception[field] === undefined ||
      (typeof exception[field] === 'string' && !hasText(exception[field]))
    ) {
      errors.push(`${label}: missing ${field}`);
    }
  }
  const expiry = utcDay(exception.expiry);
  if (!expiry) {
    errors.push(`${label}: expiry must be an ISO date`);
  } else if (expiry <= now) {
    errors.push(`${label}: exception expired on ${exception.expiry}`);
  }
  return errors.every(error => !error.startsWith(label));
}

function validateContract(contract, policy, now, errors) {
  const id = contract?.id || '<unknown>';
  for (const field of REQUIRED_CONTRACT_FIELDS) {
    if (contract?.[field] === undefined) {
      errors.push(`${id}: missing ${field}`);
    }
  }
  if (contract?.schema !== QUALITY_CONTRACT_SCHEMA) {
    errors.push(`${id}: schema must be ${QUALITY_CONTRACT_SCHEMA}`);
  }
  if (!Number.isInteger(contract?.version)) {
    errors.push(`${id}: version must be an integer`);
  }
  for (const field of REQUIRED_APPLICABILITY_FIELDS) {
    if (!hasText(contract?.applicability?.[field])) {
      errors.push(`${id}: applicability missing ${field}`);
    }
  }
  const dimensions = contract?.dimensions ?? {};
  for (const dimension of QUALITY_DIMENSIONS) {
    const entry = dimensions[dimension];
    if (!entry) {
      errors.push(`${id}: missing required quality dimension ${dimension}`);
      continue;
    }
    if (
      !Array.isArray(entry.measurementSources) ||
      entry.measurementSources.length === 0
    ) {
      errors.push(`${id}.${dimension}: measurementSources must be non-empty`);
    }
    if (entry.target === undefined && dimension !== 'responsiveness') {
      errors.push(`${id}.${dimension}: missing target`);
    }
    if (entry.hardFloor === undefined && dimension !== 'responsiveness') {
      errors.push(`${id}.${dimension}: missing hardFloor`);
    }
    validateObserved(contract, dimension, entry.observed, errors);
  }
  const exceptionValid = validateException(contract, now, errors);
  const responsiveness = dimensions.responsiveness;
  if (responsiveness) {
    const defaultKey = responsiveness.defaultKey;
    const companyDefault = policy?.responsivenessDefaults?.[defaultKey];
    if (defaultKey !== undefined && !companyDefault) {
      errors.push(`${id}: unknown responsiveness default ${defaultKey}`);
    }
    if (
      typeof responsiveness.hardFloorMs !== 'number' ||
      responsiveness.hardFloorMs <= 0
    ) {
      errors.push(`${id}.responsiveness: hardFloorMs must be a positive ms`);
    }
    if (
      typeof responsiveness.targetMs !== 'number' ||
      responsiveness.targetMs <= 0
    ) {
      errors.push(`${id}.responsiveness: targetMs must be a positive ms`);
    }
    if (companyDefault && typeof responsiveness.hardFloorMs === 'number') {
      if (
        responsiveness.hardFloorMs > companyDefault.floorMs &&
        !exceptionValid
      ) {
        errors.push(
          `${id}: floor ${responsiveness.hardFloorMs}ms is looser than the company default ${companyDefault.floorMs}ms without an expiring exception`
        );
      }
      if (
        typeof responsiveness.targetMs === 'number' &&
        typeof companyDefault.targetMs === 'number' &&
        responsiveness.targetMs > companyDefault.targetMs &&
        !exceptionValid
      ) {
        errors.push(
          `${id}: target ${responsiveness.targetMs}ms is looser than the company default ${companyDefault.targetMs}ms without an expiring exception`
        );
      }
    }
  }
  if (
    !hasText(contract?.lastKnownGood?.baseline) ||
    !hasText(contract?.lastKnownGood?.certifiedAt) ||
    !hasText(contract?.lastKnownGood?.evidence)
  ) {
    errors.push(
      `${id}: lastKnownGood requires baseline, certifiedAt, evidence`
    );
  }
  if (
    !hasText(contract?.regression?.severity) ||
    !hasText(contract?.regression?.containmentPolicy)
  ) {
    errors.push(`${id}: regression requires severity and containmentPolicy`);
  }
  if (
    !hasText(contract?.ownership?.capabilityAgent) ||
    contract?.ownership?.governance !== 'Summer'
  ) {
    errors.push(
      `${id}: ownership requires a capabilityAgent and Summer governance`
    );
  }
  if (!hasText(contract?.certification?.machine)) {
    errors.push(`${id}: certification.machine is required`);
  }
  if (contract?.certification?.human === undefined) {
    errors.push(`${id}: certification.human is required`);
  }
  for (const field of REQUIRED_LINK_FIELDS) {
    if (contract?.links?.[field] === undefined) {
      errors.push(`${id}: links missing ${field}`);
    }
  }
}

/** Validate the QualityContract registry against the JOV-INV-027 policy. */
export function validateQualityContracts(
  contractRegistry,
  registry,
  options = {}
) {
  const now = utcDay(options.now ?? new Date()) ?? new Date();
  const errors = [];
  if (contractRegistry?.schema !== QUALITY_CONTRACTS_SCHEMA) {
    errors.push(
      `quality-contracts-schema: header schema must be ${QUALITY_CONTRACTS_SCHEMA}`
    );
  }
  if (contractRegistry?.invariantId !== QUALITY_RATCHET_INVARIANT_ID) {
    errors.push(
      `quality-contracts-authority: header invariantId must be ${QUALITY_RATCHET_INVARIANT_ID}`
    );
  }
  if (contractRegistry?.authority?.owner !== 'Summer') {
    errors.push('quality-contracts-authority: owner must be Summer');
  }
  const contracts = Array.isArray(contractRegistry?.contracts)
    ? contractRegistry.contracts
    : [];
  if (contracts.length === 0) {
    errors.push('quality-contracts-empty: at least one contract is required');
    return errors;
  }
  const policy = qualityRatchetInvariant(registry)?.policy?.value;
  const seen = new Set();
  const boundDefaults = new Set();
  for (const contract of contracts) {
    if (seen.has(contract?.id)) {
      errors.push(`${contract?.id || '<unknown>'}: duplicate contract id`);
      continue;
    }
    seen.add(contract?.id);
    validateContract(contract, policy, now, errors);
    if (contract?.dimensions?.responsiveness?.defaultKey !== undefined) {
      boundDefaults.add(contract.dimensions.responsiveness.defaultKey);
    }
  }
  // Every numeric company responsiveness default must be owned by at least
  // one registered contract; an unowned default is an ungoverned floor.
  for (const [key, companyDefault] of Object.entries(
    policy?.responsivenessDefaults ?? {}
  )) {
    if (
      typeof companyDefault?.floorMs === 'number' &&
      !boundDefaults.has(key)
    ) {
      errors.push(
        `quality-contracts-coverage: no registered contract owns the ${key} default`
      );
    }
  }
  return errors;
}

export function validateQualityRatchet(registry, options = {}) {
  return [
    ...validateQualityRatchetPolicy(registry),
    ...validateQualityContracts(
      readQualityContractRegistry(options),
      registry,
      options
    ),
  ];
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { readInvariantRegistry } = await import('./registry.mjs');
  const registry = readInvariantRegistry();
  const failures = validateQualityRatchet(registry);
  if (failures.length > 0) {
    console.error(failures.join('\n'));
    process.exit(1);
  }
  const { contracts } = readQualityContractRegistry();
  console.log(
    `${QUALITY_RATCHET_INVARIANT_ID} quality ratchet OK: ${contracts.length} contracts`
  );
}

// Production consumer binding: JOV-INV-027.
