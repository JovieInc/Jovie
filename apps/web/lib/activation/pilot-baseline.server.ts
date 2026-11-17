import 'server-only';

import { db } from '@/lib/db';
import {
  type ActivationPilotBaselineStage,
  activationPilotBaselineSnapshots,
} from '@/lib/db/schema/activation-pilot';
import { captureError } from '@/lib/error-tracking';
import type { ActivationExperimentSpec } from './pilot-controller';

/**
 * Persisted baseline-funnel evidence for the activation pilot (JOV-6468).
 *
 * Acceptance criterion 1: record the baseline funnel with the exact eligible
 * population/denominator and source freshness. A `null` count means the
 * source is missing or unreadable — unknown is never written as zero. The
 * capture reuses the canonical JOV-6440 proof-claim funnel report rather
 * than forking a second funnel.
 */

/**
 * Persist a baseline-funnel snapshot with exact denominators and source
 * freshness. A `null` count means the source is missing or unreadable —
 * unknown is never written as zero.
 */
export async function recordBaselineFunnelSnapshot(input: {
  readonly spec: ActivationExperimentSpec;
  readonly sourceRef: string;
  readonly eligiblePopulation: number | null;
  readonly stages: readonly ActivationPilotBaselineStage[];
  readonly capturedAtIso: string;
}): Promise<{ readonly ok: true }> {
  await db.insert(activationPilotBaselineSnapshots).values({
    experimentId: input.spec.experimentId,
    cohortId: input.spec.cohort.id,
    sourceRef: input.sourceRef,
    eligiblePopulation: input.eligiblePopulation,
    stages: input.stages,
    capturedAt: new Date(input.capturedAtIso),
  });
  return { ok: true };
}

/**
 * Capture the pilot's baseline funnel from the EXISTING proof-claim funnel
 * (JOV-6440) — the canonical claim → activation source, not a fork. Each
 * stage's denominator is the previous stage's count (top of funnel uses the
 * eligible population when known). A stage whose DB count is 0 while its
 * redis counter source is unreadable is recorded as freshness 'unknown',
 * never as a confident zero.
 */
export async function captureProofClaimBaseline(input: {
  readonly spec: ActivationExperimentSpec;
  readonly eligiblePopulation: number | null;
  readonly capturedAtIso: string;
}): Promise<{ readonly ok: true }> {
  const { getProofClaimFunnelReport } = await import(
    '@/lib/acquisition/proof-claim-funnel.server'
  );
  const { PROOF_CLAIM_FUNNEL_EVENTS } = await import(
    '@/lib/acquisition/proof-claim-funnel'
  );
  const [report, counters] = await Promise.all([
    getProofClaimFunnelReport(),
    readProofClaimCountersSafe(),
  ]);
  const freshnessFor = (
    count: number,
    event: string
  ): ActivationPilotBaselineStage['freshness'] =>
    count === 0 && counters[event] === undefined ? 'unknown' : 'fresh';
  const stages: ActivationPilotBaselineStage[] = [
    {
      stage: PROOF_CLAIM_FUNNEL_EVENTS.PROOF_VIEWED,
      count: report.stages.proofViewed,
      denominator: input.eligiblePopulation,
      freshness: freshnessFor(
        report.stages.proofViewed,
        PROOF_CLAIM_FUNNEL_EVENTS.PROOF_VIEWED
      ),
      sourceRef: 'proof-claim-funnel:canonical-profile-views+redis',
    },
    {
      stage: PROOF_CLAIM_FUNNEL_EVENTS.CLAIM_STARTED,
      count: report.stages.claimStarted,
      denominator: report.stages.proofViewed,
      freshness: freshnessFor(
        report.stages.claimStarted,
        PROOF_CLAIM_FUNNEL_EVENTS.CLAIM_STARTED
      ),
      sourceRef: 'proof-claim-funnel:distinct-leads+redis',
    },
    {
      stage: PROOF_CLAIM_FUNNEL_EVENTS.CHECKOUT,
      count: report.stages.checkout,
      denominator: report.stages.claimStarted,
      freshness: freshnessFor(
        report.stages.checkout,
        PROOF_CLAIM_FUNNEL_EVENTS.CHECKOUT
      ),
      sourceRef: 'proof-claim-funnel:distinct-leads+redis',
    },
    {
      stage: PROOF_CLAIM_FUNNEL_EVENTS.ACTIVATION,
      count: report.stages.activation,
      denominator: report.stages.checkout,
      freshness: freshnessFor(
        report.stages.activation,
        PROOF_CLAIM_FUNNEL_EVENTS.ACTIVATION
      ),
      sourceRef: 'proof-claim-funnel:distinct-leads+redis',
    },
  ];
  return recordBaselineFunnelSnapshot({
    spec: input.spec,
    sourceRef:
      'lib/acquisition/proof-claim-funnel.server:getProofClaimFunnelReport',
    eligiblePopulation: input.eligiblePopulation,
    stages,
    capturedAtIso: input.capturedAtIso,
  });
}

/**
 * Read the proof-claim redis counters; a failed/unavailable redis is a
 * missing source ({}), which the freshness rule treats as unknown — the
 * empty map is NOT interpreted as zero evidence.
 */
async function readProofClaimCountersSafe(): Promise<
  Partial<Record<string, number>>
> {
  try {
    const { readProofClaimCounters } = await import(
      '@/lib/acquisition/proof-claim-funnel.server'
    );
    return await readProofClaimCounters();
  } catch (error) {
    await captureError(
      'activation-pilot: baseline redis counters unreadable',
      error,
      { route: 'lib/activation/pilot-store.server' }
    );
    return {};
  }
}
