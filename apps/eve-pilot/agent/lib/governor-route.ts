export const GOVERNOR_ROUTE_SCHEMA =
  'jovie.eve.governor.route-receipt/v1' as const;
export const GOVERNOR_ROUTER_VERSION = '2026-09-06' as const;

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
  readonly cli: string;
  readonly configVersion: string;
  readonly tools: readonly string[];
  readonly reviewPlan: 'none' | 'preflight' | 'postflight' | 'adversarial';
};

export type RouteCandidate = {
  readonly id: string;
  readonly tuple: ExecutionTuple;
  readonly estimatedTokenCost: number;
  readonly reviewCost: number;
  readonly failureRiskCost: number;
  readonly certifiedSuccessProbability: number;
  readonly expectedRetries: number;
  readonly capabilityMatch: readonly string[];
  readonly maxRiskTier: RiskTier;
};

export type RouteReceipt = {
  readonly schema: typeof GOVERNOR_ROUTE_SCHEMA;
  readonly jobId: string;
  readonly jobClass: JobClass;
  readonly riskTier: RiskTier;
  readonly selectedRoute: RouteCandidate;
  readonly alternatives: readonly RouteCandidate[];
  readonly expectedFullyLoadedCost: number;
  readonly confidence: number;
  readonly certificationPredicate: string;
  readonly escalationPath: string;
  readonly provenance: {
    readonly routerVersion: string;
    readonly routesVersion: string;
    readonly selectedAt: string;
  };
};

export class NoCertifiedRouteError extends Error {
  constructor(readonly job: GovernorJob) {
    super(`No certified route for job ${job.id}`);
    this.name = 'NoCertifiedRouteError';
  }
}

const RISK_TIER_ORDER: Record<RiskTier, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
};

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

function computeExpectedCost(candidate: RouteCandidate): number {
  const perAttemptCost =
    candidate.estimatedTokenCost +
    candidate.reviewCost +
    candidate.failureRiskCost;
  const expectedAttempts =
    (1 + candidate.expectedRetries) / candidate.certifiedSuccessProbability;
  return perAttemptCost * expectedAttempts;
}

export function routeByExpectedCost(
  job: GovernorJob,
  candidates: readonly RouteCandidate[],
  routesVersion = 'unknown'
): RouteReceipt {
  const eligible = candidates.filter(
    candidate =>
      isRiskAcceptable(job.riskTier, candidate.maxRiskTier) &&
      hasCapabilities(job, candidate)
  );

  if (eligible.length === 0) {
    throw new NoCertifiedRouteError(job);
  }

  const scored = eligible
    .map(candidate => ({
      candidate,
      expectedCost: computeExpectedCost(candidate),
    }))
    .sort((left, right) => left.expectedCost - right.expectedCost);

  const selected = scored[0];

  return {
    schema: GOVERNOR_ROUTE_SCHEMA,
    jobId: job.id,
    jobClass: job.jobClass,
    riskTier: job.riskTier,
    selectedRoute: selected.candidate,
    alternatives: scored.slice(1).map(entry => entry.candidate),
    expectedFullyLoadedCost: selected.expectedCost,
    confidence: selected.candidate.certifiedSuccessProbability,
    certificationPredicate: job.certificationPredicate,
    escalationPath: `symphony-escalate:${job.id}`,
    provenance: {
      routerVersion: GOVERNOR_ROUTER_VERSION,
      routesVersion,
      selectedAt: new Date().toISOString(),
    },
  };
}

export const SUMMER_SYMPHONY_ROUTES: readonly RouteCandidate[] = [
  {
    id: 'local-qwen',
    tuple: {
      model: 'qwen3-coder:30b',
      provider: 'ollama',
      cli: 'local',
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
      cli: 'vercel-gateway',
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
      cli: 'symphony',
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
