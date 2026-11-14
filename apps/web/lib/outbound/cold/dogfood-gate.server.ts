import 'server-only';

import { evaluateDogfoodJudgeGate } from '@/lib/agent-os/dogfood-judge-gate';
import { getDogfoodJudgeLedger } from '@/lib/agent-os/dogfood-judge-runtime-store';

import {
  DOGFOOD_GATE_CLOSED,
  type DogfoodGateResult,
  type DogfoodVerdict,
  evaluateDogfoodGate,
  evaluateOnboardingGate,
} from './dogfood-gate';

/** One request-scoped read keeps onboarding and artifacts on the same ledger. */
export interface DogfoodVerdictSource {
  readVerdicts(
    profileIds: readonly string[],
    now: Date
  ): Promise<{
    readonly onboarding: DogfoodVerdict | null;
    readonly artifacts: ReadonlyMap<string, DogfoodVerdict>;
  }>;
}

export const unboundDogfoodVerdictSource: DogfoodVerdictSource = {
  readVerdicts: async () => ({ onboarding: null, artifacts: new Map() }),
};

export const ledgerDogfoodVerdictSource: DogfoodVerdictSource = {
  async readVerdicts(profileIds, now) {
    const ledger = await getDogfoodJudgeLedger().read();
    const prodSha = process.env.VERCEL_GIT_COMMIT_SHA ?? null;
    function verdict(
      surfaceId: string,
      subject: DogfoodVerdict['subject'],
      subjectId: string
    ): DogfoodVerdict | null {
      const record = ledger?.surfaces[surfaceId];
      if (!ledger || !record) return null;
      return {
        subject,
        subjectId,
        // Includes verified signature, signoff, fingerprint, deployed SHA and
        // the ledger's stricter seven-day freshness limit. Never trust pass alone.
        pass: evaluateDogfoodJudgeGate(ledger, surfaceId, { now, prodSha })
          .allow,
        judgedAt: new Date(record.judgedAt),
        rubricVersion: ledger.currentFingerprint,
      };
    }
    const artifacts = new Map<string, DogfoodVerdict>();
    for (const id of profileIds) {
      const result = verdict(`outbound-artifact:${id}`, 'artifact', id);
      if (result) artifacts.set(id, result);
    }
    return {
      onboarding: verdict('onboarding', 'onboarding', 'onboarding'),
      artifacts,
    };
  },
};

let source: DogfoodVerdictSource = ledgerDogfoodVerdictSource;

/** Test seam; restore ledgerDogfoodVerdictSource after overriding. */
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
    const { onboarding, artifacts } = await source.readVerdicts(
      profileIds,
      now
    );
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
