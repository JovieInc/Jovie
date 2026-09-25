// JOV-INV-034: executable coverage-of-coverage for critical shipping gates.
// This composes with jovie.certification/v1 and the existing Structural
// Contract required check; it is not a second certification registry.

import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const GATE_INTEGRITY_INVARIANT_ID = 'JOV-INV-034';
export const GATE_INTEGRITY_SCHEMA = 'jovie-gate-integrity/v1';
export const CERTIFICATION_CONTRACT = 'jovie.certification/v1';
export const GATE_INTEGRITY_REQUIRED_CHECK = 'ci-fast';
export const GATE_INTEGRITY_CONSUMER = 'Structural Contract';
const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));

const REQUIRED_DEFECTS = Object.freeze([
  'unreadable-contrast',
  'cross-tenant-access',
  'false-success-save',
  'duplicate-retry-effect',
  'stale-cache-after-mutation',
  'invalid-evidence-counted-green',
  'artifact-config-mismatch',
]);

const REJECTED_EVIDENCE_STATES = new Set([
  'missing',
  'skipped',
  'neutral',
  'quarantined',
  'not_applicable',
  'pending',
  'failed',
]);

function hasText(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function digest(value) {
  return `sha256:${createHash('sha256').update(stable(value)).digest('hex')}`;
}

function gatePolicy(registry) {
  return registry?.invariants?.find(
    item => item?.id === GATE_INTEGRITY_INVARIANT_ID
  )?.policy?.value;
}

export function gateIntegrityPolicyDigest(policy) {
  const unsigned = structuredClone(policy ?? {});
  delete unsigned.policyDigest;
  return digest(unsigned);
}

export function validateGateIntegrityPolicy(registry) {
  const errors = [];
  const policy = gatePolicy(registry);
  if (!policy) return [`missing:${GATE_INTEGRITY_INVARIANT_ID}`];
  if (policy.schema !== GATE_INTEGRITY_SCHEMA)
    errors.push(`schema:expected-${GATE_INTEGRITY_SCHEMA}`);
  if (policy.contract !== CERTIFICATION_CONTRACT)
    errors.push(`contract:expected-${CERTIFICATION_CONTRACT}`);
  if (policy.requiredCheck !== GATE_INTEGRITY_REQUIRED_CHECK)
    errors.push(`required-check:expected-${GATE_INTEGRITY_REQUIRED_CHECK}`);
  if (policy.consumer !== GATE_INTEGRITY_CONSUMER)
    errors.push(`consumer:expected-${GATE_INTEGRITY_CONSUMER}`);
  if (policy.unknownApplicability !== 'fail-closed')
    errors.push('unknown-applicability:must-fail-closed');
  if (!Number.isInteger(policy.evidenceMaxAgeMs) || policy.evidenceMaxAgeMs < 1)
    errors.push('evidence-max-age:positive-integer-required');
  if (policy.policyDigest !== gateIntegrityPolicyDigest(policy))
    errors.push('policy-digest:mismatch');

  const certificates = Array.isArray(policy.certificates)
    ? policy.certificates
    : [];
  const byDefect = new Map();
  for (const certificate of certificates) {
    if (byDefect.has(certificate?.defectFixture))
      errors.push(`certificate:duplicate:${certificate?.defectFixture}`);
    byDefect.set(certificate?.defectFixture, certificate);
  }
  for (const defect of REQUIRED_DEFECTS) {
    const certificate = byDefect.get(defect);
    if (!certificate) {
      errors.push(`certificate:missing:${defect}`);
      continue;
    }
    for (const field of [
      'rule',
      'detector',
      'applicabilityRule',
      'requiredCheck',
      'certificationConsumer',
      'promotionBoundary',
      'artifact',
      'configDigest',
    ]) {
      if (!hasText(certificate[field]))
        errors.push(`certificate:${defect}:missing-${field}`);
    }
    for (const state of [
      'documented',
      'implemented',
      'wired',
      'active',
      'provenBlocking',
    ]) {
      if (certificate[state] !== true)
        errors.push(`certificate:${defect}:${state}-not-proven`);
    }
    if (certificate.requiredCheck !== policy.requiredCheck)
      errors.push(`certificate:${defect}:required-check-mismatch`);
    if (certificate.certificationConsumer !== policy.consumer)
      errors.push(`certificate:${defect}:consumer-mismatch`);
    if (
      hasText(certificate.detector) &&
      !existsSync(resolve(REPO_ROOT, certificate.detector))
    )
      errors.push(`certificate:${defect}:detector-missing`);
  }
  return errors;
}

function reject(reason, certificate, input) {
  return {
    schema: GATE_INTEGRITY_SCHEMA,
    contract: CERTIFICATION_CONTRACT,
    defectFixture: certificate?.defectFixture ?? input.defectFixture ?? null,
    detector: certificate?.detector ?? null,
    gate: certificate?.requiredCheck ?? null,
    sourceSha: input.sourceSha ?? null,
    artifact: input.artifact ?? null,
    configDigest: input.configDigest ?? null,
    result: 'rejected',
    reason,
    timestamp: input.timestamp ?? null,
  };
}

/** Evaluate the same typed receipt consumed by promotion admission. */
export function evaluateGateIntegrity(registry, input) {
  const policyErrors = validateGateIntegrityPolicy(registry);
  if (policyErrors.length > 0)
    return reject(`invalid-policy:${policyErrors[0]}`, null, input);
  const policy = gatePolicy(registry);
  const certificate = policy.certificates.find(
    item => item.defectFixture === input.defectFixture
  );
  if (!certificate) return reject('unknown-defect-fixture', null, input);
  if (input.applicable !== true)
    return reject('applicability-not-proven', certificate, input);
  if (input.detectorOutcome !== 'passed')
    return reject('detector-did-not-pass', certificate, input);
  if (input.failureSwallowed === true)
    return reject('swallowed-detector-failure', certificate, input);
  if (REJECTED_EVIDENCE_STATES.has(input.evidenceState))
    return reject(`evidence-${input.evidenceState}`, certificate, input);
  if (input.evidenceState !== 'passed')
    return reject('unknown-evidence-state', certificate, input);
  if (input.requiredCheck !== certificate.requiredCheck)
    return reject('required-check-mismatch', certificate, input);
  if (input.consumer !== certificate.certificationConsumer)
    return reject('certification-consumer-mismatch', certificate, input);
  if (!/^[0-9a-f]{40}$/i.test(input.sourceSha ?? ''))
    return reject('invalid-source-sha', certificate, input);
  if (input.evidenceSourceSha !== input.sourceSha)
    return reject('stale-or-wrong-head-evidence', certificate, input);
  if (input.artifact !== certificate.artifact)
    return reject('wrong-artifact', certificate, input);
  if (input.configDigest !== certificate.configDigest)
    return reject('wrong-config', certificate, input);
  if (input.evidenceArtifact !== input.artifact)
    return reject('evidence-artifact-mismatch', certificate, input);
  if (input.evidenceConfigDigest !== input.configDigest)
    return reject('evidence-config-mismatch', certificate, input);
  if (!hasText(input.detectorReceiptDigest))
    return reject('forged-or-missing-detector-receipt', certificate, input);
  const expectedDetectorDigest = digest({
    artifact: input.artifact,
    configDigest: input.configDigest,
    detector: certificate.detector,
    outcome: input.detectorOutcome,
    sourceSha: input.sourceSha,
  });
  if (input.detectorReceiptDigest !== expectedDetectorDigest)
    return reject('forged-or-missing-detector-receipt', certificate, input);
  const timestamp = Date.parse(input.timestamp ?? '');
  const evaluatedAt = Date.parse(input.evaluatedAt ?? '');
  if (!Number.isFinite(timestamp) || !Number.isFinite(evaluatedAt))
    return reject('invalid-timestamp', certificate, input);
  if (
    timestamp > evaluatedAt ||
    evaluatedAt - timestamp > policy.evidenceMaxAgeMs
  )
    return reject('stale-evidence', certificate, input);

  return {
    ...reject('all-gates-proven', certificate, input),
    result: 'passed',
  };
}

export function buildHealthyGateIntegrityInputs(
  registry,
  {
    sourceSha = 'a'.repeat(40),
    timestamp = '2026-09-25T00:00:00.000Z',
    evaluatedAt = timestamp,
  } = {}
) {
  const policy = gatePolicy(registry);
  return (policy?.certificates ?? []).map(certificate => ({
    applicable: true,
    artifact: certificate.artifact,
    configDigest: certificate.configDigest,
    consumer: certificate.certificationConsumer,
    defectFixture: certificate.defectFixture,
    detectorOutcome: 'passed',
    detectorReceiptDigest: digest({
      artifact: certificate.artifact,
      configDigest: certificate.configDigest,
      detector: certificate.detector,
      outcome: 'passed',
      sourceSha,
    }),
    evidenceArtifact: certificate.artifact,
    evidenceConfigDigest: certificate.configDigest,
    evidenceSourceSha: sourceSha,
    evidenceState: 'passed',
    evaluatedAt,
    failureSwallowed: false,
    requiredCheck: certificate.requiredCheck,
    sourceSha,
    timestamp,
  }));
}
