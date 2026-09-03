import { createHash, verify } from 'node:crypto';

export const RECEIPT_SCHEMA = 'jovie.summer-commissioning.probe-receipt/v1';
export const SAFE_CORRELATION_ID = /^[A-Za-z0-9][A-Za-z0-9:._/-]{7,199}$/u;
export const SAFE_PROBE_ID = /^[a-z][a-z0-9._-]{2,119}$/u;
export const SAFE_SHA256 = /^[a-f0-9]{64}$/u;
export const SAFE_GIT_SHA = /^[a-f0-9]{40,64}$/u;

const EVIDENCE_KINDS = new Set(['artifact', 'log', 'record', 'trace']);
const DURABLE_EVIDENCE_REF =
  /^(?:artifact|log|record|trace):\/\/[A-Za-z0-9][A-Za-z0-9:._/-]{7,511}$/u;
const CANONICAL_UTC_TIMESTAMP =
  /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(\.\d{1,3})?Z$/u;
const RECEIPT_MAX_AGE_MS = 15 * 60 * 1000;
const RECEIPT_CLOCK_SKEW_MS = 60 * 1000;

export function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function requireString(value, field) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${field} must be a non-empty string`);
  }
  return value;
}

export function requireStringArray(value, field) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${field} must be a non-empty array`);
  }
  value.forEach((item, index) => requireString(item, `${field}[${index}]`));
  return value;
}

export function isCanonicalUtcTimestamp(value) {
  const match = CANONICAL_UTC_TIMESTAMP.exec(value);
  if (!match) return false;
  const fractionalSeconds = match[2] ? match[2].padEnd(4, '0') : '.000';
  const canonical = `${match[1]}${fractionalSeconds}Z`;
  return !(
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString() !== canonical
  );
}

export function requireIsoTimestamp(value, field) {
  requireString(value, field);
  if (!isCanonicalUtcTimestamp(value)) {
    throw new Error(`${field} must be a canonical UTC ISO timestamp`);
  }
  return value;
}

export function assertSafeProbeId(value, field) {
  requireString(value, field);
  if (!SAFE_PROBE_ID.test(value)) {
    throw new Error(`${field} must be a safe file identifier`);
  }
  return value;
}

export function canonicalJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map(item => canonicalJson(item)).join(',')}]`;
  }
  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort((left, right) => left.localeCompare(right))
      .map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

export function digestCanonicalJson(value) {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}

export function receiptAttestationPayload(receipt) {
  const { attestation: _attestation, ...payload } = receipt;
  return canonicalJson(payload);
}

export function validateRuntimeReceipt(receipt, capability, context) {
  const errors = [];
  if (!isRecord(receipt)) return ['runtime receipt must be an object'];
  if (receipt.schema !== RECEIPT_SCHEMA) errors.push('receipt schema mismatch');
  if (receipt.probeId !== capability.probe.id) errors.push('probeId mismatch');
  if (receipt.probeVersion !== capability.probe.version) {
    errors.push('probeVersion mismatch');
  }
  if (receipt.environment !== context.environment) {
    errors.push('environment mismatch');
  }
  if (receipt.environmentVersion !== context.environmentVersion) {
    errors.push('environmentVersion mismatch');
  }
  if (receipt.sourceVersion !== context.sourceVersion) {
    errors.push('sourceVersion mismatch');
  }
  if (receipt.registryDigest !== context.registryDigest) {
    errors.push('registryDigest mismatch');
  }
  if (receipt.fixture !== capability.probe.fixture) {
    errors.push('fixture mismatch');
  }
  if (receipt.expectedState !== capability.probe.expectedState) {
    errors.push('expectedState mismatch');
  }
  if (receipt.actualState !== capability.probe.expectedState) {
    errors.push('actualState does not satisfy expectedState');
  }
  if (receipt.outcome !== 'passed') errors.push('outcome is not passed');
  if (!SAFE_CORRELATION_ID.test(receipt.correlationId ?? '')) {
    errors.push('correlationId is missing or unsafe');
  }
  if (!Number.isFinite(receipt.latencyMs) || receipt.latencyMs < 0) {
    errors.push('latencyMs must be a non-negative number');
  }

  const startedAt = Date.parse(receipt.startedAt);
  const completedAt = Date.parse(receipt.completedAt);
  if (
    !isCanonicalUtcTimestamp(receipt.startedAt) ||
    !isCanonicalUtcTimestamp(receipt.completedAt)
  ) {
    errors.push(
      'startedAt and completedAt must be canonical UTC ISO timestamps'
    );
  } else if (completedAt < startedAt) {
    errors.push('completedAt must not precede startedAt');
  } else if (
    completedAt > context.nowMs + RECEIPT_CLOCK_SKEW_MS ||
    context.nowMs - completedAt > RECEIPT_MAX_AGE_MS
  ) {
    errors.push('runtime receipt is outside the freshness window');
  }

  if (!Array.isArray(receipt.evidence) || receipt.evidence.length === 0) {
    errors.push('evidence must be a non-empty array');
  } else if (
    receipt.evidence.some(
      item =>
        !isRecord(item) ||
        !EVIDENCE_KINDS.has(item.kind) ||
        !DURABLE_EVIDENCE_REF.test(item.ref ?? '') ||
        !SAFE_SHA256.test(item.sha256 ?? '')
    )
  ) {
    errors.push(
      'evidence entries require kind, durable ref, and SHA-256 digest'
    );
  }
  if (receipt.failureArtifact !== null) {
    errors.push('passing receipt failureArtifact must be null');
  }

  if (!isRecord(receipt.attestation)) {
    errors.push('attestation must be an object');
  } else if (receipt.attestation.algorithm !== 'ed25519') {
    errors.push('attestation algorithm must be ed25519');
  } else if (!context.attestationPublicKey) {
    errors.push('trusted attestation public key missing');
  } else {
    try {
      const signature = Buffer.from(
        receipt.attestation.signature ?? '',
        'base64'
      );
      if (
        signature.length === 0 ||
        !verify(
          null,
          Buffer.from(receiptAttestationPayload(receipt)),
          context.attestationPublicKey,
          signature
        )
      ) {
        errors.push('attestation signature invalid');
      }
    } catch {
      errors.push('attestation signature invalid');
    }
  }
  return errors;
}
