/**
 * Waitlist admission gate (Tim, 2026-10-29). Nobody gets in, by auto-accept,
 * manual approval or paying for Pro, unless three legs are certified and
 * fresh for the current production SHA:
 *
 *   1. profile:     their own per-profile certification passed on this SHA,
 *                   with resolver identity at or above the bar (or owner
 *                   confirmation); see profile-certification.ts;
 *   2. golden_path: every golden-path surface passed on this SHA (tests plus
 *                   the production canary walk; prod-golden-path-ledger.ts);
 *   3. design:      the LLM dogfood judge watched the recorded walk of every
 *                   golden-path screen and positively signed off on this SHA
 *                   with the current model and rubric. "No assertion failed"
 *                   is not a sign-off.
 *
 * Pure. Fail closed: a missing, failed or stale receipt blocks admission, and
 * an unknown production SHA blocks everything. A deploy changes the SHA and a
 * model or rubric change changes the judge fingerprint, so both invalidate.
 */
import type { ProdGoldenPathLedger } from '@/lib/ovie/certifications/prod-golden-path-ledger';
import type { ProfileCertReceipt } from './profile-certification';

export const ADMISSION_LEGS = ['profile', 'golden_path', 'design'] as const;
export type AdmissionLeg = (typeof ADMISSION_LEGS)[number];

export interface AdmissionLegResult {
  readonly leg: AdmissionLeg;
  readonly ok: boolean;
  readonly reason: string;
}

export interface AdmissionDecision {
  readonly admit: boolean;
  readonly prodSha: string | null;
  readonly legs: readonly AdmissionLegResult[];
  /** Legs that block admission, in gate order. Empty when admitted. */
  readonly blocking: readonly AdmissionLeg[];
}

/**
 * Design-judge ledger the dogfood-judge pipeline writes to
 * `ovie_operating_kv` under {@link DESIGN_JUDGE_LEDGER_KEY}. `requiredSurfaces`
 * lists every golden-path surface that must be judged; `currentFingerprint`
 * is the active model + rubric fingerprint, so a receipt judged under an
 * older model or rubric no longer counts.
 */
export const DESIGN_JUDGE_LEDGER_KEY =
  'jovie:certification:v1:dogfood-judge' as const;
export const DESIGN_JUDGE_LEDGER_SCHEMA =
  'jovie.dogfood-judge-ledger/v1' as const;

export interface DesignJudgeSurfaceRecord {
  readonly verdict: 'pass' | 'fail';
  readonly sourceSha: string | null;
  readonly fingerprint: string;
  readonly judgedAt: string;
}

export interface DesignJudgeLedger {
  readonly schema: typeof DESIGN_JUDGE_LEDGER_SCHEMA;
  readonly currentFingerprint: string;
  readonly requiredSurfaces: readonly string[];
  readonly surfaces: Readonly<Record<string, DesignJudgeSurfaceRecord>>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Parses the judge ledger; anything malformed reads as absent (fail closed). */
export function parseDesignJudgeLedger(raw: unknown): DesignJudgeLedger | null {
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
    value.schema !== DESIGN_JUDGE_LEDGER_SCHEMA ||
    typeof value.currentFingerprint !== 'string' ||
    !value.currentFingerprint ||
    !Array.isArray(value.requiredSurfaces) ||
    !value.requiredSurfaces.every(s => typeof s === 'string') ||
    !isRecord(value.surfaces)
  ) {
    return null;
  }
  return value as unknown as DesignJudgeLedger;
}

function leg(
  name: AdmissionLeg,
  ok: boolean,
  reason: string
): AdmissionLegResult {
  return { leg: name, ok, reason };
}

export function evaluateProfileLeg(
  receipt: ProfileCertReceipt | null | undefined,
  prodSha: string | null
): AdmissionLegResult {
  if (!prodSha) return leg('profile', false, 'Production SHA unknown.');
  if (!receipt) return leg('profile', false, 'Profile not certified.');
  if (receipt.status !== 'passed') {
    const failed = receipt.checks
      .filter(c => c.status === 'failed')
      .map(c => c.id);
    return leg(
      'profile',
      false,
      `Profile ${receipt.status.replaceAll('_', ' ')}${failed.length ? `: ${failed.join(', ')}` : ''}.`
    );
  }
  if (receipt.sha !== prodSha) {
    return leg('profile', false, 'Profile certified on an older deploy.');
  }
  return leg('profile', true, 'Profile certified on this deploy.');
}

export function evaluateGoldenPathLeg(
  ledger: ProdGoldenPathLedger | null,
  prodSha: string | null,
  requiredSurfaces: readonly string[]
): AdmissionLegResult {
  if (!prodSha) return leg('golden_path', false, 'Production SHA unknown.');
  if (!ledger) return leg('golden_path', false, 'No golden-path receipts.');
  const notPassed = requiredSurfaces.filter(id => {
    const latest = ledger.surfaces[id]?.latest;
    return !latest || latest.status !== 'passed' || latest.sha !== prodSha;
  });
  return notPassed.length === 0
    ? leg(
        'golden_path',
        true,
        'Every golden-path surface passed on this deploy.'
      )
    : leg(
        'golden_path',
        false,
        `Not passed on this deploy: ${notPassed.join(', ')}.`
      );
}

export function evaluateDesignLeg(
  ledger: DesignJudgeLedger | null,
  prodSha: string | null
): AdmissionLegResult {
  if (!prodSha) return leg('design', false, 'Production SHA unknown.');
  if (!ledger || ledger.requiredSurfaces.length === 0) {
    return leg('design', false, 'No design judge sign-off yet.');
  }
  const notSigned = ledger.requiredSurfaces.filter(id => {
    const record = ledger.surfaces[id];
    return (
      !record ||
      record.verdict !== 'pass' ||
      record.sourceSha !== prodSha ||
      record.fingerprint !== ledger.currentFingerprint
    );
  });
  return notSigned.length === 0
    ? leg('design', true, 'Judge signed off every screen on this deploy.')
    : leg(
        'design',
        false,
        `No current judge sign-off: ${notSigned.join(', ')}.`
      );
}

export function decideAdmission(input: {
  readonly prodSha: string | null;
  readonly profileReceipt: ProfileCertReceipt | null | undefined;
  readonly goldenPath: ProdGoldenPathLedger | null;
  readonly goldenPathSurfaces: readonly string[];
  readonly design: DesignJudgeLedger | null;
}): AdmissionDecision {
  const legs = [
    evaluateProfileLeg(input.profileReceipt, input.prodSha),
    evaluateGoldenPathLeg(
      input.goldenPath,
      input.prodSha,
      input.goldenPathSurfaces
    ),
    evaluateDesignLeg(input.design, input.prodSha),
  ];
  const blocking = legs.filter(l => !l.ok).map(l => l.leg);
  return {
    admit: blocking.length === 0,
    prodSha: input.prodSha,
    legs,
    blocking,
  };
}
