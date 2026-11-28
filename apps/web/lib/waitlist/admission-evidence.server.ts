import 'server-only';

import { readCachedAcquisitionEligibility } from '@/lib/acquisition/eligibility.server';
import {
  countOpenCohortLearnings,
  MAX_OPEN_COHORT_LEARNINGS,
} from '@/lib/waitlist/cohort-learnings';
import type { GoldenPathAdmissionDecision } from '@/lib/waitlist/golden-path-admission';

export type FreshAdmissionEvidenceHold =
  | 'golden_path_not_green'
  | 'open_learnings'
  | 'learnings_unavailable';

/**
 * Fail-closed evidence for one automatic admission attempt.
 * Eligibility is the cache-only verdict. Cohort learnings are read fresh:
 * the 60s throttle cache must not survive a serialization retry or a stale
 * caller decision. Unreadable evidence holds. Readiness is checked first so
 * a red or missing verdict does not probe Linear.
 */
export async function readFreshAdmissionEvidenceHold(): Promise<FreshAdmissionEvidenceHold | null> {
  const report = await readCachedAcquisitionEligibility().catch(() => null);
  if (report?.eligible !== true || report.verdict !== 'ELIGIBLE') {
    return 'golden_path_not_green';
  }
  const openLearnings = await countOpenCohortLearnings();
  if (openLearnings === null) return 'learnings_unavailable';
  if (openLearnings >= MAX_OPEN_COHORT_LEARNINGS) return 'open_learnings';
  return null;
}

/** Downgrade a caller-supplied admit when fresh evidence is missing or red. */
export async function holdStaleGoldenPathAdmission(
  decision: GoldenPathAdmissionDecision | undefined
): Promise<GoldenPathAdmissionDecision | undefined> {
  if (!decision?.admit) return decision;
  const evidenceHold = await readFreshAdmissionEvidenceHold();
  if (!evidenceHold) return decision;
  return {
    admit: false,
    reason:
      evidenceHold === 'golden_path_not_green'
        ? 'hold_golden_path_not_green'
        : 'hold_open_learnings',
  };
}
