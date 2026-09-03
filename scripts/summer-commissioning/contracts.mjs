import { readFileSync } from 'node:fs';
import { isAbsolute } from 'node:path';

import {
  assertSafeProbeId,
  digestCanonicalJson,
  isRecord,
  requireIsoTimestamp,
  requireString,
  requireStringArray,
  SAFE_CORRELATION_ID,
  SAFE_GIT_SHA,
  SAFE_SHA256,
} from './receipt-trust.mjs';

export const REGISTRY_SCHEMA = 'jovie.summer-commissioning.registry/v1';
export const EVALUATION_RECEIPT_SCHEMA =
  'jovie.summer-commissioning.evaluation-receipt/v1';
export const REPORT_SCHEMA = 'jovie.summer-commissioning.report/v1';

const IMPLEMENTATION_STATES = new Set([
  'already_works',
  'in_flight',
  'missing',
  'conflicting',
  'obsolete',
]);
const READINESS_STATUSES = new Set([
  'untested',
  'blocked',
  'failing',
  'passing',
  'degraded',
  'certified',
  'stale',
]);
const ASSERTION_KINDS = new Set([
  'file_exists',
  'file_contains',
  'file_not_contains',
]);

function assertSafeRelativePath(value, field) {
  requireString(value, field);
  if (isAbsolute(value) || value.split(/[\\/]/u).includes('..')) {
    throw new Error(`${field} must stay inside the repository`);
  }
}

export function loadRegistry(registryPath) {
  return JSON.parse(readFileSync(registryPath, 'utf8'));
}

export function validateRegistry(registry) {
  if (!isRecord(registry)) throw new Error('registry must be an object');
  if (registry.schema !== REGISTRY_SCHEMA) {
    throw new Error(`registry.schema must be ${REGISTRY_SCHEMA}`);
  }
  requireString(registry.registryVersion, 'registry.registryVersion');
  requireString(
    registry.certificationContract,
    'registry.certificationContract'
  );
  requireString(registry.issue, 'registry.issue');
  requireString(registry.intendedEnvironment, 'registry.intendedEnvironment');
  requireIsoTimestamp(registry.auditedAt, 'registry.auditedAt');
  if (!isRecord(registry.sourceSnapshot)) {
    throw new Error('registry.sourceSnapshot must be an object');
  }
  requireString(
    registry.sourceSnapshot.repository,
    'registry.sourceSnapshot.repository'
  );
  requireString(registry.sourceSnapshot.ref, 'registry.sourceSnapshot.ref');
  if (!SAFE_GIT_SHA.test(registry.sourceSnapshot.sha ?? '')) {
    throw new Error('registry.sourceSnapshot.sha must be an exact git SHA');
  }
  if (!Array.isArray(registry.trustedAttestationKeyFingerprints)) {
    throw new Error(
      'registry.trustedAttestationKeyFingerprints must be an array'
    );
  }
  const trustedFingerprints = new Set();
  for (const [
    index,
    fingerprint,
  ] of registry.trustedAttestationKeyFingerprints.entries()) {
    if (!SAFE_SHA256.test(fingerprint ?? '')) {
      throw new Error(
        `registry.trustedAttestationKeyFingerprints[${index}] must be a SHA-256 digest`
      );
    }
    if (trustedFingerprints.has(fingerprint)) {
      throw new Error(
        `duplicate trusted attestation key fingerprint ${fingerprint}`
      );
    }
    trustedFingerprints.add(fingerprint);
  }
  if (
    !Array.isArray(registry.capabilities) ||
    registry.capabilities.length === 0
  ) {
    throw new Error('registry.capabilities must be a non-empty array');
  }

  const capabilityIds = new Set();
  const probeIds = new Set();
  for (const [index, capability] of registry.capabilities.entries()) {
    const field = `registry.capabilities[${index}]`;
    if (!isRecord(capability)) throw new Error(`${field} must be an object`);
    const id = requireString(capability.id, `${field}.id`);
    if (capabilityIds.has(id)) throw new Error(`duplicate capability id ${id}`);
    capabilityIds.add(id);
    requireString(capability.capability, `${field}.capability`);
    requireStringArray(capability.canonicalPath, `${field}.canonicalPath`);
    if (!IMPLEMENTATION_STATES.has(capability.implementationState)) {
      throw new Error(`${field}.implementationState is invalid`);
    }
    if (!READINESS_STATUSES.has(capability.status)) {
      throw new Error(`${field}.status is invalid`);
    }
    if (typeof capability.critical !== 'boolean') {
      throw new Error(`${field}.critical must be boolean`);
    }
    requireString(
      capability.invalidationCondition,
      `${field}.invalidationCondition`
    );
    if (!isRecord(capability.ownerRemediation)) {
      throw new Error(`${field}.ownerRemediation must be an object`);
    }
    requireString(
      capability.ownerRemediation.owner,
      `${field}.ownerRemediation.owner`
    );
    requireStringArray(
      capability.ownerRemediation.refs,
      `${field}.ownerRemediation.refs`
    );
    if (!Array.isArray(capability.evidence)) {
      throw new Error(`${field}.evidence must be an array`);
    }
    capability.evidence.forEach((evidence, evidenceIndex) => {
      const evidenceField = `${field}.evidence[${evidenceIndex}]`;
      if (!isRecord(evidence)) {
        throw new Error(`${evidenceField} must be an object`);
      }
      requireString(evidence.kind, `${evidenceField}.kind`);
      requireString(evidence.ref, `${evidenceField}.ref`);
      requireString(evidence.summary, `${evidenceField}.summary`);
    });
    if (capability.lastVerified !== null) {
      requireIsoTimestamp(capability.lastVerified, `${field}.lastVerified`);
    }
    if (!isRecord(capability.probe)) {
      throw new Error(`${field}.probe must be an object`);
    }
    const probeId = assertSafeProbeId(capability.probe.id, `${field}.probe.id`);
    requireString(capability.probe.version, `${field}.probe.version`);
    if (probeIds.has(probeId)) throw new Error(`duplicate probe ID ${probeId}`);
    probeIds.add(probeId);
    requireString(capability.probe.fixture, `${field}.probe.fixture`);
    requireString(
      capability.probe.expectedState,
      `${field}.probe.expectedState`
    );
    if (capability.probe.requiresRuntimeReceipt !== true) {
      throw new Error(`${field}.probe.requiresRuntimeReceipt must be true`);
    }
    if (
      !Array.isArray(capability.probe.sourceAssertions) ||
      capability.probe.sourceAssertions.length === 0
    ) {
      throw new Error(
        `${field}.probe.sourceAssertions must be a non-empty array`
      );
    }
    for (const [
      assertionIndex,
      assertion,
    ] of capability.probe.sourceAssertions.entries()) {
      const assertionField = `${field}.probe.sourceAssertions[${assertionIndex}]`;
      if (!isRecord(assertion)) {
        throw new Error(`${assertionField} must be an object`);
      }
      if (!ASSERTION_KINDS.has(assertion.kind)) {
        throw new Error(`${assertionField}.kind is invalid`);
      }
      assertSafeRelativePath(assertion.path, `${assertionField}.path`);
      if (assertion.kind !== 'file_exists') {
        requireString(assertion.value, `${assertionField}.value`);
      }
    }
  }
  return registry;
}

export function registryDigest(registry) {
  return digestCanonicalJson(validateRegistry(registry));
}

function validateEvaluationReceipt(receipt, field) {
  if (!isRecord(receipt)) throw new Error(`${field} must be an object`);
  if (receipt.schema !== EVALUATION_RECEIPT_SCHEMA) {
    throw new Error(`${field}.schema must be ${EVALUATION_RECEIPT_SCHEMA}`);
  }
  assertSafeProbeId(receipt.probeId, `${field}.probeId`);
  requireString(receipt.probeVersion, `${field}.probeVersion`);
  requireString(receipt.capabilityId, `${field}.capabilityId`);
  if (typeof receipt.critical !== 'boolean') {
    throw new Error(`${field}.critical must be boolean`);
  }
  requireString(receipt.fixture, `${field}.fixture`);
  requireString(receipt.expectedState, `${field}.expectedState`);
  requireString(receipt.actualState, `${field}.actualState`);
  if (!SAFE_CORRELATION_ID.test(receipt.correlationId ?? '')) {
    throw new Error(`${field}.correlationId is missing or unsafe`);
  }
  requireString(receipt.environment, `${field}.environment`);
  requireString(receipt.environmentVersion, `${field}.environmentVersion`);
  if (!SAFE_GIT_SHA.test(receipt.sourceVersion ?? '')) {
    throw new Error(`${field}.sourceVersion must be an exact git SHA`);
  }
  requireIsoTimestamp(receipt.startedAt, `${field}.startedAt`);
  requireIsoTimestamp(receipt.completedAt, `${field}.completedAt`);
  if (Date.parse(receipt.completedAt) < Date.parse(receipt.startedAt)) {
    throw new Error(`${field}.completedAt must not precede startedAt`);
  }
  if (!Number.isFinite(receipt.latencyMs) || receipt.latencyMs < 0) {
    throw new Error(`${field}.latencyMs must be a non-negative number`);
  }
  if (!['passed', 'failed'].includes(receipt.outcome)) {
    throw new Error(`${field}.outcome must be passed or failed`);
  }
  if (!Array.isArray(receipt.sourceAssertions)) {
    throw new Error(`${field}.sourceAssertions must be an array`);
  }
  receipt.sourceAssertions.forEach((assertion, index) => {
    const assertionField = `${field}.sourceAssertions[${index}]`;
    if (!isRecord(assertion)) {
      throw new Error(`${assertionField} must be an object`);
    }
    if (!ASSERTION_KINDS.has(assertion.kind)) {
      throw new Error(`${assertionField}.kind is invalid`);
    }
    assertSafeRelativePath(assertion.path, `${assertionField}.path`);
    requireString(assertion.expected, `${assertionField}.expected`);
    requireString(assertion.actual, `${assertionField}.actual`);
    if (typeof assertion.passed !== 'boolean') {
      throw new Error(`${assertionField}.passed must be boolean`);
    }
  });
  if (
    receipt.runtimeReceiptPath !== null &&
    typeof receipt.runtimeReceiptPath !== 'string'
  ) {
    throw new Error(`${field}.runtimeReceiptPath must be a string or null`);
  }
  if (
    receipt.runtimeReceiptCorrelationId !== null &&
    !SAFE_CORRELATION_ID.test(receipt.runtimeReceiptCorrelationId ?? '')
  ) {
    throw new Error(`${field}.runtimeReceiptCorrelationId is unsafe`);
  }
  if (receipt.outcome === 'passed') {
    if (
      receipt.actualState !== 'certified' ||
      receipt.failureArtifact !== null ||
      receipt.sourceAssertions.length === 0 ||
      receipt.sourceAssertions.some(assertion => assertion.passed !== true) ||
      typeof receipt.runtimeReceiptPath !== 'string' ||
      receipt.runtimeReceiptPath.trim() === '' ||
      !SAFE_CORRELATION_ID.test(receipt.runtimeReceiptCorrelationId ?? '')
    ) {
      throw new Error(`${field} passing state is inconsistent`);
    }
  } else if (!isRecord(receipt.failureArtifact)) {
    throw new Error(`${field} failed receipt needs a failure artifact`);
  } else {
    const artifact = receipt.failureArtifact;
    if (receipt.actualState === 'certified') {
      throw new Error(`${field} failed state is inconsistent`);
    }
    if (artifact.capabilityId !== receipt.capabilityId) {
      throw new Error(`${field}.failureArtifact.capabilityId mismatch`);
    }
    if (!IMPLEMENTATION_STATES.has(artifact.implementationState)) {
      throw new Error(
        `${field}.failureArtifact.implementationState is invalid`
      );
    }
    if (!READINESS_STATUSES.has(artifact.auditedStatus)) {
      throw new Error(`${field}.failureArtifact.auditedStatus is invalid`);
    }
    requireStringArray(artifact.blockers, `${field}.failureArtifact.blockers`);
    if (!isRecord(artifact.ownerRemediation)) {
      throw new Error(
        `${field}.failureArtifact.ownerRemediation must be an object`
      );
    }
    requireString(
      artifact.ownerRemediation.owner,
      `${field}.failureArtifact.ownerRemediation.owner`
    );
    requireStringArray(
      artifact.ownerRemediation.refs,
      `${field}.failureArtifact.ownerRemediation.refs`
    );
  }
  return receipt;
}

export function validateReport(report) {
  if (!isRecord(report)) throw new Error('report must be an object');
  if (report.schema !== REPORT_SCHEMA) {
    throw new Error(`report.schema must be ${REPORT_SCHEMA}`);
  }
  if (report.registrySchema !== REGISTRY_SCHEMA) {
    throw new Error(`report.registrySchema must be ${REGISTRY_SCHEMA}`);
  }
  requireString(report.certificationContract, 'report.certificationContract');
  requireString(report.registryVersion, 'report.registryVersion');
  if (!SAFE_SHA256.test(report.registryDigest ?? '')) {
    throw new Error('report.registryDigest must be a SHA-256 digest');
  }
  if (
    report.attestationKeyFingerprint !== null &&
    !SAFE_SHA256.test(report.attestationKeyFingerprint ?? '')
  ) {
    throw new Error(
      'report.attestationKeyFingerprint must be a SHA-256 digest or null'
    );
  }
  requireString(report.issue, 'report.issue');
  requireString(report.environment, 'report.environment');
  requireString(report.environmentVersion, 'report.environmentVersion');
  if (!SAFE_GIT_SHA.test(report.sourceVersion ?? '')) {
    throw new Error('report.sourceVersion must be an exact git SHA');
  }
  requireIsoTimestamp(report.generatedAt, 'report.generatedAt');
  if (typeof report.commissioned !== 'boolean') {
    throw new Error('report.commissioned must be boolean');
  }
  if (!isRecord(report.summary)) {
    throw new Error('report.summary must be an object');
  }
  if (!Array.isArray(report.receipts) || report.receipts.length === 0) {
    throw new Error('report receipts must be a non-empty array');
  }
  report.receipts.forEach((receipt, index) =>
    validateEvaluationReceipt(receipt, `report.receipts[${index}]`)
  );
  if (
    report.attestationKeyFingerprint === null &&
    report.receipts.some(receipt => receipt.outcome === 'passed')
  ) {
    throw new Error(
      'passing report receipts require an attestation key fingerprint'
    );
  }
  const uniqueProbeIds = new Set(
    report.receipts.map(receipt => receipt.probeId)
  );
  const uniqueCapabilityIds = new Set(
    report.receipts.map(receipt => receipt.capabilityId)
  );
  if (
    uniqueProbeIds.size !== report.receipts.length ||
    uniqueCapabilityIds.size !== report.receipts.length
  ) {
    throw new Error('report receipt identifiers must be unique');
  }
  if (
    report.receipts.some(
      receipt =>
        receipt.environment !== report.environment ||
        receipt.environmentVersion !== report.environmentVersion ||
        receipt.sourceVersion !== report.sourceVersion
    )
  ) {
    throw new Error('report receipt environment mismatch');
  }
  const certified = report.receipts.filter(
    receipt => receipt.actualState === 'certified'
  ).length;
  const blocking = report.receipts.filter(
    receipt => receipt.critical && receipt.outcome !== 'passed'
  ).length;
  if (
    report.summary.capabilities !== report.receipts.length ||
    report.summary.certified !== certified ||
    report.summary.blocking !== blocking ||
    report.commissioned !== (blocking === 0)
  ) {
    throw new Error('report summary does not match receipts');
  }
  return report;
}
