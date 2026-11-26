import type { CertificationRecordBackend } from '@/lib/agent-os/certification-cas';
import {
  type DogfoodReceipt,
  dogfoodReceiptFromOutcomeMission,
} from '@/lib/agent-os/dogfood-receipt';
import { getCanonicalSurface } from '@/lib/canonical-surfaces';
import {
  bindDogfoodSubjectDeploy,
  type DogfoodSubjectDeployBinding,
  recordDogfoodReceipt,
} from './dogfood-receipt-ledger';

/**
 * First commissioned outcome loop (JOV-7200): seed one material mission
 * (`outcome:public-profile`) into the existing dogfood receipt ledger so the
 * metrics adapter can show non-empty dogfood inputs. Binding starts as
 * `fixture` and graduates when a real production commitSha + deploymentId is
 * bound via {@link bindDogfoodSubjectDeploy}.
 */

export const PUBLIC_PROFILE_DOGFOOD_SUBJECT_ID = 'public-profile' as const;

/** Honest fixture deploy — replace with production via bindDogfoodSubjectDeploy. */
export const PUBLIC_PROFILE_FIXTURE_DEPLOY = {
  commitSha: 'cafef00ddeadbeefcafef00ddeadbeefcafef00d',
  deploymentId: 'dpl_fixture_public_profile_jov7200',
  source: 'fixture',
} as const satisfies DogfoodSubjectDeployBinding;

export function buildPublicProfileCapabilityReceipt(input: {
  readonly commitSha: string;
  readonly deploymentId: string;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly actor?: string;
}): DogfoodReceipt {
  const mission = getCanonicalSurface('public-profile').outcomeMission;
  return dogfoodReceiptFromOutcomeMission(mission, {
    subjectId: PUBLIC_PROFILE_DOGFOOD_SUBJECT_ID,
    product: 'jov',
    kind: 'ui_agent',
    driver: 'playwright',
    actor: input.actor ?? 'verification-first-loop',
    environment: 'production',
    deploymentId: input.deploymentId,
    commitSha: input.commitSha,
    flagCohort: 'dogfood',
    startedAt: input.startedAt,
    completedAt: input.completedAt,
    evidenceRefs: [
      'artifact:public-profile/identity-readback',
      'artifact:public-profile/listen-destination',
      'artifact:public-profile/nearby-consent',
    ],
    missionObservation: {
      purpose: 'capability',
      method: 'goal_driven',
      missionRevision: mission.outcome.revision,
      goalCompletion: 'completed',
      correctness: 'correct',
      resultingState:
        'Artist identity, listening destination, and nearby consent match the canonical profile after a fresh read.',
      checks: mission.outcome.successCriteria.map(criterion => ({
        criterion,
        status: 'passed' as const,
        evidenceRefs: [
          criterion.includes('listening')
            ? 'artifact:public-profile/listen-destination'
            : criterion.includes('notification') || criterion.includes('Nearby')
              ? 'artifact:public-profile/nearby-consent'
              : 'artifact:public-profile/identity-readback',
        ],
      })),
      friction: { assessment: 'acceptable', details: [] },
      recovery: { retries: 0, details: [] },
      durationMs: Date.parse(input.completedAt) - Date.parse(input.startedAt),
      resources: {
        status: 'not_applicable',
        reason: 'No metered provider call in this read mission.',
      },
    },
  });
}

/** Deliberate false success: scripted run labeled as if it proved the outcome. */
export function buildPublicProfileScriptedFalseSuccess(input: {
  readonly commitSha: string;
  readonly deploymentId: string;
  readonly startedAt: string;
  readonly completedAt: string;
}): DogfoodReceipt {
  const mission = getCanonicalSurface('public-profile').outcomeMission;
  const [firstCriterion] = mission.outcome.successCriteria;
  if (!firstCriterion) {
    throw new Error(
      'public-profile outcome mission requires at least one success criterion'
    );
  }
  return dogfoodReceiptFromOutcomeMission(mission, {
    subjectId: PUBLIC_PROFILE_DOGFOOD_SUBJECT_ID,
    product: 'jov',
    kind: 'ui_agent',
    driver: 'playwright',
    actor: 'verification-false-success',
    environment: 'production',
    deploymentId: input.deploymentId,
    commitSha: input.commitSha,
    flagCohort: 'dogfood',
    startedAt: input.startedAt,
    completedAt: input.completedAt,
    evidenceRefs: ['artifact:public-profile/scripted-click-trace'],
    missionObservation: {
      purpose: 'capability',
      method: 'scripted',
      missionRevision: mission.outcome.revision,
      goalCompletion: 'completed',
      correctness: 'correct',
      resultingState: 'Scripted selectors completed without customer proof.',
      checks: [
        {
          criterion: firstCriterion,
          status: 'passed',
          evidenceRefs: ['artifact:public-profile/scripted-click-trace'],
        },
      ],
      friction: { assessment: 'acceptable', details: [] },
      recovery: { retries: 0, details: [] },
      durationMs: Date.parse(input.completedAt) - Date.parse(input.startedAt),
      resources: {
        status: 'not_applicable',
        reason: 'No metered provider call in this scripted run.',
      },
    },
  });
}

export async function seedPublicProfileDogfoodFixture(input: {
  readonly backend: CertificationRecordBackend;
  readonly recordedAt?: string;
  readonly deploy?: DogfoodSubjectDeployBinding;
  readonly includeCapabilityReceipt?: boolean;
}): Promise<{
  readonly binding: DogfoodSubjectDeployBinding;
  readonly receipt: DogfoodReceipt | null;
}> {
  const recordedAt = input.recordedAt ?? new Date().toISOString();
  const binding = input.deploy ?? PUBLIC_PROFILE_FIXTURE_DEPLOY;
  await bindDogfoodSubjectDeploy({
    backend: input.backend,
    subjectId: PUBLIC_PROFILE_DOGFOOD_SUBJECT_ID,
    binding,
    recordedAt,
  });

  if (input.includeCapabilityReceipt === false) {
    return { binding, receipt: null };
  }

  const startedAt = new Date(Date.parse(recordedAt) - 90_000).toISOString();
  const receipt = buildPublicProfileCapabilityReceipt({
    commitSha: binding.commitSha,
    deploymentId: binding.deploymentId,
    startedAt,
    completedAt: recordedAt,
  });
  await recordDogfoodReceipt({
    backend: input.backend,
    receipt,
    recordedAt,
  });
  return { binding, receipt };
}
