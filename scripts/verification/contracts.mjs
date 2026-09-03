import { createHash } from 'node:crypto';

export const AUDIT_DEFINITION_SCHEMA = 'jovie-audit-definition/v1';
export const AUDIT_EVIDENCE_SCHEMA = 'jovie-audit-evidence/v1';
export const PROVIDER_QUALIFICATION_SCHEMA = 'jovie-provider-qualification/v1';
export const AUDIT_LEDGER_ENTRY_SCHEMA = 'jovie-audit-evidence-ledger-entry/v1';
export const SHADOW_CERTIFICATE_SCHEMA = 'jovie-audit-shadow-certificate/v1';

export const NON_PASS_OUTCOMES = Object.freeze([
  'failed',
  'disagree',
  'unknown',
  'refused',
  'inconclusive',
  'error',
  'provider_unavailable',
  'budget_deferred',
  'stale_at_birth',
]);

export const AUDIT_EVIDENCE_OUTCOMES = Object.freeze([
  'satisfied',
  ...NON_PASS_OUTCOMES,
]);

export function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

export function isSha256(value) {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
}

export function isGitSha(value) {
  return typeof value === 'string' && /^[a-f0-9]{40}$/.test(value);
}

export function canonicalJson(value) {
  if (Array.isArray(value)) return value.map(canonicalJson);
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map(key => [key, canonicalJson(value[key])])
    );
  }
  return value;
}

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function digestObject(value) {
  return sha256(JSON.stringify(canonicalJson(value)));
}
