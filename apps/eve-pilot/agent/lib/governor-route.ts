export const GOVERNOR_ROUTE_SCHEMA =
  'jovie.eve.governor.route-receipt/v3' as const;
export const FULLY_LOADED_COST_SCHEMA =
  'jovie.eve.fully-loaded-cost/v2' as const;
export const SHADOW_PRICE_SCHEMA =
  'jovie.eve.resource-shadow-price/v1' as const;
export const ROUTE_CALIBRATION_SCHEMA =
  'jovie.eve.route-cost-calibration/v2' as const;
export const ROUTE_COHORT_SCHEMA = 'jovie.eve.route-cost-cohort/v1' as const;
export const GOVERNOR_ROUTER_VERSION = '2026-10-02' as const;

export type JobClass =
  | 'lightweight-deterministic'
  | 'ambiguous-product-reasoning'
  | 'high-risk-spend-allocation'
  | 'low-risk-support'
  | 'high-risk-customer-legal';

export type RiskTier = 'low' | 'medium' | 'high' | 'critical';

export type DecisionAuthority = 'founder' | 'admin' | 'automation';

export type DecisionJob = {
  readonly kind: 'decision';
  readonly id: string;
  readonly jobClass: JobClass;
  readonly riskTier: RiskTier;
  readonly objective: string;
  readonly requiredCapabilities: readonly string[];
  readonly certificationPredicate: string;
  readonly authority: DecisionAuthority;
  readonly evidenceRefs: readonly string[];
  readonly maxLatencyMs?: number;
};

export type ExecutionJob = {
  readonly kind: 'execution';
  readonly id: string;
  readonly jobClass: JobClass;
  readonly riskTier: RiskTier;
  readonly objective: string;
  readonly requiredCapabilities: readonly string[];
  readonly certificationPredicate: string;
  readonly authority: DecisionAuthority;
  readonly evidenceRefs: readonly string[];
  readonly payload: unknown;
  readonly maxLatencyMs?: number;
};

export type GovernorJob = DecisionJob | ExecutionJob;

export type ExecutionTuple = {
  readonly model: string;
  readonly provider: string;
  readonly endpoint: string;
  readonly cli: string;
  readonly harness: string;
  readonly configVersion: string;
  readonly tools: readonly string[];
  readonly reviewPlan: 'none' | 'preflight' | 'postflight' | 'adversarial';
};

export type EconomicValueUnit = 'usd' | 'normalized-value';

export type EconomicEstimate = {
  /** Null means unknown. Zero is an observed or forecast zero. */
  readonly value: number | null;
  readonly sourceRef: string | null;
  readonly confidence: number;
  readonly material: boolean;
};

export type CapacityEconomics = {
  readonly funding: 'subscription' | 'retail' | 'promo' | 'banked' | 'gift';
  readonly fixedSubscriptionPrice: EconomicEstimate;
  readonly billingPeriodStartedAt: string | null;
  readonly billingPeriodEndsAt: string | null;
  readonly includedCapacityRemaining: EconomicEstimate;
  readonly capacityUnit: string;
  readonly resetOrExpiryAt: string | null;
  readonly accessLossAt: string | null;
  /** Incremental cash for this execution; never the fixed subscription price. */
  readonly marginalCashCost: EconomicEstimate;
  /** Fixed cost allocated per certified outcome for reporting, not routing. */
  readonly amortizedSubscriptionCost: EconomicEstimate;
  readonly retailEquivalentCost: EconomicEstimate;
  readonly sourceRef: string;
};

export type WorkEfficiencyForecast = {
  readonly inputTokens: EconomicEstimate;
  readonly outputTokens: EconomicEstimate;
  readonly cacheTokens: EconomicEstimate;
  readonly modelTurns: EconomicEstimate;
  readonly toolCalls: EconomicEstimate;
  readonly contextRebuilds: EconomicEstimate;
  readonly retries: EconomicEstimate;
  readonly fallbacks: EconomicEstimate;
  readonly firstPassGreenProbability: EconomicEstimate;
  readonly firstPassCertifiedProbability: EconomicEstimate;
  readonly independentReviewFindings: EconomicEstimate;
};

export type ScarceResource =
  | 'symphony-lane-minute'
  | 'gem-host-compute-minute'
  | 'mac-host-compute-minute'
  | 'host-io-minute'
  | 'merge-queue-ci-critical-path-minute'
  | 'founder-attention-minute'
  | 'provider-quota-unit'
  | 'customer-outcome-delay-minute'
  | 'revenue-delay-minute'
  | 'experiment-learning-delay-minute';

export type ResourceDemand = {
  readonly resource: ScarceResource;
  readonly quantity: EconomicEstimate;
  readonly quantityUnit: string;
};

export type FullyLoadedCostProfile = {
  readonly valuationUnit: EconomicValueUnit;
  readonly workloadClass: string;
  readonly directCurrencyCost: EconomicEstimate;
  readonly modelApiToolCost: EconomicEstimate;
  readonly expectedRemediationCost: EconomicEstimate;
  readonly computeRuntimeMinutes: EconomicEstimate;
  readonly wallClockMinutes: EconomicEstimate;
  readonly laneOccupancyMinutes: EconomicEstimate;
  readonly mergeQueueDelayMinutes: EconomicEstimate;
  readonly founderAttentionMinutes: EconomicEstimate;
  readonly humanReviewMinutes: EconomicEstimate;
  readonly expectedRemediationMinutes: EconomicEstimate;
  readonly timeToBenefitMinutes: EconomicEstimate;
  readonly downstreamDelayMinutes: EconomicEstimate;
  readonly resourceDemands: readonly ResourceDemand[];
  readonly capacityEconomics?: CapacityEconomics;
  readonly workEfficiency?: WorkEfficiencyForecast;
  readonly sourceContracts: readonly string[];
  readonly missingSourceContracts: readonly string[];
};

export type DisplacedAlternativeEvidence = {
  readonly id: string;
  readonly expectedValue: number;
  readonly requiredUnits: number;
  readonly valueUnit: EconomicValueUnit;
  readonly sourceRef: string;
  readonly confidence: number;
  readonly eligible: boolean;
};

/**
 * A measured capacity snapshot. The router derives a marginal price from spare
 * capacity and the highest-value eligible work that this demand would displace;
 * callers never provide an arbitrary dollars-per-minute constant.
 */
export type ResourceScarcityEvidence = {
  readonly resource: ScarceResource;
  readonly quantityUnit: string;
  readonly valueUnit: EconomicValueUnit;
  readonly capacityUnits: number;
  readonly committedUnits: number;
  readonly compatibleDemandUnits: number;
  readonly displacedAlternatives: readonly DisplacedAlternativeEvidence[];
  readonly observedAt: string;
  readonly validUntil: string;
  readonly sourceRef: string;
  readonly confidence: number;
  readonly perishableExpiresAt?: string;
};

export type ShadowPricingContext = {
  readonly decisionAt: string;
  readonly evidence: readonly ResourceScarcityEvidence[];
};

export type ShadowPrice = {
  readonly schema: typeof SHADOW_PRICE_SCHEMA;
  readonly resource: ScarceResource;
  readonly status:
    | 'available-headroom'
    | 'perishable-surplus'
    | 'displaces-eligible-work'
    | 'unknown';
  readonly valueUnit: EconomicValueUnit;
  readonly amountPerUnit: number | null;
  readonly demandedUnits: number | null;
  readonly pricedUnits: number | null;
  readonly expectedCost: number | null;
  readonly scarcityRatio: number | null;
  readonly displacedAlternative: DisplacedAlternativeEvidence | null;
  readonly timeToExpiryMinutes: number | null;
  readonly sourceRef: string | null;
  readonly confidence: number;
  readonly missingSourceContract: string | null;
};

export type FullyLoadedCost = {
  readonly schema: typeof FULLY_LOADED_COST_SCHEMA;
  readonly candidateId: string;
  readonly workloadClass: string;
  readonly valuationUnit: EconomicValueUnit;
  readonly directCurrencyCost: EconomicEstimate;
  readonly modelApiToolCost: EconomicEstimate;
  readonly expectedRemediationCost: EconomicEstimate;
  readonly capacityEconomics: CapacityEconomics | null;
  readonly predicted: {
    readonly computeRuntimeMinutes: EconomicEstimate;
    readonly wallClockMinutes: EconomicEstimate;
    readonly laneOccupancyMinutes: EconomicEstimate;
    readonly mergeQueueDelayMinutes: EconomicEstimate;
    readonly founderAttentionMinutes: EconomicEstimate;
    readonly humanReviewMinutes: EconomicEstimate;
    readonly expectedRemediationMinutes: EconomicEstimate;
    readonly timeToBenefitMinutes: EconomicEstimate;
    readonly downstreamDelayMinutes: EconomicEstimate;
    readonly expectedRetries: number;
    readonly failureProbability: number;
    readonly workEfficiency: WorkEfficiencyForecast | null;
  };
  readonly resourceCosts: readonly ShadowPrice[];
  readonly opportunityCost: {
    readonly amount: number | null;
    readonly unit: EconomicValueUnit;
    readonly displacedAlternatives: readonly string[];
  };
  readonly expectedAttempts: number;
  readonly knownLowerBound: number;
  readonly expectedTotal: {
    readonly amount: number | null;
    readonly unit: EconomicValueUnit;
  };
  readonly fullyAllocatedAccountingCost: {
    readonly amount: number | null;
    readonly unit: EconomicValueUnit;
  };
  readonly excludedUnverifiedClaims: readonly string[];
  readonly uncertainty: {
    readonly confidence: number;
    readonly interval: {
      readonly lower: number;
      readonly upper: number | null;
    };
    readonly missingSourceContracts: readonly string[];
  };
  readonly sourceContracts: readonly string[];
};

export type RouteCandidate = {
  readonly id: string;
  readonly tuple: ExecutionTuple;
  /** Legacy normalized estimates retained while measured source contracts land. */
  readonly estimatedTokenCost: number;
  readonly reviewCost: number;
  readonly failureRiskCost: number;
  readonly certifiedSuccessProbability: number;
  readonly expectedRetries: number;
  readonly capabilityMatch: readonly string[];
  readonly maxRiskTier: RiskTier;
  readonly unverifiedEfficiencyClaims?: readonly string[];
  readonly fullyLoadedCostProfile?: FullyLoadedCostProfile;
};

export type RouteReceipt = {
  readonly schema: typeof GOVERNOR_ROUTE_SCHEMA;
  readonly jobId: string;
  readonly jobClass: JobClass;
  readonly riskTier: RiskTier;
  readonly selectedRoute: RouteCandidate;
  readonly alternatives: readonly RouteCandidate[];
  readonly expectedFullyLoadedCost: number;
  readonly fullyLoadedCost: FullyLoadedCost;
  readonly alternativeCosts: readonly FullyLoadedCost[];
  readonly confidence: number;
  readonly certificationPredicate: string;
  readonly escalationPath: string;
  readonly explanation: string;
  readonly provenance: {
    readonly routerVersion: string;
    readonly routesVersion: string;
    readonly selectedAt: string;
  };
};

export type RouteActualOutcome = {
  readonly routeId: string;
  readonly workloadClass: string;
  readonly riskTier: RiskTier;
  readonly observedAt: string;
  readonly sourceRef: string;
  readonly laneOccupancyMinutes: number;
  readonly completionMinutes: number;
  readonly humanInterventionMinutes: number;
  readonly retries: number;
  readonly downstreamDelayMinutes: number;
  readonly inputTokens?: number;
  readonly outputTokens?: number;
  readonly cacheTokens?: number;
  readonly modelTurns?: number;
  readonly toolCalls?: number;
  readonly contextRebuilds?: number;
  readonly fallbacks?: number;
  readonly elapsedToArtifactMinutes?: number;
  readonly elapsedToGreenMinutes?: number;
  readonly firstPassGreen?: boolean;
  readonly firstPassCertified?: boolean;
  readonly independentReviewFindings?: number;
  readonly downstreamIncidents?: number;
  readonly certified?: boolean;
  readonly landed?: boolean;
  readonly marginalCashCost?: number;
  readonly amortizedSubscriptionCost?: number;
  readonly effectiveFullyLoadedCost?: number;
};

export type RouteCalibrationReceipt = {
  readonly schema: typeof ROUTE_CALIBRATION_SCHEMA;
  readonly jobId: string;
  readonly routeId: string;
  readonly workloadClass: string;
  readonly riskTier: RiskTier;
  readonly observedAt: string;
  readonly sourceRef: string;
  readonly predicted: FullyLoadedCost['predicted'];
  readonly actual: RouteActualOutcome;
  readonly dimensions: Readonly<
    Record<
      | 'laneOccupancyMinutes'
      | 'completionMinutes'
      | 'humanInterventionMinutes'
      | 'retries'
      | 'downstreamDelayMinutes',
      {
        readonly predicted: number | null;
        readonly actual: number;
        readonly absoluteError: number | null;
      }
    >
  >;
  readonly costReconciliation: {
    readonly predictedEffectiveCost: number | null;
    readonly actualEffectiveCost: number | null;
    readonly predictedFullyAllocatedCost: number | null;
    readonly actualFullyAllocatedCost: number | null;
  };
};

export type RouteCohortReport = {
  readonly schema: typeof ROUTE_COHORT_SCHEMA;
  readonly routeId: string;
  readonly workloadClass: string;
  readonly riskTier: RiskTier;
  readonly sampleSize: number;
  readonly certifiedOutcomes: number;
  readonly representative: boolean;
  readonly samplingFrameRef: string;
  readonly sourceRefs: readonly string[];
  readonly perCertifiedOutcome: {
    readonly tokens: number | null;
    readonly turns: number | null;
    readonly wallClockMinutes: number | null;
    readonly retries: number | null;
    readonly marginalCashCost: number | null;
    readonly amortizedSubscriptionCost: number | null;
    readonly effectiveFullyLoadedCost: number | null;
    readonly fullyAllocatedCost: number | null;
  };
  readonly firstPassCertificationRate: number | null;
  readonly landedSuccessRate: number | null;
  readonly certifiedOutcomesPerSeatHour: number | null;
};

export class NoCertifiedRouteError extends Error {
  constructor(readonly job: GovernorJob) {
    super(`No certified route for job ${job.id}`);
    this.name = 'NoCertifiedRouteError';
  }
}

export class IncomparableCostBasisError extends Error {
  constructor(readonly units: readonly EconomicValueUnit[]) {
    super(`Cannot compare route cost bases: ${units.join(', ')}`);
    this.name = 'IncomparableCostBasisError';
  }
}

const RISK_TIER_ORDER: Record<RiskTier, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
};

const LEGACY_MISSING_SOURCE_CONTRACTS = [
  'JOV-5484:phase-latency-live-capacity-host-pressure',
  'JOV-5926:execution-attempt-actuals',
  'JOV-5927:cost-value-attribution',
  'JOV-5931:workload-class-forecast',
] as const;

function isRiskAcceptable(
  jobTier: RiskTier,
  candidateMaxTier: RiskTier
): boolean {
  return RISK_TIER_ORDER[candidateMaxTier] >= RISK_TIER_ORDER[jobTier];
}

function hasCapabilities(job: GovernorJob, candidate: RouteCandidate): boolean {
  return job.requiredCapabilities.every(cap =>
    candidate.capabilityMatch.includes(cap)
  );
}

function finiteNonNegative(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}

function clampConfidence(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
}

function round(value: number): number {
  return Number(value.toFixed(6));
}

function estimate(
  value: number | null,
  sourceRef: string | null,
  confidence: number,
  material = true
): EconomicEstimate {
  return {
    value: value !== null && finiteNonNegative(value) ? round(value) : null,
    sourceRef,
    confidence: clampConfidence(confidence),
    material,
  };
}

function unknownEstimate(material = true): EconomicEstimate {
  return estimate(null, null, 0, material);
}

function legacyProfile(candidate: RouteCandidate): FullyLoadedCostProfile {
  const source = `route-registry:${candidate.id}`;
  return {
    valuationUnit: 'normalized-value',
    workloadClass: 'legacy-unclassified',
    directCurrencyCost: unknownEstimate(false),
    modelApiToolCost: estimate(
      candidate.estimatedTokenCost,
      `${source}:model-token-estimate`,
      0.25
    ),
    expectedRemediationCost: estimate(
      candidate.reviewCost + candidate.failureRiskCost,
      `${source}:review-failure-estimate`,
      0.25
    ),
    computeRuntimeMinutes: unknownEstimate(),
    wallClockMinutes: unknownEstimate(),
    laneOccupancyMinutes: unknownEstimate(),
    mergeQueueDelayMinutes: unknownEstimate(),
    founderAttentionMinutes: unknownEstimate(),
    humanReviewMinutes: unknownEstimate(),
    expectedRemediationMinutes: unknownEstimate(),
    timeToBenefitMinutes: unknownEstimate(),
    downstreamDelayMinutes: unknownEstimate(),
    resourceDemands: [],
    sourceContracts: [source],
    missingSourceContracts: LEGACY_MISSING_SOURCE_CONTRACTS,
  };
}

function validScarcityEvidence(
  evidence: ResourceScarcityEvidence,
  demand: ResourceDemand,
  context: ShadowPricingContext,
  valueUnit: EconomicValueUnit
): boolean {
  const decisionAt = Date.parse(context.decisionAt);
  const observedAt = Date.parse(evidence.observedAt);
  const validUntil = Date.parse(evidence.validUntil);
  const perishableExpiresAt = evidence.perishableExpiresAt
    ? Date.parse(evidence.perishableExpiresAt)
    : null;
  return (
    evidence.resource === demand.resource &&
    evidence.quantityUnit === demand.quantityUnit &&
    evidence.valueUnit === valueUnit &&
    Number.isFinite(decisionAt) &&
    Number.isFinite(observedAt) &&
    Number.isFinite(validUntil) &&
    observedAt <= decisionAt &&
    decisionAt <= validUntil &&
    finiteNonNegative(evidence.capacityUnits) &&
    evidence.capacityUnits > 0 &&
    finiteNonNegative(evidence.committedUnits) &&
    finiteNonNegative(evidence.compatibleDemandUnits) &&
    (perishableExpiresAt === null ||
      (Number.isFinite(perishableExpiresAt) &&
        decisionAt <= perishableExpiresAt)) &&
    Boolean(evidence.sourceRef)
  );
}

function unknownShadowPrice(
  demand: ResourceDemand,
  valueUnit: EconomicValueUnit,
  missingSourceContract: string
): ShadowPrice {
  return {
    schema: SHADOW_PRICE_SCHEMA,
    resource: demand.resource,
    status: 'unknown',
    valueUnit,
    amountPerUnit: null,
    demandedUnits: demand.quantity.value,
    pricedUnits: null,
    expectedCost: null,
    scarcityRatio: null,
    displacedAlternative: null,
    timeToExpiryMinutes: null,
    sourceRef: null,
    confidence: 0,
    missingSourceContract,
  };
}

export function deriveShadowPrice(
  demand: ResourceDemand,
  context: ShadowPricingContext | undefined,
  valueUnit: EconomicValueUnit
): ShadowPrice {
  if (demand.quantity.value === null) {
    return unknownShadowPrice(
      demand,
      valueUnit,
      `measurement:${demand.resource}:${demand.quantityUnit}`
    );
  }
  const evidence = [...(context?.evidence ?? [])]
    .filter(row =>
      context ? validScarcityEvidence(row, demand, context, valueUnit) : false
    )
    .sort(
      (left, right) =>
        Date.parse(right.observedAt) - Date.parse(left.observedAt)
    )[0];
  if (!evidence || !context) {
    return unknownShadowPrice(
      demand,
      valueUnit,
      `shadow-price:${demand.resource}:${demand.quantityUnit}`
    );
  }

  const decisionAt = Date.parse(context.decisionAt);
  const expiry = evidence.perishableExpiresAt
    ? Date.parse(evidence.perishableExpiresAt)
    : Number.NaN;
  const timeToExpiryMinutes = Number.isFinite(expiry)
    ? round(Math.max(0, expiry - decisionAt) / 60_000)
    : null;
  const availableUnits = Math.max(
    0,
    evidence.capacityUnits - evidence.committedUnits
  );
  const surplusUnits = Math.max(
    0,
    availableUnits - evidence.compatibleDemandUnits
  );
  const demandedUnits = demand.quantity.value;
  const pricedUnits = Math.max(0, demandedUnits - surplusUnits);
  const scarcityRatio = round(
    (evidence.committedUnits + evidence.compatibleDemandUnits) /
      evidence.capacityUnits
  );

  if (pricedUnits === 0) {
    return {
      schema: SHADOW_PRICE_SCHEMA,
      resource: demand.resource,
      status: Number.isFinite(expiry)
        ? 'perishable-surplus'
        : 'available-headroom',
      valueUnit,
      amountPerUnit: 0,
      demandedUnits,
      pricedUnits: 0,
      expectedCost: 0,
      scarcityRatio,
      displacedAlternative: null,
      timeToExpiryMinutes,
      sourceRef: evidence.sourceRef,
      confidence: clampConfidence(
        Math.min(evidence.confidence, demand.quantity.confidence)
      ),
      missingSourceContract: null,
    };
  }

  const displacedAlternative = evidence.displacedAlternatives
    .filter(
      alternative =>
        alternative.eligible &&
        alternative.valueUnit === valueUnit &&
        finiteNonNegative(alternative.expectedValue) &&
        finiteNonNegative(alternative.requiredUnits) &&
        alternative.requiredUnits > 0 &&
        Boolean(alternative.sourceRef)
    )
    .sort(
      (left, right) =>
        right.expectedValue / right.requiredUnits -
          left.expectedValue / left.requiredUnits ||
        left.id.localeCompare(right.id)
    )[0];
  if (!displacedAlternative) {
    return unknownShadowPrice(
      demand,
      valueUnit,
      `displaced-work:${demand.resource}`
    );
  }

  const amountPerUnit = round(
    displacedAlternative.expectedValue / displacedAlternative.requiredUnits
  );
  return {
    schema: SHADOW_PRICE_SCHEMA,
    resource: demand.resource,
    status: 'displaces-eligible-work',
    valueUnit,
    amountPerUnit,
    demandedUnits,
    pricedUnits: round(pricedUnits),
    expectedCost: round(pricedUnits * amountPerUnit),
    scarcityRatio,
    displacedAlternative,
    timeToExpiryMinutes,
    sourceRef: evidence.sourceRef,
    confidence: clampConfidence(
      Math.min(
        evidence.confidence,
        demand.quantity.confidence,
        displacedAlternative.confidence
      )
    ),
    missingSourceContract: null,
  };
}

function sourceContractsFor(
  profile: FullyLoadedCostProfile,
  resourceCosts: readonly ShadowPrice[]
): readonly string[] {
  const capacity = profile.capacityEconomics;
  const work = profile.workEfficiency;
  const estimates = [
    profile.directCurrencyCost,
    profile.modelApiToolCost,
    profile.expectedRemediationCost,
    profile.computeRuntimeMinutes,
    profile.wallClockMinutes,
    profile.laneOccupancyMinutes,
    profile.mergeQueueDelayMinutes,
    profile.founderAttentionMinutes,
    profile.humanReviewMinutes,
    profile.expectedRemediationMinutes,
    profile.timeToBenefitMinutes,
    profile.downstreamDelayMinutes,
    ...(capacity
      ? [
          capacity.fixedSubscriptionPrice,
          capacity.includedCapacityRemaining,
          capacity.marginalCashCost,
          capacity.amortizedSubscriptionCost,
          capacity.retailEquivalentCost,
        ]
      : []),
    ...(work ? Object.values(work) : []),
    ...profile.resourceDemands.map(demand => demand.quantity),
  ];
  return [
    ...new Set([
      ...profile.sourceContracts,
      ...(capacity ? [capacity.sourceRef] : []),
      ...estimates
        .map(row => row.sourceRef)
        .filter((ref): ref is string => !!ref),
      ...resourceCosts
        .map(row => row.sourceRef)
        .filter((ref): ref is string => !!ref),
    ]),
  ].sort();
}

function missingContractsFor(
  profile: FullyLoadedCostProfile,
  resourceCosts: readonly ShadowPrice[]
): readonly string[] {
  const namedEstimates: readonly (readonly [string, EconomicEstimate])[] = [
    ['direct-currency-cost', profile.directCurrencyCost],
    ['model-api-token-cache-search-tool-cost', profile.modelApiToolCost],
    ['expected-remediation-cost', profile.expectedRemediationCost],
    ['compute-runtime-minutes', profile.computeRuntimeMinutes],
    ['wall-clock-minutes', profile.wallClockMinutes],
    ['lane-occupancy-minutes', profile.laneOccupancyMinutes],
    ['merge-queue-delay-minutes', profile.mergeQueueDelayMinutes],
    ['founder-attention-minutes', profile.founderAttentionMinutes],
    ['human-review-minutes', profile.humanReviewMinutes],
    ['expected-remediation-minutes', profile.expectedRemediationMinutes],
    ['time-to-benefit-minutes', profile.timeToBenefitMinutes],
    ['downstream-delay-minutes', profile.downstreamDelayMinutes],
    ...(profile.capacityEconomics
      ? ([
          [
            'capacity-marginal-cash-cost',
            profile.capacityEconomics.marginalCashCost,
          ],
        ] as const)
      : []),
    ...(profile.workEfficiency
      ? ([
          ['expected-retries', profile.workEfficiency.retries],
          [
            'first-pass-certified-probability',
            profile.workEfficiency.firstPassCertifiedProbability,
          ],
        ] as const)
      : []),
  ];
  return [
    ...new Set([
      ...profile.missingSourceContracts,
      ...namedEstimates
        .filter(([, row]) => row.material && row.value === null)
        .map(([name]) => `measurement:${name}`),
      ...profile.resourceDemands
        .filter(
          demand => demand.quantity.material && demand.quantity.value === null
        )
        .map(demand => `measurement:${demand.resource}`),
      ...resourceCosts
        .map(row => row.missingSourceContract)
        .filter((ref): ref is string => !!ref),
    ]),
  ].sort();
}

function buildFullyLoadedCost(
  candidate: RouteCandidate,
  context: ShadowPricingContext | undefined
): FullyLoadedCost {
  const profile = candidate.fullyLoadedCostProfile ?? legacyProfile(candidate);
  const resourceCosts = profile.resourceDemands.map(demand =>
    deriveShadowPrice(demand, context, profile.valuationUnit)
  );
  const capacity = profile.capacityEconomics;
  const work = profile.workEfficiency;
  const directCosts = [
    profile.directCurrencyCost,
    ...(capacity ? [capacity.marginalCashCost] : []),
    profile.modelApiToolCost,
    profile.expectedRemediationCost,
  ];
  const knownPerAttempt = directCosts.reduce(
    (sum, row) => sum + (row.value ?? 0),
    0
  );
  const knownResourceCost = resourceCosts.reduce(
    (sum, row) => sum + (row.expectedCost ?? 0),
    0
  );
  const measuredRetries = work?.retries.value;
  const measuredFirstPass = work?.firstPassCertifiedProbability.value;
  const expectedRetries =
    measuredRetries !== null && measuredRetries !== undefined
      ? measuredRetries
      : candidate.expectedRetries;
  const firstPassProbability =
    measuredFirstPass !== null &&
    measuredFirstPass !== undefined &&
    measuredFirstPass <= 1
      ? measuredFirstPass
      : candidate.certifiedSuccessProbability;
  const expectedAttempts = round(
    (1 + expectedRetries) / Math.max(firstPassProbability, Number.EPSILON)
  );
  const knownLowerBound = round(
    (knownPerAttempt + knownResourceCost) * expectedAttempts
  );
  const missingSourceContracts = missingContractsFor(profile, resourceCosts);
  const sourceContracts = sourceContractsFor(profile, resourceCosts);
  const confidences = [
    ...directCosts.filter(row => row.value !== null).map(row => row.confidence),
    ...resourceCosts
      .filter(row => row.expectedCost !== null)
      .map(row => row.confidence),
  ];
  const confidence = clampConfidence(
    Math.min(firstPassProbability, ...confidences, 1)
  );
  const complete = missingSourceContracts.length === 0;
  const fullyAllocatedAmount =
    complete && (!capacity || capacity.amortizedSubscriptionCost.value !== null)
      ? round(
          knownLowerBound + (capacity?.amortizedSubscriptionCost.value ?? 0)
        )
      : null;
  const displacedAlternatives = resourceCosts
    .map(row => row.displacedAlternative?.id)
    .filter((id): id is string => !!id);
  const opportunityKnown = resourceCosts
    .filter(row => row.displacedAlternative)
    .reduce((sum, row) => sum + (row.expectedCost ?? 0), 0);
  const opportunityUnknown = resourceCosts.some(
    row => row.status === 'unknown' && row.demandedUnits !== 0
  );

  return {
    schema: FULLY_LOADED_COST_SCHEMA,
    candidateId: candidate.id,
    workloadClass: profile.workloadClass,
    valuationUnit: profile.valuationUnit,
    directCurrencyCost: profile.directCurrencyCost,
    modelApiToolCost: profile.modelApiToolCost,
    expectedRemediationCost: profile.expectedRemediationCost,
    capacityEconomics: capacity ?? null,
    predicted: {
      computeRuntimeMinutes: profile.computeRuntimeMinutes,
      wallClockMinutes: profile.wallClockMinutes,
      laneOccupancyMinutes: profile.laneOccupancyMinutes,
      mergeQueueDelayMinutes: profile.mergeQueueDelayMinutes,
      founderAttentionMinutes: profile.founderAttentionMinutes,
      humanReviewMinutes: profile.humanReviewMinutes,
      expectedRemediationMinutes: profile.expectedRemediationMinutes,
      timeToBenefitMinutes: profile.timeToBenefitMinutes,
      downstreamDelayMinutes: profile.downstreamDelayMinutes,
      expectedRetries,
      failureProbability: round(Math.max(0, 1 - firstPassProbability)),
      workEfficiency: work ?? null,
    },
    resourceCosts,
    opportunityCost: {
      amount: opportunityUnknown ? null : round(opportunityKnown),
      unit: profile.valuationUnit,
      displacedAlternatives: [...new Set(displacedAlternatives)].sort(),
    },
    expectedAttempts,
    knownLowerBound,
    expectedTotal: {
      amount: complete ? knownLowerBound : null,
      unit: profile.valuationUnit,
    },
    fullyAllocatedAccountingCost: {
      amount: fullyAllocatedAmount,
      unit: profile.valuationUnit,
    },
    excludedUnverifiedClaims: candidate.unverifiedEfficiencyClaims ?? [],
    uncertainty: {
      confidence,
      interval: {
        lower: knownLowerBound,
        upper: complete ? knownLowerBound : null,
      },
      missingSourceContracts,
    },
    sourceContracts,
  };
}

function compareCosts(
  left: { candidate: RouteCandidate; cost: FullyLoadedCost },
  right: { candidate: RouteCandidate; cost: FullyLoadedCost }
): number {
  const leftTotal = left.cost.expectedTotal.amount;
  const rightTotal = right.cost.expectedTotal.amount;
  if (leftTotal !== null && rightTotal !== null) {
    return (
      leftTotal - rightTotal ||
      left.candidate.id.localeCompare(right.candidate.id)
    );
  }
  if (leftTotal !== null) return -1;
  if (rightTotal !== null) return 1;
  return (
    left.cost.knownLowerBound - right.cost.knownLowerBound ||
    right.cost.uncertainty.confidence - left.cost.uncertainty.confidence ||
    left.candidate.id.localeCompare(right.candidate.id)
  );
}

export function explainRouteDecision(
  receipt: Pick<
    RouteReceipt,
    'selectedRoute' | 'alternatives' | 'fullyLoadedCost'
  >
): string {
  const cost = receipt.fullyLoadedCost;
  const direct = cost.directCurrencyCost.value;
  const marginal = cost.capacityEconomics?.marginalCashCost.value;
  const model = cost.modelApiToolCost.value;
  const capacity = cost.resourceCosts.reduce(
    (sum, row) => sum + (row.expectedCost ?? 0),
    0
  );
  const displaced = cost.opportunityCost.displacedAlternatives.join(', ');
  const total = cost.expectedTotal.amount;
  const allocated = cost.fullyAllocatedAccountingCost.amount;
  const work = cost.predicted.workEfficiency;
  const uncertainty = cost.uncertainty.missingSourceContracts.length
    ? `unknown upper bound; missing ${cost.uncertainty.missingSourceContracts.join(', ')}`
    : `complete ${cost.valuationUnit} estimate`;
  return [
    `Selected ${receipt.selectedRoute.id}`,
    `direct=${direct ?? 'unknown'} ${cost.valuationUnit}`,
    `marginal-cash=${marginal ?? direct ?? 'unknown'} ${cost.valuationUnit}`,
    `model/tool=${model ?? 'unknown'} ${cost.valuationUnit}`,
    `time/capacity=${round(capacity)} ${cost.valuationUnit}`,
    `opportunity=${cost.opportunityCost.amount ?? 'unknown'} ${cost.valuationUnit}`,
    `total=${total ?? `>=${cost.knownLowerBound}`} ${cost.valuationUnit}`,
    `allocated=${allocated ?? 'unknown'} ${cost.valuationUnit}`,
    `turns=${work?.modelTurns.value ?? 'unknown'}`,
    `first-pass-certified=${work?.firstPassCertifiedProbability.value ?? 'unknown'}`,
    `uncertainty=${uncertainty}`,
    `displaced=${displaced || 'none observed'}`,
    `excluded-claims=${cost.excludedUnverifiedClaims.join(', ') || 'none'}`,
    `alternatives=${receipt.alternatives.map(row => row.id).join(', ') || 'none'}`,
  ].join('; ');
}

export function routeByExpectedCost(
  job: GovernorJob,
  candidates: readonly RouteCandidate[],
  routesVersion = 'unknown',
  shadowPricing?: ShadowPricingContext
): RouteReceipt {
  const eligible = candidates.filter(
    candidate =>
      isRiskAcceptable(job.riskTier, candidate.maxRiskTier) &&
      hasCapabilities(job, candidate)
  );

  if (eligible.length === 0) {
    throw new NoCertifiedRouteError(job);
  }

  const scored = eligible.map(candidate => ({
    candidate,
    cost: buildFullyLoadedCost(candidate, shadowPricing),
  }));
  const units = [...new Set(scored.map(row => row.cost.valuationUnit))];
  if (units.length !== 1) {
    throw new IncomparableCostBasisError(units);
  }
  scored.sort(compareCosts);

  const selected = scored[0];
  const receiptWithoutExplanation = {
    schema: GOVERNOR_ROUTE_SCHEMA,
    jobId: job.id,
    jobClass: job.jobClass,
    riskTier: job.riskTier,
    selectedRoute: selected.candidate,
    alternatives: scored.slice(1).map(entry => entry.candidate),
    expectedFullyLoadedCost:
      selected.cost.expectedTotal.amount ?? selected.cost.knownLowerBound,
    fullyLoadedCost: selected.cost,
    alternativeCosts: scored.slice(1).map(entry => entry.cost),
    confidence: selected.cost.uncertainty.confidence,
    certificationPredicate: job.certificationPredicate,
    escalationPath: `symphony-escalate:${job.id}`,
    provenance: {
      routerVersion: GOVERNOR_ROUTER_VERSION,
      routesVersion,
      selectedAt: shadowPricing?.decisionAt ?? new Date().toISOString(),
    },
  };
  return {
    ...receiptWithoutExplanation,
    explanation: explainRouteDecision(receiptWithoutExplanation),
  };
}

function predictionError(
  predicted: number | null,
  actual: number
): { predicted: number | null; actual: number; absoluteError: number | null } {
  return {
    predicted,
    actual,
    absoluteError:
      predicted === null ? null : round(Math.abs(actual - predicted)),
  };
}

export function calibrateRouteCost(
  receipt: RouteReceipt,
  outcome: RouteActualOutcome
): RouteCalibrationReceipt {
  if (
    outcome.routeId !== receipt.selectedRoute.id ||
    outcome.workloadClass !== receipt.fullyLoadedCost.workloadClass ||
    outcome.riskTier !== receipt.riskTier
  ) {
    throw new Error('route outcome does not match selected workload');
  }
  const actuals = [
    outcome.laneOccupancyMinutes,
    outcome.completionMinutes,
    outcome.humanInterventionMinutes,
    outcome.retries,
    outcome.downstreamDelayMinutes,
    outcome.inputTokens,
    outcome.outputTokens,
    outcome.cacheTokens,
    outcome.modelTurns,
    outcome.toolCalls,
    outcome.contextRebuilds,
    outcome.fallbacks,
    outcome.elapsedToArtifactMinutes,
    outcome.elapsedToGreenMinutes,
    outcome.independentReviewFindings,
    outcome.downstreamIncidents,
    outcome.marginalCashCost,
    outcome.amortizedSubscriptionCost,
    outcome.effectiveFullyLoadedCost,
  ];
  if (
    !outcome.sourceRef ||
    !Number.isFinite(Date.parse(outcome.observedAt)) ||
    actuals.some(value => value !== undefined && !finiteNonNegative(value))
  ) {
    throw new Error('route outcome requires non-negative sourced actuals');
  }
  const predicted = receipt.fullyLoadedCost.predicted;
  const humanPrediction =
    predicted.founderAttentionMinutes.value === null ||
    predicted.humanReviewMinutes.value === null
      ? null
      : round(
          predicted.founderAttentionMinutes.value +
            predicted.humanReviewMinutes.value
        );
  return {
    schema: ROUTE_CALIBRATION_SCHEMA,
    jobId: receipt.jobId,
    routeId: outcome.routeId,
    workloadClass: outcome.workloadClass,
    riskTier: outcome.riskTier,
    observedAt: outcome.observedAt,
    sourceRef: outcome.sourceRef,
    predicted,
    actual: outcome,
    dimensions: {
      laneOccupancyMinutes: predictionError(
        predicted.laneOccupancyMinutes.value,
        outcome.laneOccupancyMinutes
      ),
      completionMinutes: predictionError(
        predicted.wallClockMinutes.value,
        outcome.completionMinutes
      ),
      humanInterventionMinutes: predictionError(
        humanPrediction,
        outcome.humanInterventionMinutes
      ),
      retries: predictionError(predicted.expectedRetries, outcome.retries),
      downstreamDelayMinutes: predictionError(
        predicted.downstreamDelayMinutes.value,
        outcome.downstreamDelayMinutes
      ),
    },
    costReconciliation: {
      predictedEffectiveCost: receipt.fullyLoadedCost.expectedTotal.amount,
      actualEffectiveCost: outcome.effectiveFullyLoadedCost ?? null,
      predictedFullyAllocatedCost:
        receipt.fullyLoadedCost.fullyAllocatedAccountingCost.amount,
      actualFullyAllocatedCost:
        outcome.effectiveFullyLoadedCost === undefined ||
        outcome.amortizedSubscriptionCost === undefined
          ? null
          : round(
              outcome.effectiveFullyLoadedCost +
                outcome.amortizedSubscriptionCost
            ),
    },
  };
}

export function summarizeRouteCohort(
  outcomes: readonly RouteActualOutcome[],
  samplingFrameRef: string,
  representativeSampling: boolean,
  minimumSampleSize = 3
): RouteCohortReport {
  if (outcomes.length === 0 || !samplingFrameRef) {
    throw new Error('cohort requires outcomes and a sampling frame');
  }
  const first = outcomes[0];
  if (
    outcomes.some(
      row =>
        row.routeId !== first.routeId ||
        row.workloadClass !== first.workloadClass ||
        row.riskTier !== first.riskTier
    )
  ) {
    throw new Error('cohort must contain one route, workload, and risk class');
  }
  const certified = outcomes.filter(row => row.certified);
  const denominator = certified.length;
  const perCertified = (
    value: (row: RouteActualOutcome) => number | undefined
  ): number | null => {
    const values = certified.map(value);
    return denominator > 0 && values.every(row => row !== undefined)
      ? round(
          values.reduce<number>((sum, row) => sum + (row ?? 0), 0) / denominator
        )
      : null;
  };
  const effective = perCertified(row => row.effectiveFullyLoadedCost);
  const amortized = perCertified(row => row.amortizedSubscriptionCost);
  const laneMinutes = certified.reduce(
    (sum, row) => sum + row.laneOccupancyMinutes,
    0
  );
  const complete = outcomes.every(
    row =>
      row.inputTokens !== undefined &&
      row.outputTokens !== undefined &&
      row.cacheTokens !== undefined &&
      row.modelTurns !== undefined &&
      row.toolCalls !== undefined &&
      row.contextRebuilds !== undefined &&
      row.fallbacks !== undefined &&
      row.elapsedToArtifactMinutes !== undefined &&
      row.elapsedToGreenMinutes !== undefined &&
      row.firstPassGreen !== undefined &&
      row.marginalCashCost !== undefined &&
      row.amortizedSubscriptionCost !== undefined &&
      row.effectiveFullyLoadedCost !== undefined &&
      row.firstPassCertified !== undefined &&
      row.independentReviewFindings !== undefined &&
      row.downstreamIncidents !== undefined &&
      row.certified !== undefined &&
      row.landed !== undefined
  );
  return {
    schema: ROUTE_COHORT_SCHEMA,
    routeId: first.routeId,
    workloadClass: first.workloadClass,
    riskTier: first.riskTier,
    sampleSize: outcomes.length,
    certifiedOutcomes: denominator,
    representative:
      representativeSampling &&
      complete &&
      denominator > 0 &&
      outcomes.length >= minimumSampleSize,
    samplingFrameRef,
    sourceRefs: [...new Set(outcomes.map(row => row.sourceRef))].sort(),
    perCertifiedOutcome: {
      tokens: perCertified(row =>
        row.inputTokens === undefined ||
        row.outputTokens === undefined ||
        row.cacheTokens === undefined
          ? undefined
          : row.inputTokens + row.outputTokens + row.cacheTokens
      ),
      turns: perCertified(row => row.modelTurns),
      wallClockMinutes: perCertified(row => row.completionMinutes),
      retries: perCertified(row => row.retries),
      marginalCashCost: perCertified(row => row.marginalCashCost),
      amortizedSubscriptionCost: amortized,
      effectiveFullyLoadedCost: effective,
      fullyAllocatedCost:
        effective === null || amortized === null
          ? null
          : round(effective + amortized),
    },
    firstPassCertificationRate:
      denominator === 0
        ? null
        : round(
            outcomes.filter(row => row.firstPassCertified).length /
              outcomes.length
          ),
    landedSuccessRate: round(
      outcomes.filter(row => row.landed).length / outcomes.length
    ),
    certifiedOutcomesPerSeatHour:
      laneMinutes > 0 ? round(denominator / (laneMinutes / 60)) : null,
  };
}

export function deriveMeasuredEfficiencyMultiplier(
  incumbent: RouteCohortReport,
  challenger: RouteCohortReport
): number | null {
  const incumbentCost = incumbent.perCertifiedOutcome.effectiveFullyLoadedCost;
  const challengerCost =
    challenger.perCertifiedOutcome.effectiveFullyLoadedCost;
  return incumbent.representative &&
    challenger.representative &&
    incumbent.workloadClass === challenger.workloadClass &&
    incumbent.riskTier === challenger.riskTier &&
    incumbentCost !== null &&
    challengerCost !== null &&
    challengerCost > 0
    ? round(incumbentCost / challengerCost)
    : null;
}

export const SUMMER_SYMPHONY_ROUTES: readonly RouteCandidate[] = [
  {
    id: 'local-qwen',
    tuple: {
      model: 'qwen3-coder:30b',
      provider: 'ollama',
      endpoint: 'local-ollama',
      cli: 'local',
      harness: 'eve',
      configVersion: 'v1',
      tools: ['bash'],
      reviewPlan: 'none',
    },
    estimatedTokenCost: 1,
    reviewCost: 0,
    failureRiskCost: 10,
    certifiedSuccessProbability: 0.85,
    expectedRetries: 1,
    capabilityMatch: ['mechanical', 'support'],
    maxRiskTier: 'low',
  },
  {
    id: 'cheap-api-reasoner',
    tuple: {
      model: 'deepseek/deepseek-v4-flash',
      provider: 'vercel-ai-gateway',
      endpoint: 'vercel-ai-gateway',
      cli: 'vercel-gateway',
      harness: 'eve',
      configVersion: 'v1',
      tools: ['web-search', 'bash'],
      reviewPlan: 'postflight',
    },
    estimatedTokenCost: 2,
    reviewCost: 5,
    failureRiskCost: 50,
    certifiedSuccessProbability: 0.5,
    expectedRetries: 2,
    capabilityMatch: ['reasoning', 'product', 'support'],
    maxRiskTier: 'medium',
  },
  {
    id: 'summer-symphony-think',
    tuple: {
      model: 'symphony',
      provider: 'gem',
      endpoint: 'gem-symphony',
      cli: 'symphony',
      harness: 'eve',
      configVersion: 'v1',
      tools: ['gbrain', 'linear', 'github'],
      reviewPlan: 'postflight',
    },
    estimatedTokenCost: 20,
    reviewCost: 5,
    failureRiskCost: 5,
    certifiedSuccessProbability: 0.95,
    expectedRetries: 0,
    capabilityMatch: [
      'reasoning',
      'product',
      'support',
      'financial',
      'legal',
      'architecture',
    ],
    maxRiskTier: 'critical',
  },
];

export function routeSummerSymphonyDecisionJob(job: DecisionJob): RouteReceipt {
  return routeByExpectedCost(
    job,
    SUMMER_SYMPHONY_ROUTES,
    'summer-symphony-stub-2026-09-06'
  );
}
