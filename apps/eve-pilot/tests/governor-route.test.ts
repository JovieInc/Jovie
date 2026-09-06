import { describe, expect, it } from 'vitest';
import {
  type DecisionJob,
  GOVERNOR_ROUTE_SCHEMA,
  GOVERNOR_ROUTER_VERSION,
  NoCertifiedRouteError,
  routeByExpectedCost,
  routeSummerSymphonyDecisionJob,
  SUMMER_SYMPHONY_ROUTES,
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
      receipt.selectedRoute.certifiedSuccessProbability
    );
    expect(receipt.provenance.routerVersion).toBe(GOVERNOR_ROUTER_VERSION);
    expect(receipt.provenance.selectedAt).toMatch(/^\d{4}-/);
    expect(receipt.certificationPredicate).toBe(job.certificationPredicate);
    expect(receipt.escalationPath).toBe(`symphony-escalate:${job.id}`);
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
});
