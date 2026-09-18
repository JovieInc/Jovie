import { createHash, createPublicKey, verify } from 'node:crypto';
import { readFileSync } from 'node:fs';

/**
 * Summer `/runtime/v1/health` reports `commissioned` only from a verified
 * signed `jovie.certification/v1` envelope or a signed
 * `jovie.summer-commissioning.report/v1` harness receipt. See
 * `docs/operations/SUMMER_COMMISSIONING.md`. Missing, invalid, wrong-key,
 * wrong-identity, or incomplete (not all 16 critical probes) receipts stay
 * `uncommissioned`. Never hardcode the health status.
 */

export const RUNTIME_HEALTH_COMMISSIONED = 'commissioned' as const;
export const RUNTIME_HEALTH_UNCOMMISSIONED = 'uncommissioned' as const;
export type RuntimeHealthStatus =
  | typeof RUNTIME_HEALTH_COMMISSIONED
  | typeof RUNTIME_HEALTH_UNCOMMISSIONED;

export const COMMISSIONING_REPORT_SCHEMA =
  'jovie.summer-commissioning.report/v1' as const;
export const CERTIFICATION_CONTRACT = 'jovie.certification/v1' as const;
export const CANONICAL_CRITICAL_CAPABILITY_COUNT = 16;
export const SUMMER_COMMISSIONING_ISSUE = 'JOV-5853';

const SAFE_SHA256 = /^[a-f0-9]{64}$/u;

type Environment = Readonly<Record<string, string | undefined>>;

export type RuntimeHealthIdentity = 'jovie' | 'summer';

export type ResolveRuntimeHealthStatusInput = {
  readonly identity: RuntimeHealthIdentity;
  readonly environment?: Environment;
  readonly readFile?: (path: string) => string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function canonicalJson(value: unknown): string {
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

function attestationPayload(value: Record<string, unknown>): string {
  const { attestation: _attestation, ...payload } = value;
  return canonicalJson(payload);
}

function readOptionalText(
  environment: Environment,
  names: readonly string[],
  readFile: (path: string) => string
): string | null {
  for (const name of names) {
    const direct = environment[name]?.trim();
    if (direct) return direct;
    const path = environment[`${name}_PATH`]?.trim();
    if (!path) continue;
    try {
      const text = readFile(path).trim();
      if (text) return text;
    } catch {
      return null;
    }
  }
  return null;
}

function fingerprintPublicKey(pem: string): string | null {
  try {
    return createHash('sha256')
      .update(createPublicKey(pem).export({ type: 'spki', format: 'der' }))
      .digest('hex');
  } catch {
    return null;
  }
}

function verifyAttestation(
  value: Record<string, unknown>,
  publicKeyPem: string
): boolean {
  const attestation = value.attestation;
  if (!isRecord(attestation) || attestation.algorithm !== 'ed25519') {
    return false;
  }
  if (typeof attestation.signature !== 'string' || !attestation.signature) {
    return false;
  }
  try {
    const signature = Buffer.from(attestation.signature, 'base64');
    return (
      signature.length > 0 &&
      verify(
        null,
        Buffer.from(attestationPayload(value)),
        publicKeyPem,
        signature
      )
    );
  } catch {
    return false;
  }
}

function isPassedCriticalReceipt(value: unknown): boolean {
  return (
    isRecord(value) &&
    value.critical === true &&
    value.outcome === 'passed' &&
    value.actualState === 'certified'
  );
}

function isCommissionedReport(report: unknown): boolean {
  if (!isRecord(report)) return false;
  if (report.schema !== COMMISSIONING_REPORT_SCHEMA) return false;
  if (report.certificationContract !== CERTIFICATION_CONTRACT) return false;
  if (report.issue !== SUMMER_COMMISSIONING_ISSUE) return false;
  if (report.commissioned !== true) return false;
  if (!Array.isArray(report.receipts)) return false;
  if (report.receipts.length !== CANONICAL_CRITICAL_CAPABILITY_COUNT) {
    return false;
  }
  if (!report.receipts.every(isPassedCriticalReceipt)) return false;
  const summary = report.summary;
  if (!isRecord(summary)) return false;
  return (
    summary.capabilities === CANONICAL_CRITICAL_CAPABILITY_COUNT &&
    summary.certified === CANONICAL_CRITICAL_CAPABILITY_COUNT &&
    summary.blocking === 0
  );
}

function extractSignedReport(
  value: unknown
): Record<string, unknown> | null {
  if (!isRecord(value)) return null;
  if (isCommissionedReport(value)) return value;
  if (
    value.contract === CERTIFICATION_CONTRACT &&
    value.identity === 'summer' &&
    isRecord(value.report) &&
    isCommissionedReport(value.report)
  ) {
    return value;
  }
  return null;
}

export function verifySignedCommissioningReceipt(
  receipt: unknown,
  publicKeyPem: string,
  identity: RuntimeHealthIdentity
): boolean {
  if (identity !== 'summer') return false;
  const signed = extractSignedReport(receipt);
  if (!signed || typeof publicKeyPem !== 'string' || !publicKeyPem.trim()) {
    return false;
  }
  if (!verifyAttestation(signed, publicKeyPem)) return false;
  const fingerprint = fingerprintPublicKey(publicKeyPem);
  const report = isCommissionedReport(signed)
    ? signed
    : isRecord(signed.report)
      ? signed.report
      : null;
  const reportedFingerprint = report?.attestationKeyFingerprint;
  return (
    typeof fingerprint === 'string' &&
    SAFE_SHA256.test(fingerprint) &&
    reportedFingerprint === fingerprint
  );
}

export function resolveRuntimeHealthStatus(
  input: ResolveRuntimeHealthStatusInput
): RuntimeHealthStatus {
  try {
    const environment = input.environment ?? process.env;
    const readFile = input.readFile ?? (path => readFileSync(path, 'utf8'));
    const receiptNames =
      input.identity === 'summer'
        ? [
            'SUMMER_COMMISSIONING_RECEIPT',
            'RUNTIME_COMMISSIONING_RECEIPT',
          ]
        : ['RUNTIME_COMMISSIONING_RECEIPT'];
    const keyNames =
      input.identity === 'summer'
        ? [
            'SUMMER_COMMISSIONING_ATTESTATION_PUBLIC_KEY',
            'RUNTIME_COMMISSIONING_ATTESTATION_PUBLIC_KEY',
          ]
        : ['RUNTIME_COMMISSIONING_ATTESTATION_PUBLIC_KEY'];
    const receiptText = readOptionalText(environment, receiptNames, readFile);
    const publicKeyPem = readOptionalText(environment, keyNames, readFile);
    if (!receiptText || !publicKeyPem) return RUNTIME_HEALTH_UNCOMMISSIONED;
    return verifySignedCommissioningReceipt(
      JSON.parse(receiptText) as unknown,
      publicKeyPem,
      input.identity
    )
      ? RUNTIME_HEALTH_COMMISSIONED
      : RUNTIME_HEALTH_UNCOMMISSIONED;
  } catch {
    return RUNTIME_HEALTH_UNCOMMISSIONED;
  }
}
