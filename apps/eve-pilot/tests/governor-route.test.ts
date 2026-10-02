import { describe, expect, it } from 'vitest';
import {
  type CapacityEconomics,
  calibrateRouteCost,
  type DecisionJob,
  deriveMeasuredEfficiencyMultiplier,
  deriveShadowPrice,
  type EconomicEstimate,
  type FullyLoadedCostProfile,
  GOVERNOR_ROUTE_SCHEMA,
  GOVERNOR_ROUTER_VERSION,
  NoCertifiedRouteError,
  type ResourceDemand,
  type ResourceScarcityEvidence,
  type RouteCandidate,
  routeByExpectedCost,
  routeSummerSymphonyDecisionJob,
  SUMMER_SYMPHONY_ROUTES,
  summarizeRouteCohort,
} from '../agent/lib/governor-route';

function decisionJob(
  jobClass: DecisionJob['jobClass'],
  riskTier: DecisionJob['riskTier'],
  ...capabilities: string[]
): DecisionJob {
  return {
    kind: 'decision',
    id: `job-${jobClass}-${riskTier}`,
    jobClass,
    riskTier,
    objective: 'certified decision job fixture',
    requiredCapabilities: capabilities,
    certificationPredicate: 'human-reviewed-and-signed',
    authority: 'automation',
    evidenceRefs: ['evidence-1'],
  };
}

function observed(value: number, name: string): EconomicEstimate {
  return {
    value,
    sourceRef: `fixture://${name}`,
    confidence: 0.9,
    material: true,
  };
}

function subscription(
  id: string,
  marginalCashCost: number,
  amortizedSubscriptionCost: number
): CapacityEconomics {
  return {
    funding: 'subscription',
    fixedSubscriptionPrice: observed(200, `${id}/fixed`),
    billingPeriodStartedAt: '2026-09-01T00:00:00.000Z',
    billingPeriodEndsAt: '2026-10-01T00:00:00.000Z',
    includedCapacityRemaining: observed(100, `${id}/remaining`),
    capacityUnit: 'quota-unit',
    resetOrExpiryAt: '2026-09-28T13:00:00.000Z',
    accessLossAt: null,
    marginalCashCost: observed(marginalCashCost, `${id}/marginal`),
    amortizedSubscriptionCost: observed(
      amortizedSubscriptionCost,
      `${id}/allocated`
    ),
    retailEquivalentCost: observed(4, `${id}/retail`),
    sourceRef: `capacity-ledger://${id}`,
  };
}

function measuredCohort(routeId: string, effectiveCost: number) {
  return summarizeRouteCohort(
    [0, 1, 2].map(index => ({
      routeId,
      workloadClass: 'fixture-workload',
      riskTier: 'low' as const,
      observedAt: `2026-09-28T13:0${index}:00.000Z`,
      sourceRef: `outcome://${routeId}/${index}`,
      laneOccupancyMinutes: 20,
      completionMinutes: 20,
      humanInterventionMinutes: 0,
      retries: 0,
      downstreamDelayMinutes: 0,
      inputTokens: 100,
      outputTokens: 20,
      cacheTokens: 10,
      modelTurns: 1,
      toolCalls: 2,
      contextRebuilds: 0,
      fallbacks: 0,
      elapsedToArtifactMinutes: 10,
      elapsedToGreenMinutes: 15,
      firstPassGreen: true,
      firstPassCertified: true,
      independentReviewFindings: 0,
      downstreamIncidents: 0,
      certified: true,
      landed: true,
      marginalCashCost: effectiveCost,
      amortizedSubscriptionCost: 0,
      effectiveFullyLoadedCost: effectiveCost,
    })),
    'sampling-frame://representative-fixture',
    true
  );
}

function costProfile(
  id: string,
  directCurrencyCost: number,
  overrides: Partial<FullyLoadedCostProfile> = {}
): FullyLoadedCostProfile {
  return {
    valuationUnit: 'usd',
    workloadClass: 'fixture-workload',
    directCurrencyCost: observed(directCurrencyCost, `${id}/direct`),
    modelApiToolCost: observed(0, `${id}/model`),
    expectedRemediationCost: observed(0, `${id}/remediation-cost`),
    computeRuntimeMinutes: observed(0, `${id}/compute`),
    wallClockMinutes: observed(0, `${id}/wall-clock`),
    laneOccupancyMinutes: observed(0, `${id}/lane`),
    mergeQueueDelayMinutes: observed(0, `${id}/merge-queue`),
    founderAttentionMinutes: observed(0, `${id}/founder`),
    humanReviewMinutes: observed(0, `${id}/review`),
    expectedRemediationMinutes: observed(0, `${id}/remediation-minutes`),
    timeToBenefitMinutes: observed(0, `${id}/benefit`),
    downstreamDelayMinutes: observed(0, `${id}/downstream-delay`),
    resourceDemands: [],
    sourceContracts: [`fixture://${id}/cost-contract`],
    missingSourceContracts: [],
    ...overrides,
  };
}

function routeCandidate(
  id: string,
  profile: FullyLoadedCostProfile
): RouteCandidate {
  return {
    id,
    tuple: {
      model: id,
      provider: id,
      endpoint: id,
      cli: id,
      harness: 'eve',
      configVersion: 'fixture-v1',
      tools: ['fixture'],
      reviewPlan: 'none',
    },
    estimatedTokenCost: 0,
    reviewCost: 0,
    failureRiskCost: 0,
    certifiedSuccessProbability: 1,
    expectedRetries: 0,
    capabilityMatch: ['mechanical'],
    maxRiskTier: 'low',
    fullyLoadedCostProfile: profile,
  };
}

function resourceDemand(
  resource: ResourceDemand['resource'],
  quantity: number,
  id: string
): ResourceDemand {
  return {
    resource,
    quantityUnit: resource.endsWith('minute') ? 'minute' : 'quota-unit',
    quantity: observed(quantity, `${id}/${resource}`),
  };
}

function scarcity(
  resource: ResourceDemand['resource'],
  overrides: Partial<ResourceScarcityEvidence> = {}
): ResourceScarcityEvidence {
  return {
    resource,
    quantityUnit: resource.endsWith('minute') ? 'minute' : 'quota-unit',
    valueUnit: 'usd',
    capacityUnits: 100,
    committedUnits: 100,
    compatibleDemandUnits: 0,
    displacedAlternatives: [
      {
        id: 'displaced-high-value-work',
        expectedValue: 5,
        requiredUnits: 100,
        valueUnit: 'usd',
        sourceRef: 'fixture://displaced-work',
        confidence: 0.85,
        eligible: true,
      },
    ],
    observedAt: '2026-09-28T11:59:00.000Z',
    validUntil: '2026-09-28T13:00:00.000Z',
    sourceRef: `fixture://${resource}/capacity`,
    confidence: 0.9,
    ...overrides,
  };
}

describe('Governor route-by-expected-cost', () => {
  it('returns a RouteReceipt with the selected tuple and alternatives', () => {
    const job = decisionJob('lightweight-deterministic', 'low', 'mechanical');
    const receipt = routeSummerSymphonyDecisionJob(job);

    expect(receipt.schema).toBe(GOVERNOR_ROUTE_SCHEMA);
    expect(receipt.jobId).toBe(job.id);
    expect(receipt.jobClass).toBe(job.jobClass);
    expect(receipt.riskTier).toBe(job.riskTier);
    expect(receipt.selectedRoute).toBeDefined();
    expect(receipt.alternatives.length).toBeGreaterThanOrEqual(0);
    expect(receipt.expectedFullyLoadedCost).toBeGreaterThan(0);
    expect(receipt.confidence).toBe(
      receipt.fullyLoadedCost.uncertainty.confidence
    );
    expect(receipt.confidence).toBeLessThanOrEqual(
      receipt.selectedRoute.certifiedSuccessProbability
    );
    expect(receipt.provenance.routerVersion).toBe(GOVERNOR_ROUTER_VERSION);
    expect(receipt.provenance.selectedAt).toMatch(/^\d{4}-/);
    expect(receipt.certificationPredicate).toBe(job.certificationPredicate);
    expect(receipt.escalationPath).toBe(`symphony-escalate:${job.id}`);
    expect(receipt.fullyLoadedCost.valuationUnit).toBe('normalized-value');
    expect(receipt.fullyLoadedCost.directCurrencyCost.value).toBeNull();
    expect(receipt.fullyLoadedCost.expectedTotal.amount).toBeNull();
  });

  it('routes lightweight deterministic work to the cheapest capable route', () => {
    const job = decisionJob('lightweight-deterministic', 'low', 'mechanical');
    const receipt = routeSummerSymphonyDecisionJob(job);

    expect(receipt.selectedRoute.id).toBe('local-qwen');
    expect(receipt.selectedRoute.tuple.provider).toBe('ollama');
  });

  it('routes low-risk support to the cheapest capable route', () => {
    const job = decisionJob('low-risk-support', 'low', 'support');
    const receipt = routeSummerSymphonyDecisionJob(job);

    expect(receipt.selectedRoute.id).toBe('local-qwen');
  });

  it('picks a higher-priced first-pass route when the token-cheapest route has high retry/human correction cost', () => {
    const job = decisionJob(
      'ambiguous-product-reasoning',
      'medium',
      'reasoning',
      'product'
    );
    const receipt = routeSummerSymphonyDecisionJob(job);

    expect(receipt.selectedRoute.id).toBe('summer-symphony-think');
    const cheap = receipt.alternatives.find(a => a.id === 'cheap-api-reasoner');
    expect(cheap).toBeDefined();
    expect(cheap!.estimatedTokenCost).toBeLessThan(
      receipt.selectedRoute.estimatedTokenCost
    );
    expect(receipt.selectedRoute.estimatedTokenCost).toBeGreaterThan(
      cheap!.estimatedTokenCost
    );
  });

  it('excludes anecdotal multipliers and derives efficiency only from representative outcomes', () => {
    const anecdotal = {
      ...routeCandidate('anecdotal-14x', costProfile('anecdotal-14x', 14)),
      unverifiedEfficiencyClaims: ['14x efficiency'],
    };
    const measured = routeCandidate(
      'measured-cheap',
      costProfile('measured', 1)
    );
    const receipt = routeByExpectedCost(
      decisionJob('lightweight-deterministic', 'low', 'mechanical'),
      [anecdotal, measured]
    );

    expect(receipt.selectedRoute.id).toBe('measured-cheap');
    expect(receipt.alternativeCosts[0].excludedUnverifiedClaims).toEqual([
      '14x efficiency',
    ]);
    const incumbent = measuredCohort('incumbent', 10);
    const challenger = measuredCohort('challenger', 4);
    expect(deriveMeasuredEfficiencyMultiplier(incumbent, challenger)).toBe(2.5);
    expect(
      deriveMeasuredEfficiencyMultiplier(incumbent, {
        ...challenger,
        representative: false,
      })
    ).toBeNull();
  });

  it('routes high-risk spend allocation to the high-capability Symphony route', () => {
    const job = decisionJob(
      'high-risk-spend-allocation',
      'high',
      'reasoning',
      'financial'
    );
    const receipt = routeSummerSymphonyDecisionJob(job);

    expect(receipt.selectedRoute.id).toBe('summer-symphony-think');
    expect(receipt.selectedRoute.tuple.model).toBe('symphony');
    expect(receipt.selectedRoute.tuple.provider).toBe('gem');
  });

  it('routes high-risk customer/legal escalation to the critical-capability Symphony route', () => {
    const job = decisionJob(
      'high-risk-customer-legal',
      'critical',
      'reasoning',
      'legal'
    );
    const receipt = routeSummerSymphonyDecisionJob(job);

    expect(receipt.selectedRoute.id).toBe('summer-symphony-think');
    expect(receipt.selectedRoute.maxRiskTier).toBe('critical');
    expect(receipt.alternatives).toHaveLength(0);
  });

  it('fails closed when no candidate meets the capability or risk contract', () => {
    const job = decisionJob(
      'high-risk-customer-legal',
      'critical',
      'classified-intel'
    );
    expect(() => routeSummerSymphonyDecisionJob(job)).toThrow(
      NoCertifiedRouteError
    );
  });

  it('orders alternatives by ascending expected fully loaded cost', () => {
    const job = decisionJob(
      'ambiguous-product-reasoning',
      'medium',
      'reasoning',
      'product'
    );
    const receipt = routeSummerSymphonyDecisionJob(job);

    const alternatives = receipt.alternatives;
    for (let i = 1; i < alternatives.length; i += 1) {
      const prev = alternatives[i - 1];
      const curr = alternatives[i];
      const prevExpected =
        ((prev.estimatedTokenCost + prev.reviewCost + prev.failureRiskCost) *
          (1 + prev.expectedRetries)) /
        prev.certifiedSuccessProbability;
      const currExpected =
        ((curr.estimatedTokenCost + curr.reviewCost + curr.failureRiskCost) *
          (1 + curr.expectedRetries)) /
        curr.certifiedSuccessProbability;
      expect(prevExpected).toBeLessThanOrEqual(currExpected);
    }
  });

  it('exposes the Summer → Symphony think path as a route tuple', () => {
    const job = decisionJob(
      'ambiguous-product-reasoning',
      'medium',
      'reasoning',
      'product'
    );
    const receipt = routeSummerSymphonyDecisionJob(job);

    const symphony = SUMMER_SYMPHONY_ROUTES.find(
      r => r.id === 'summer-symphony-think'
    )!;
    expect(receipt.selectedRoute.id).toBe(symphony.id);
    expect(receipt.selectedRoute.tuple.cli).toBe('symphony');
    expect(receipt.selectedRoute.tuple.tools).toContain('gbrain');
    expect(receipt.selectedRoute.tuple.tools).toContain('linear');
    expect(receipt.selectedRoute.tuple.tools).toContain('github');
  });

  it('can route a job directly against a supplied candidate list', () => {
    const job = decisionJob('lightweight-deterministic', 'low', 'mechanical');
    const receipt = routeByExpectedCost(job, SUMMER_SYMPHONY_ROUTES);
    expect(receipt.schema).toBe(GOVERNOR_ROUTE_SCHEMA);
    expect(receipt.selectedRoute.id).toBe('local-qwen');
  });

  it('ranks a $3/8m route ahead of a $0.20/90m route when scarce lane time displaces work', () => {
    const cheapLane = resourceDemand('symphony-lane-minute', 90, 'cheap');
    const fastLane = resourceDemand('symphony-lane-minute', 8, 'fast');
    const cheap = routeCandidate(
      'cheap-slow',
      costProfile('cheap-slow', 0.2, {
        wallClockMinutes: observed(90, 'cheap/wall-clock'),
        laneOccupancyMinutes: observed(90, 'cheap/lane'),
        resourceDemands: [cheapLane],
      })
    );
    const fast = routeCandidate(
      'expensive-fast',
      costProfile('expensive-fast', 3, {
        wallClockMinutes: observed(8, 'fast/wall-clock'),
        laneOccupancyMinutes: observed(8, 'fast/lane'),
        resourceDemands: [fastLane],
      })
    );

    const receipt = routeByExpectedCost(
      decisionJob('lightweight-deterministic', 'low', 'mechanical'),
      [cheap, fast],
      'fixture-v1',
      {
        decisionAt: '2026-09-28T12:00:00.000Z',
        evidence: [scarcity('symphony-lane-minute')],
      }
    );

    expect(receipt.selectedRoute.id).toBe('expensive-fast');
    expect(receipt.expectedFullyLoadedCost).toBe(3.4);
    expect(receipt.alternativeCosts[0].expectedTotal.amount).toBe(4.7);
    expect(receipt.fullyLoadedCost.opportunityCost).toEqual({
      amount: 0.4,
      unit: 'usd',
      displacedAlternatives: ['displaced-high-value-work'],
    });
    expect(receipt.explanation).toContain('time/capacity=0.4 usd');
    expect(receipt.explanation).toContain(
      'displaced=displaced-high-value-work'
    );
  });

  it('assigns zero marginal shadow cost to useful prepaid quota that would expire idle', () => {
    const quotaDemand = resourceDemand('provider-quota-unit', 10, 'quota');
    const useQuota = routeCandidate(
      'use-expiring-quota',
      costProfile('use-expiring-quota', 0, {
        capacityEconomics: subscription('sol-seat', 0, 20),
        resourceDemands: [quotaDemand],
      })
    );
    const idle = routeCandidate(
      'leave-quota-idle',
      costProfile('leave-quota-idle', 0.3)
    );
    const receipt = routeByExpectedCost(
      decisionJob('lightweight-deterministic', 'low', 'mechanical'),
      [idle, useQuota],
      'fixture-v1',
      {
        decisionAt: '2026-09-28T12:00:00.000Z',
        evidence: [
          scarcity('provider-quota-unit', {
            committedUnits: 0,
            compatibleDemandUnits: 20,
            perishableExpiresAt: '2026-09-28T13:00:00.000Z',
          }),
        ],
      }
    );

    expect(receipt.selectedRoute.id).toBe('use-expiring-quota');
    expect(receipt.fullyLoadedCost.expectedTotal.amount).toBe(0);
    expect(receipt.fullyLoadedCost.fullyAllocatedAccountingCost.amount).toBe(
      20
    );
    expect(
      receipt.fullyLoadedCost.capacityEconomics?.fixedSubscriptionPrice.value
    ).toBe(200);
    expect(receipt.fullyLoadedCost.resourceCosts[0]).toMatchObject({
      status: 'perishable-surplus',
      amountPerUnit: 0,
      expectedCost: 0,
      timeToExpiryMinutes: 60,
    });
  });

  it('prices scarce subscription quota when higher-value work is queued', () => {
    const quota = routeCandidate(
      'scarce-subscription',
      costProfile('scarce-subscription', 0, {
        capacityEconomics: subscription('scarce-seat', 0, 20),
        resourceDemands: [resourceDemand('provider-quota-unit', 10, 'scarce')],
      })
    );
    const retail = routeCandidate('retail', costProfile('retail', 0.3));
    const receipt = routeByExpectedCost(
      decisionJob('lightweight-deterministic', 'low', 'mechanical'),
      [quota, retail],
      'fixture-v1',
      {
        decisionAt: '2026-09-28T12:00:00.000Z',
        evidence: [
          scarcity('provider-quota-unit', {
            capacityUnits: 10,
            committedUnits: 0,
            compatibleDemandUnits: 10,
          }),
        ],
      }
    );

    expect(receipt.selectedRoute.id).toBe('retail');
    expect(receipt.alternativeCosts[0].opportunityCost.amount).toBe(0.5);
  });

  it('demotes a founder-review-heavy route when autonomous certification costs less', () => {
    const founderDemand = resourceDemand(
      'founder-attention-minute',
      60,
      'founder-heavy'
    );
    const founderHeavy = routeCandidate(
      'founder-heavy',
      costProfile('founder-heavy', 0.2, {
        founderAttentionMinutes: observed(60, 'founder-heavy/founder'),
        humanReviewMinutes: observed(60, 'founder-heavy/review'),
        resourceDemands: [founderDemand],
      })
    );
    const autonomous = routeCandidate(
      'autonomous-certified',
      costProfile('autonomous-certified', 3)
    );
    const receipt = routeByExpectedCost(
      decisionJob('lightweight-deterministic', 'low', 'mechanical'),
      [founderHeavy, autonomous],
      'fixture-v1',
      {
        decisionAt: '2026-09-28T12:00:00.000Z',
        evidence: [
          scarcity('founder-attention-minute', {
            displacedAlternatives: [
              {
                id: 'founder-sales-call',
                expectedValue: 10,
                requiredUnits: 100,
                valueUnit: 'usd',
                sourceRef: 'fixture://founder-calendar',
                confidence: 0.8,
                eligible: true,
              },
            ],
          }),
        ],
      }
    );

    expect(receipt.selectedRoute.id).toBe('autonomous-certified');
    expect(receipt.alternativeCosts[0].expectedTotal.amount).toBe(6.2);
    expect(receipt.alternativeCosts[0].opportunityCost.amount).toBe(6);
  });

  it.each([
    'gem-host-compute-minute',
    'mac-host-compute-minute',
    'host-io-minute',
    'merge-queue-ci-critical-path-minute',
    'customer-outcome-delay-minute',
    'revenue-delay-minute',
    'experiment-learning-delay-minute',
  ] as const)(
    'derives the %s shadow price from measured displacement',
    resource => {
      const price = deriveShadowPrice(
        resourceDemand(resource, 2, resource),
        {
          decisionAt: '2026-09-28T12:00:00.000Z',
          evidence: [scarcity(resource)],
        },
        'usd'
      );

      expect(price).toMatchObject({
        status: 'displaces-eligible-work',
        amountPerUnit: 0.05,
        demandedUnits: 2,
        expectedCost: 0.1,
        displacedAlternative: { id: 'displaced-high-value-work' },
      });
    }
  );

  it('keeps unknown material prices unknown instead of inventing monetary precision', () => {
    const unknownFounderDemand: ResourceDemand = {
      resource: 'founder-attention-minute',
      quantityUnit: 'minute',
      quantity: {
        value: null,
        sourceRef: null,
        confidence: 0,
        material: true,
      },
    };
    const candidate = routeCandidate(
      'unknown-founder-time',
      costProfile('unknown-founder-time', 1, {
        founderAttentionMinutes: unknownFounderDemand.quantity,
        resourceDemands: [unknownFounderDemand],
      })
    );
    const receipt = routeByExpectedCost(
      decisionJob('lightweight-deterministic', 'low', 'mechanical'),
      [candidate]
    );

    expect(receipt.fullyLoadedCost.expectedTotal.amount).toBeNull();
    expect(receipt.fullyLoadedCost.uncertainty.interval).toEqual({
      lower: 1,
      upper: null,
    });
    expect(
      receipt.fullyLoadedCost.uncertainty.missingSourceContracts
    ).toContain('measurement:founder-attention-minute');
    expect(receipt.explanation).toContain('unknown upper bound');
  });

  it('calibrates lane, completion, human, retry, and downstream-delay predictions by workload class', () => {
    const candidate = routeCandidate(
      'calibrated-route',
      costProfile('calibrated-route', 1, {
        laneOccupancyMinutes: observed(8, 'calibration/lane'),
        wallClockMinutes: observed(10, 'calibration/wall'),
        founderAttentionMinutes: observed(2, 'calibration/founder'),
        humanReviewMinutes: observed(3, 'calibration/review'),
        downstreamDelayMinutes: observed(4, 'calibration/downstream'),
      })
    );
    const receipt = routeByExpectedCost(
      decisionJob('lightweight-deterministic', 'low', 'mechanical'),
      [candidate]
    );
    const calibration = calibrateRouteCost(receipt, {
      routeId: 'calibrated-route',
      workloadClass: 'fixture-workload',
      riskTier: 'low',
      observedAt: '2026-09-28T13:00:00.000Z',
      sourceRef: 'execution-attempt://fixture-1',
      laneOccupancyMinutes: 9,
      completionMinutes: 12,
      humanInterventionMinutes: 6,
      retries: 1,
      downstreamDelayMinutes: 7,
      modelTurns: 2,
      amortizedSubscriptionCost: 3,
      effectiveFullyLoadedCost: 2,
    });

    expect(calibration.workloadClass).toBe('fixture-workload');
    expect(calibration.riskTier).toBe('low');
    expect(calibration.actual.modelTurns).toBe(2);
    expect(calibration.costReconciliation).toMatchObject({
      actualEffectiveCost: 2,
      actualFullyAllocatedCost: 5,
    });
    expect(calibration.dimensions).toEqual({
      laneOccupancyMinutes: { predicted: 8, actual: 9, absoluteError: 1 },
      completionMinutes: { predicted: 10, actual: 12, absoluteError: 2 },
      humanInterventionMinutes: {
        predicted: 5,
        actual: 6,
        absoluteError: 1,
      },
      retries: { predicted: 0, actual: 1, absoluteError: 1 },
      downstreamDelayMinutes: {
        predicted: 4,
        actual: 7,
        absoluteError: 3,
      },
    });
  });
});
