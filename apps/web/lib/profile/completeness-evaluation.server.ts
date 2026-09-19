import 'server-only';

import {
  type EvaluationOptions,
  type ProfileCompletenessInput,
  prepareProfileCompletenessRequest,
  runProfileCompletenessEvaluation,
} from '@/lib/jev/profile-completeness.server';
import {
  loadProfileCompleteness,
  type ProfileCompletenessAssessment,
  reassessProfileCompleteness,
} from './completeness.server';
import { PROFILE_COMPLETENESS_POLICY } from './completeness-certification';

function evaluationInput(
  current: ProfileCompletenessAssessment,
  sourceSha: string
): ProfileCompletenessInput {
  return {
    sourceSha,
    profileId: current.profileId,
    snapshotJson: current.canonicalJson,
    snapshotSha256: current.snapshotSha256,
    policyVersion: PROFILE_COMPLETENESS_POLICY,
    checks: current.checks,
  };
}

/** Prepare the exact request for the existing admission owner; this never calls Jev. */
export async function prepareStoredProfileCompletenessEvaluation(
  profileId: string,
  sourceSha: string
) {
  const current = (await loadProfileCompleteness([profileId])).get(profileId);
  return current
    ? prepareProfileCompletenessRequest(evaluationInput(current, sourceSha))
    : null;
}

/** No automatic approval or credential lookup. A caller must supply existing admission. */
export async function runStoredProfileCompletenessEvaluation(
  profileId: string,
  sourceSha: string,
  options: Omit<EvaluationOptions, 'readCurrentFingerprint'>
) {
  return reassessProfileCompleteness(profileId, current =>
    runProfileCompletenessEvaluation(evaluationInput(current, sourceSha), {
      ...options,
      // Derive freshness from the database, never a caller's claimed current hash.
      readCurrentFingerprint: async () =>
        (await prepareStoredProfileCompletenessEvaluation(profileId, sourceSha))
          ?.fingerprint ?? '',
    })
  );
}
