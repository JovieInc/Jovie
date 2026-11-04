import 'server-only';

import {
  DOGFOOD_GATE_CLOSED,
  type DogfoodGateResult,
  type DogfoodVerdict,
  evaluateDogfoodGate,
  evaluateOnboardingGate,
} from './dogfood-gate';

/**
 * Verdict source for the outreach dogfood gate.
 *
 * The LLM dogfood judge (vision review against Tim's taste rubric and the Pen
 * designs) is being built separately and has no verdict store yet. Until it
 * publishes one, this reader returns no verdicts, so the gate stays closed:
 * no draft reaches Tim and nothing sends. Binding the judge is a change to
 * this file only; the gate rule in dogfood-gate.ts does not move.
 */
export interface DogfoodVerdictSource {
  readOnboarding(): Promise<DogfoodVerdict | null>;
  readArtifacts(
    profileIds: readonly string[]
  ): Promise<Map<string, DogfoodVerdict>>;
}

export const unboundDogfoodVerdictSource: DogfoodVerdictSource = {
  readOnboarding: async () => null,
  readArtifacts: async () => new Map(),
};

let source: DogfoodVerdictSource = unboundDogfoodVerdictSource;

/** Test seam and the judge's binding point. */
export function setDogfoodVerdictSource(next: DogfoodVerdictSource): void {
  source = next;
}

/** Gate results per profile id. Any read failure closes the gate. */
export async function readDogfoodGates(
  profileIds: readonly string[],
  now = new Date()
): Promise<{
  readonly onboarding: DogfoodGateResult;
  readonly byProfile: Map<string, DogfoodGateResult>;
}> {
  try {
    const [onboarding, artifacts] = await Promise.all([
      source.readOnboarding(),
      source.readArtifacts(profileIds),
    ]);
    const byProfile = new Map<string, DogfoodGateResult>();
    for (const id of profileIds)
      byProfile.set(
        id,
        evaluateDogfoodGate({
          artifact: artifacts.get(id) ?? null,
          onboarding,
          now,
        })
      );
    return { onboarding: evaluateOnboardingGate(onboarding, now), byProfile };
  } catch {
    return {
      onboarding: { passed: false, blocks: ['onboarding_not_judged'] },
      byProfile: new Map(profileIds.map(id => [id, DOGFOOD_GATE_CLOSED])),
    };
  }
}
