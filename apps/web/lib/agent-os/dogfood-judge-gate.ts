/**
 * Pure dogfood-judge gate over the shared ledger value stored at
 * `ovie_operating_kv` key `jovie:certification:v1:dogfood-judge`
 * (`jovie.dogfood-judge-ledger/v1`). PR #23720's admission gate reads the same
 * value. No ledger, no surface record, a non-pass verdict, no "nothing wrong"
 * signoff, an unverified signature, a stale fingerprint, a stale record or a
 * deployed-SHA mismatch all deny.
 */

export const DOGFOOD_JUDGE_LEDGER_SCHEMA =
  'jovie.dogfood-judge-ledger/v1' as const;
export const DOGFOOD_JUDGE_DEFAULT_MAX_AGE_DAYS = 7;

export interface DogfoodJudgeSignature {
  readonly alg: string;
  readonly keyId?: string;
  readonly value: string;
}

export interface DogfoodJudgeSurfaceRecord {
  readonly verdict: 'pass' | 'fail';
  readonly sourceSha: string | null;
  readonly fingerprint: string;
  readonly judgedAt: string;
  readonly runId?: string;
  readonly nothingWrong?: boolean;
  readonly digest?: string;
  readonly signature?: DogfoodJudgeSignature | null;
  /** True only when the HMAC over `digest` verified at write time. */
  readonly signatureVerified?: boolean;
  readonly [extra: string]: unknown;
}

export interface DogfoodJudgeLedgerValue {
  readonly schema: typeof DOGFOOD_JUDGE_LEDGER_SCHEMA;
  readonly currentFingerprint: string;
  readonly requiredSurfaces: readonly string[];
  readonly surfaces: Readonly<Record<string, DogfoodJudgeSurfaceRecord>>;
  readonly publishedAt?: string;
}

export interface DogfoodJudgeGateDecision {
  readonly allow: boolean;
  readonly reasons: readonly string[];
}

const DAY_MS = 86_400_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Anything malformed reads as absent (fail closed). */
export function parseDogfoodJudgeLedger(
  raw: unknown
): DogfoodJudgeLedgerValue | null {
  let value: unknown = raw;
  if (typeof raw === 'string') {
    try {
      value = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (
    !isRecord(value) ||
    value.schema !== DOGFOOD_JUDGE_LEDGER_SCHEMA ||
    typeof value.currentFingerprint !== 'string' ||
    !value.currentFingerprint ||
    !Array.isArray(value.requiredSurfaces) ||
    !value.requiredSurfaces.every(s => typeof s === 'string') ||
    !isRecord(value.surfaces)
  ) {
    return null;
  }
  return value as unknown as DogfoodJudgeLedgerValue;
}

export function evaluateDogfoodJudgeGate(
  ledger: DogfoodJudgeLedgerValue | null | undefined,
  surfaceId: string,
  options: { now: Date; maxAgeDays?: number; prodSha?: string | null }
): DogfoodJudgeGateDecision {
  if (!ledger) return { allow: false, reasons: ['no-ledger'] };
  const record = ledger.surfaces[surfaceId];
  if (!record) return { allow: false, reasons: ['no-record'] };
  const reasons: string[] = [];
  if (record.verdict !== 'pass') reasons.push(`verdict-${record.verdict}`);
  if (record.nothingWrong !== true) reasons.push('no-nothing-wrong-signoff');
  if (record.signatureVerified !== true) reasons.push('signature-unverified');
  if (record.fingerprint !== ledger.currentFingerprint) {
    reasons.push('fingerprint-stale');
  }
  const judgedAt = Date.parse(record.judgedAt);
  const maxAgeMs =
    (options.maxAgeDays ?? DOGFOOD_JUDGE_DEFAULT_MAX_AGE_DAYS) * DAY_MS;
  if (!Number.isFinite(judgedAt)) {
    reasons.push('judged-at-invalid');
  } else if (options.now.getTime() - judgedAt > maxAgeMs) {
    reasons.push('stale');
  }
  if (options.prodSha && record.sourceSha !== options.prodSha) {
    reasons.push('sha-mismatch');
  }
  return { allow: reasons.length === 0, reasons };
}
