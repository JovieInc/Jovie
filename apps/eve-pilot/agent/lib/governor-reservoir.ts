import type { DecisionAuthority, RiskTier } from './governor-route';

export const VALUE_RESERVOIR_SCHEMA =
  'jovie.eve.governor.value-reservoir/v1' as const;
export const VALUE_RESERVOIR_POLICY_VERSION = '2026-09-29' as const;
export type ReservoirTier = 1 | 2 | 3 | 4 | 5 | 6;
export type ReservoirWorkClass =
  | 'code'
  | 'eval'
  | 'research'
  | 'acquisition-outbound'
  | 'seo-aeo'
  | 'documentation'
  | 'reliability'
  | 'certification';
export type PrivacyTier = 'public' | 'internal' | 'restricted';
export type ExecutionRequirement =
  `${'route' | 'provider' | 'model' | 'cli' | 'harness' | 'tool'}:${string}`;

export type ReservoirCandidate = {
  readonly id: string;
  readonly objective: string;
  readonly valueHypothesis: string;
  readonly workClass: ReservoirWorkClass;
  readonly executionRequirements: readonly ExecutionRequirement[];
  readonly sourceRefs: readonly string[];
  readonly dedupeKey: string;
  readonly estimatedCapacityUnits: number;
  readonly completionMinutes: number;
  readonly maxParallelism: number;
  readonly dependencies: readonly string[];
  readonly freshUntil: string;
  readonly reversibility: 'reversible' | 'compensating-action' | 'irreversible';
  readonly riskTier: RiskTier;
  readonly authority: DecisionAuthority;
  readonly privacy: PrivacyTier;
  readonly artifactUri: string;
  readonly provenanceRefs: readonly string[];
  readonly certificationPredicate: string;
  readonly stopConditions: readonly string[];
  readonly lowValueEvidence: readonly string[];
  readonly tier: ReservoirTier;
  readonly marginalValue: number;
  readonly confidence: number;
  readonly completionProbability: number;
  readonly generatorId: string;
  readonly persistence: 'job' | 'ready-issue' | 'durable-gap' | 'placeholder';
  readonly requiresHumanJudgment?: boolean;
  readonly partialDurableValue?: {
    readonly usefulAfterMinutes: number;
    readonly capacityUnits: number;
  };
};

export type ReservoirOutcome = {
  readonly generatorId: string;
  readonly predictedCertifiedValue: number;
  readonly actualCertifiedValue: number;
  readonly usefulCertified: boolean;
  readonly firstPass: boolean;
  readonly actualDurationMinutes: number;
  readonly capacityConsumed: number;
  readonly retries: number;
  readonly reviewMinutes: number;
  readonly artifactPersistedOrReused: boolean;
  readonly duplicate: boolean;
  readonly stale: boolean;
  readonly downstreamRemediation: boolean;
};

export type CapacityHorizon = {
  readonly id: string;
  readonly unavailableAt: string;
  readonly availableCapacityUnits: number;
  readonly throughputUnitsPerHour: number;
  readonly headroomUnits: number;
  readonly existingQualifiedWorkUnits: number;
  readonly activeDedupeKeys: ReadonlySet<string>;
  readonly resolvedDependencies: ReadonlySet<string>;
  readonly executionCapabilities: ReadonlySet<ExecutionRequirement>;
  readonly maxRiskTier: RiskTier;
  readonly allowedAuthorities: readonly DecisionAuthority[];
  readonly allowedPrivacy: readonly PrivacyTier[];
};

export type ReservoirRejectionReason =
  | 'duplicate'
  | 'missing-evidence'
  | 'incompatible-route'
  | 'unresolved-dependency'
  | 'unsafe-authority'
  | 'human-judgment'
  | 'genuinely-exhausted-useful-tiers';
type ShortageReason = Exclude<ReservoirRejectionReason, 'duplicate'>;
type EligibleCandidate = {
  readonly candidate: ReservoirCandidate;
  readonly completionMode: 'complete' | 'partial-durable';
  readonly qualifiedCapacityUnits: number;
};
type Rejection = {
  readonly candidateId: string;
  readonly dedupeKey: string;
  readonly reason: ReservoirRejectionReason;
};

const RISK_ORDER = ['low', 'medium', 'high', 'critical'] as const;
const REQUIREMENT_KINDS = [
  'route',
  'provider',
  'model',
  'cli',
  'harness',
  'tool',
] as const;
function pressure(minutes: number) {
  if (minutes <= 120)
    return { maxEligibleTier: 6 as const, minimumMarginalValue: 0.1 };
  if (minutes <= 360)
    return { maxEligibleTier: 5 as const, minimumMarginalValue: 0.25 };
  if (minutes <= 1440)
    return { maxEligibleTier: 4 as const, minimumMarginalValue: 0.45 };
  return { maxEligibleTier: 3 as const, minimumMarginalValue: 0.65 };
}

function calibration(
  outcomes: readonly ReservoirOutcome[],
  generatorId: string
) {
  const samples = outcomes.filter(item => item.generatorId === generatorId);
  if (samples.length < 3) return { multiplier: 1, demoted: false };
  const score = samples.reduce(
    (sum, item) =>
      sum +
      (item.actualCertifiedValue /
        Math.max(item.predictedCertifiedValue, Number.EPSILON)) *
        Number(
          item.usefulCertified &&
            item.firstPass &&
            item.artifactPersistedOrReused &&
            !item.duplicate &&
            !item.stale &&
            !item.downstreamRemediation
        ),
    0
  );
  const multiplier = Math.max(0.1, Math.min(1, score / samples.length));
  return { multiplier, demoted: multiplier < 0.5 };
}

function finitePositive(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function hasContract(candidate: ReservoirCandidate): boolean {
  const evidence = [
    candidate.objective,
    candidate.valueHypothesis,
    candidate.dedupeKey,
    candidate.artifactUri.includes('://') ? candidate.artifactUri : '',
    candidate.certificationPredicate,
    candidate.id.trim() && candidate.generatorId,
    candidate.sourceRefs.join(''),
    candidate.provenanceRefs.join(''),
    candidate.stopConditions.join(''),
    candidate.lowValueEvidence.join(''),
  ];
  return (
    evidence.every(value => value.trim().length > 0) &&
    REQUIREMENT_KINDS.every(kind =>
      candidate.executionRequirements.some(value =>
        new RegExp(`^${kind}:.+`).test(value)
      )
    ) &&
    Number.isFinite(Date.parse(candidate.freshUntil)) &&
    [candidate.estimatedCapacityUnits, candidate.completionMinutes].every(
      finitePositive
    ) &&
    Number.isInteger(candidate.maxParallelism) &&
    candidate.maxParallelism > 0 &&
    [
      candidate.marginalValue,
      candidate.confidence,
      candidate.completionProbability,
    ].every(value => value > 0 && value <= 1)
  );
}

function nextUnlock(maxTier: ReservoirTier, unavailableMs: number) {
  if (maxTier >= 6) return null;
  const minutesBeforeExpiry = ({ 3: 1440, 4: 360, 5: 120 } as const)[
    maxTier as 3 | 4 | 5
  ];
  return {
    tier: (maxTier + 1) as ReservoirTier,
    at: new Date(unavailableMs - minutesBeforeExpiry * 60_000).toISOString(),
  };
}

export function planValueReservoir(input: {
  readonly candidates: readonly ReservoirCandidate[];
  readonly horizon: CapacityHorizon;
  readonly outcomes?: readonly ReservoirOutcome[];
  readonly observedAt?: string;
}) {
  const observedAt = input.observedAt ?? new Date().toISOString();
  const observedMs = Date.parse(observedAt);
  const unavailableMs = Date.parse(input.horizon.unavailableAt);
  if (
    !Number.isFinite(observedMs + unavailableMs) ||
    unavailableMs <= observedMs ||
    !finitePositive(input.horizon.availableCapacityUnits) ||
    !finitePositive(input.horizon.throughputUnitsPerHour) ||
    input.horizon.headroomUnits < 0 ||
    input.horizon.existingQualifiedWorkUnits < 0
  ) {
    throw new Error('Invalid value reservoir capacity horizon');
  }

  const minutesRemaining = (unavailableMs - observedMs) / 60_000;
  const policy = pressure(minutesRemaining);
  const forecastUsableCapacityUnits = Math.min(
    input.horizon.availableCapacityUnits,
    input.horizon.throughputUnitsPerHour * (minutesRemaining / 60)
  );
  const targetCapacityUnits =
    forecastUsableCapacityUnits + input.horizon.headroomUnits;
  const ranked = input.candidates
    .map(candidate => {
      const generator = calibration(
        input.outcomes ?? [],
        candidate.generatorId
      );
      return {
        candidate,
        generator,
        predictedCertifiedValue:
          candidate.marginalValue *
          candidate.confidence *
          candidate.completionProbability *
          generator.multiplier,
      };
    })
    .sort(
      (left, right) =>
        left.candidate.tier - right.candidate.tier ||
        right.predictedCertifiedValue - left.predictedCertifiedValue ||
        left.candidate.id.localeCompare(right.candidate.id)
    );
  const seen = new Set<string>();
  const eligible: EligibleCandidate[] = [];
  const rejections: Rejection[] = [];
  const blockers: Pick<Rejection, 'candidateId' | 'reason'>[] = [];
  const byTier = Object.fromEntries(
    [1, 2, 3, 4, 5, 6].map(tier => [tier, 0])
  ) as Record<ReservoirTier, number>;
  let expectedCertifiedValue = 0;

  for (const item of ranked) {
    const { candidate } = item;
    let reason: ReservoirRejectionReason | null = null;
    if (!hasContract(candidate)) reason = 'missing-evidence';
    else if (
      input.horizon.activeDedupeKeys.has(candidate.dedupeKey) ||
      seen.has(candidate.dedupeKey)
    )
      reason = 'duplicate';
    else if (
      candidate.dependencies.some(
        key => !input.horizon.resolvedDependencies.has(key)
      )
    )
      reason = 'unresolved-dependency';
    else if (Date.parse(candidate.freshUntil) <= observedMs)
      reason = 'missing-evidence';
    else if (candidate.tier > policy.maxEligibleTier)
      reason = 'genuinely-exhausted-useful-tiers';
    else if (candidate.marginalValue < policy.minimumMarginalValue)
      reason = 'genuinely-exhausted-useful-tiers';
    else if (
      candidate.executionRequirements.some(
        requirement => !input.horizon.executionCapabilities.has(requirement)
      )
    )
      reason = 'incompatible-route';
    else if (
      RISK_ORDER.indexOf(candidate.riskTier) >
        RISK_ORDER.indexOf(input.horizon.maxRiskTier) ||
      !input.horizon.allowedAuthorities.includes(candidate.authority) ||
      !input.horizon.allowedPrivacy.includes(candidate.privacy)
    )
      reason = 'unsafe-authority';
    else if (candidate.requiresHumanJudgment) reason = 'human-judgment';
    else if (candidate.persistence === 'placeholder')
      reason = 'missing-evidence';

    const usefulMinutes = Math.min(
      minutesRemaining,
      (Date.parse(candidate.freshUntil) - observedMs) / 60_000
    );
    const partial = candidate.partialDurableValue;
    const canComplete = candidate.completionMinutes <= usefulMinutes;
    const canPersistPartial =
      partial !== undefined &&
      partial.usefulAfterMinutes <= usefulMinutes &&
      finitePositive(partial.capacityUnits);
    if (!reason && !canComplete && !canPersistPartial)
      reason = 'incompatible-route';

    if (reason) {
      rejections.push({
        candidateId: candidate.id,
        dedupeKey: candidate.dedupeKey,
        reason,
      });
      if (reason !== 'duplicate')
        blockers.push({ candidateId: candidate.id, reason });
      continue;
    }
    seen.add(candidate.dedupeKey);
    const qualifiedCapacityUnits = canComplete
      ? candidate.estimatedCapacityUnits
      : partial!.capacityUnits;
    byTier[candidate.tier] += qualifiedCapacityUnits;
    expectedCertifiedValue += item.predictedCertifiedValue;
    eligible.push({
      candidate,
      completionMode: canComplete ? 'complete' : 'partial-durable',
      qualifiedCapacityUnits,
    });
  }

  const generatedUnits = eligible.reduce(
    (sum, item) => sum + item.qualifiedCapacityUnits,
    0
  );
  const totalUnits = input.horizon.existingQualifiedWorkUnits + generatedUnits;
  const shortageUnits = Math.max(0, targetCapacityUnits - totalUnits);
  const projectedUnusedCapacityUnits = Math.max(
    0,
    forecastUsableCapacityUnits - totalUnits
  );
  const expectedCompletionProbability =
    eligible.reduce(
      (sum, item) => sum + item.candidate.completionProbability,
      0
    ) / Math.max(eligible.length, 1);
  const shortageReasons =
    shortageUnits === 0
      ? []
      : [
          ...new Set(
            rejections
              .map(item => item.reason)
              .filter((item): item is ShortageReason => item !== 'duplicate')
          ),
        ];
  if (shortageUnits > 0 && shortageReasons.length === 0)
    shortageReasons.push('genuinely-exhausted-useful-tiers');
  const highestValueBlocker = shortageUnits > 0 ? (blockers[0] ?? null) : null;
  const unlock = nextUnlock(policy.maxEligibleTier, unavailableMs);
  const explanation =
    shortageUnits > 0
      ? `Reservoir shortage ${shortageUnits} units; ${unlock ? `tier ${unlock.tier} unlocks at ${unlock.at}` : 'all useful tiers are unlocked'}; highest-value blocker ${highestValueBlocker ? `${highestValueBlocker.candidateId}:${highestValueBlocker.reason}` : 'none'}.`
      : `Capacity covered with ${totalUnits} qualified units against ${targetCapacityUnits} target units.`;

  return {
    schema: VALUE_RESERVOIR_SCHEMA,
    policyVersion: VALUE_RESERVOIR_POLICY_VERSION,
    horizonId: input.horizon.id,
    observedAt,
    pressure: { minutesRemaining, ...policy },
    eligible,
    rejections,
    coverage: {
      forecastUsableCapacityUnits,
      targetCapacityUnits,
      compatibleQualifiedWorkByTier: byTier,
      coverageRatio: totalUnits / targetCapacityUnits,
      shortageUnits,
      projectedUnusedCapacityUnits,
      expectedCertifiedValue,
      expectedCompletionProbability,
    },
    shortageReasons,
    demotedGenerators: [
      ...new Set(
        ranked
          .filter(item => item.generator.demoted)
          .map(item => item.candidate.generatorId)
      ),
    ],
    nextTierUnlock: unlock,
    highestValueBlocker,
    humanActionRequired: highestValueBlocker?.reason === 'human-judgment',
    explanation,
  };
}
