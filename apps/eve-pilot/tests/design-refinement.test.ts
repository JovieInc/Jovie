import { describe, expect, it } from 'vitest';
import {
  type CritiqueFinding,
  DESIGN_CRITIQUE_SCHEMA,
  type DesignNode,
  type DesignScopeLevel,
  findingPriority,
  type PassOutcome,
  QUALITY_DIMENSIONS,
  type QualityVector,
  type RefinementCandidate,
  type RefinementEnvironment,
  runDesignRefinementLoop,
  workloadClassFor,
} from '../agent/lib/design-refinement';
import type {
  ResourceScarcityEvidence,
  RouteCandidate,
} from '../agent/lib/governor-route';

function quality(fill: number, weak?: Partial<QualityVector>): QualityVector {
  const vector = {} as Record<string, number>;
  for (const dimension of QUALITY_DIMENSIONS) vector[dimension] = fill;
  return { ...vector, ...weak } as QualityVector;
}

function finding(
  nodeId: string,
  level: DesignScopeLevel,
  overrides: Partial<CritiqueFinding> = {}
): CritiqueFinding {
  return {
    schema: DESIGN_CRITIQUE_SCHEMA,
    nodeId,
    level,
    findingClass: `${nodeId}.polish`,
    dimension: 'premiumFeel',
    evidenceRef: `screenshot://${nodeId}`,
    invariantRef: null,
    confidence: 0.9,
    expectedImpact: 0.5,
    blastRadius: 0.1,
    recommendedScope: level,
    descend: false,
    reversible: true,
    determinism: 'semantic',
    ...overrides,
  };
}

function node(
  id: string,
  level: DesignScopeLevel,
  childIds: string[] = [],
  fanout = 1,
  parentId: string | null = null
): DesignNode {
  return { id, level, parentId, childIds, fanout };
}

function designRoute(
  id: string,
  fields: {
    tokenCost: number;
    reviewCost: number;
    failureCost: number;
    pSuccess: number;
    retries: number;
  }
): RouteCandidate {
  return {
    id,
    tuple: {
      model: id,
      provider: 'fixture',
      endpoint: 'fixture',
      cli: 'fixture-cli',
      harness: 'eve',
      configVersion: 'v1',
      tools: ['design-skills'],
      reviewPlan: 'postflight',
    },
    estimatedTokenCost: fields.tokenCost,
    reviewCost: fields.reviewCost,
    failureRiskCost: fields.failureCost,
    certifiedSuccessProbability: fields.pSuccess,
    expectedRetries: fields.retries,
    capabilityMatch: [
      'design-refinement',
      'scope:page',
      'scope:organism',
      'scope:molecule',
      'scope:atom',
    ],
    maxRiskTier: 'critical',
  };
}

const CHEAP_FLAKY = designRoute('cheap-flaky', {
  tokenCost: 1,
  reviewCost: 0,
  failureCost: 10,
  pSuccess: 0.3,
  retries: 3,
});
const STRONG_FIRST_PASS = designRoute('strong-first-pass', {
  tokenCost: 20,
  reviewCost: 5,
  failureCost: 5,
  pSuccess: 0.95,
  retries: 0,
});
const CHEAP_CERTIFIED = designRoute('cheap-certified', {
  tokenCost: 1,
  reviewCost: 1,
  failureCost: 1,
  pSuccess: 0.95,
  retries: 0,
});

const BRIEF = {
  text: 'Polish this. Make it feel more premium. Prefer subtraction.',
  invariantsRef: 'invariants://founder',
  referenceCorpusRef: 'corpus://taste',
};

const OUTCOME: PassOutcome = {
  elapsedMinutes: 2,
  laneOccupancyMinutes: 2,
  humanInterventionMinutes: 0,
  retries: 0,
  downstreamDelayMinutes: 0,
  sourceRef: 'fixture://pass-actuals',
  observedAt: '2026-09-29T00:00:00Z',
};

type Harness = RefinementEnvironment & {
  qualities: Map<string, QualityVector>;
  findingScripts: Map<string, CritiqueFinding[]>;
  applied: string[];
  evaluations: string[];
};

function harness(
  tree: DesignNode[],
  routes: RouteCandidate[],
  opts: {
    qualities?: Record<string, QualityVector>;
    findings?: Record<string, CritiqueFinding[]>;
    candidates?: (node: DesignNode) => readonly RefinementCandidate[];
    candidateQuality?: number;
    onApply?: (node: DesignNode, candidate: RefinementCandidate) => void;
    shadowPricing?: RefinementEnvironment['shadowPricing'];
  } = {}
): Harness {
  const qualities = new Map<string, QualityVector>(
    tree.map(n => [n.id, opts.qualities?.[n.id] ?? quality(0.6)])
  );
  const findingScripts = new Map<string, CritiqueFinding[]>(
    Object.entries(opts.findings ?? {})
  );
  const applied: string[] = [];
  const evaluations: string[] = [];
  return {
    qualities,
    findingScripts,
    applied,
    evaluations,
    routes,
    shadowPricing: opts.shadowPricing,
    now: () => '2026-09-29T00:00:00Z',
    evaluateScope(n) {
      evaluations.push(n.id);
      return {
        nodeId: n.id,
        quality: qualities.get(n.id)!,
        findings: findingScripts.get(n.id) ?? [],
        artifactRef: `artifact://${n.id}`,
      };
    },
    generateCandidates(n) {
      return (
        opts.candidates?.(n) ?? [
          { id: `${n.id}-c1`, description: 'polish', artifactRef: 'a://c1' },
        ]
      );
    },
    evaluateCandidate(n, candidate) {
      return {
        nodeId: n.id,
        quality: quality(opts.candidateQuality ?? 0.9),
        findings: [],
        artifactRef: candidate.artifactRef,
      };
    },
    applyCandidate(n, candidate) {
      applied.push(`${n.id}:${candidate.id}`);
      qualities.set(n.id, quality(0.9));
      findingScripts.set(n.id, []);
      opts.onApply?.(n, candidate);
    },
    observePassOutcome: () => OUTCOME,
  };
}

describe('runDesignRefinementLoop', () => {
  it('descends page -> child scope, refines, and re-evaluates the parent', async () => {
    const tree = [
      node('page:library', 'page', ['sidebar']),
      node('sidebar', 'organism', ['nav-group'], 1, 'page:library'),
      node('nav-group', 'molecule', [], 1, 'sidebar'),
    ];
    const env = harness(tree, [CHEAP_CERTIFIED], {
      findings: {
        'page:library': [finding('sidebar', 'organism', { descend: true })],
        sidebar: [
          finding('nav-group', 'molecule', {
            descend: true,
            recommendedScope: 'molecule',
          }),
        ],
        'nav-group': [finding('nav-group', 'molecule')],
      },
    });
    const run = await runDesignRefinementLoop(tree, 'page:library', BRIEF, env);
    expect(run.passes.length).toBeGreaterThan(0);
    expect(run.passes[0].nodeId).toBe('nav-group');
    expect(run.passes[0].level).toBe('molecule');
    expect(run.passes[0].workloadClass).toBe(workloadClassFor('molecule'));
    // Parent (sidebar) re-rendered after the accepted child change.
    const sidebarEvals = env.evaluations.filter(id => id === 'sidebar');
    expect(sidebarEvals.length).toBeGreaterThanOrEqual(2);
  });

  it('selects the strong route when cheap retries make total cost worse', async () => {
    const tree = [node('page', 'page')];
    const env = harness(tree, [CHEAP_FLAKY, STRONG_FIRST_PASS], {
      findings: { page: [finding('page', 'page')] },
    });
    const run = await runDesignRefinementLoop(tree, 'page', BRIEF, env);
    expect(run.passes[0].routeReceipt.selectedRoute.id).toBe(
      'strong-first-pass'
    );
  });

  it('does not auto-use the strong route when a cheap certified route wins on economics', async () => {
    const tree = [node('page', 'page')];
    const env = harness(tree, [CHEAP_CERTIFIED, STRONG_FIRST_PASS], {
      findings: { page: [finding('page', 'page')] },
    });
    const run = await runDesignRefinementLoop(tree, 'page', BRIEF, env);
    expect(run.passes[0].routeReceipt.selectedRoute.id).toBe('cheap-certified');
  });

  it('treats prepaid capacity as zero marginal cost, not zero total cost', async () => {
    const evidence: ResourceScarcityEvidence = {
      resource: 'provider-quota-unit',
      quantityUnit: 'units',
      valueUnit: 'normalized-value',
      capacityUnits: 100,
      committedUnits: 10,
      compatibleDemandUnits: 80,
      displacedAlternatives: [],
      observedAt: '2026-09-28T00:00:00Z',
      validUntil: '2026-09-30T00:00:00Z',
      sourceRef: 'fixture://prepaid-quota',
      confidence: 0.9,
      perishableExpiresAt: '2026-09-30T00:00:00Z',
    };
    const prepaid = designRoute('prepaid-cheap', {
      tokenCost: 5,
      reviewCost: 1,
      failureCost: 1,
      pSuccess: 0.9,
      retries: 0,
    });
    const profile = {
      valuationUnit: 'normalized-value' as const,
      workloadClass: workloadClassFor('page'),
      directCurrencyCost: {
        value: 0,
        sourceRef: 'fixture://prepaid',
        confidence: 0.9,
        material: true,
      },
      modelApiToolCost: {
        value: 5,
        sourceRef: 'fixture://model',
        confidence: 0.9,
        material: true,
      },
      expectedRemediationCost: {
        value: 2,
        sourceRef: 'fixture://remediation',
        confidence: 0.9,
        material: true,
      },
      computeRuntimeMinutes: {
        value: 0,
        sourceRef: null,
        confidence: 0,
        material: false,
      },
      wallClockMinutes: {
        value: 0,
        sourceRef: null,
        confidence: 0,
        material: false,
      },
      laneOccupancyMinutes: {
        value: 0,
        sourceRef: null,
        confidence: 0,
        material: false,
      },
      mergeQueueDelayMinutes: {
        value: 0,
        sourceRef: null,
        confidence: 0,
        material: false,
      },
      founderAttentionMinutes: {
        value: 0,
        sourceRef: null,
        confidence: 0,
        material: false,
      },
      humanReviewMinutes: {
        value: 0,
        sourceRef: null,
        confidence: 0,
        material: false,
      },
      expectedRemediationMinutes: {
        value: 0,
        sourceRef: null,
        confidence: 0,
        material: false,
      },
      timeToBenefitMinutes: {
        value: 0,
        sourceRef: null,
        confidence: 0,
        material: false,
      },
      downstreamDelayMinutes: {
        value: 0,
        sourceRef: null,
        confidence: 0,
        material: false,
      },
      resourceDemands: [
        {
          resource: 'provider-quota-unit' as const,
          quantity: {
            value: 10,
            sourceRef: 'fixture://quota-demand',
            confidence: 0.9,
            material: true,
          },
          quantityUnit: 'units',
        },
      ],
      sourceContracts: ['fixture://prepaid-contract'],
      missingSourceContracts: [],
    };
    const withProfile: RouteCandidate = {
      ...prepaid,
      fullyLoadedCostProfile: profile,
    };
    const tree = [node('page', 'page')];
    const env = harness(tree, [withProfile], {
      findings: { page: [finding('page', 'page')] },
      shadowPricing: {
        decisionAt: '2026-09-29T00:00:00Z',
        evidence: [evidence],
      },
    });
    const run = await runDesignRefinementLoop(tree, 'page', BRIEF, env);
    const cost = run.passes[0].routeReceipt.fullyLoadedCost;
    const quota = cost.resourceCosts.find(
      r => r.resource === 'provider-quota-unit'
    )!;
    expect(quota.status).toBe('perishable-surplus');
    expect(quota.expectedCost).toBe(0);
    // Demand is still recorded — prepaid capacity is not "free" work.
    expect(quota.demandedUnits).toBe(10);
    expect(cost.knownLowerBound).toBeGreaterThan(0);
  });

  it('escalates routes only after measured sub-threshold passes', async () => {
    const tree = [node('page', 'page')];
    let calls = 0;
    const env = harness(tree, [CHEAP_CERTIFIED, STRONG_FIRST_PASS], {
      findings: { page: [finding('page', 'page')] },
      // Candidates never materially improve -> plateau -> escalation.
      candidateQuality: 0.6,
      candidates: () => {
        calls += 1;
        return [{ id: `c${calls}`, description: 'x', artifactRef: 'a://x' }];
      },
    });
    const run = await runDesignRefinementLoop(tree, 'page', BRIEF, env, {
      materialImprovementThreshold: 0.03,
      parentRegressionTolerance: 0.01,
      findingScoreThreshold: 0.15,
      plateauThreshold: 0.01,
      plateauWindow: 2,
      maxPasses: 10,
      disagreementEscalationThreshold: 0.3,
    });
    expect(run.passes[0].routeReceipt.selectedRoute.id).toBe('cheap-certified');
    const escalated = run.passes.filter(p => p.escalated);
    expect(escalated.length).toBeGreaterThan(0);
    const afterEscalation = run.passes.find(
      p => p.routeReceipt.selectedRoute.id === 'strong-first-pass'
    );
    expect(afterEscalation).toBeDefined();
    expect(run.stopReason).toBe('plateau');
  });

  it('rejects a child improvement that materially regresses the parent', async () => {
    const tree = [
      node('page', 'page', ['sidebar']),
      node('sidebar', 'organism', [], 1, 'page'),
    ];
    const env = harness(tree, [CHEAP_CERTIFIED], {
      findings: {
        page: [finding('sidebar', 'organism', { descend: true })],
        sidebar: [finding('sidebar', 'organism')],
      },
      onApply: n => {
        if (n.id === 'sidebar') {
          // Local win, global loss.
          env.qualities.set('page', quality(0.2));
        }
      },
    });
    const run = await runDesignRefinementLoop(tree, 'page', BRIEF, env);
    const regressed = run.passes.find(p => p.parentRegressed);
    expect(regressed).toBeDefined();
    expect(regressed!.qualityDelta).toBeGreaterThan(0);
  });

  it('records route calibration actuals for the design workload class', async () => {
    const tree = [node('page', 'page')];
    const env = harness(tree, [CHEAP_CERTIFIED], {
      findings: { page: [finding('page', 'page')] },
    });
    const run = await runDesignRefinementLoop(tree, 'page', BRIEF, env);
    const calibration = run.passes[0].calibration!;
    expect(calibration.routeId).toBe('cheap-certified');
    expect(calibration.dimensions.retries.actual).toBe(0);
    expect(calibration.dimensions.completionMinutes.actual).toBe(2);
  });

  it('converges with a promotion-ready receipt when no material findings remain', async () => {
    const tree = [node('page', 'page')];
    const env = harness(tree, [CHEAP_CERTIFIED], { findings: {} });
    const run = await runDesignRefinementLoop(tree, 'page', BRIEF, env);
    expect(run.stopReason).toBe('converged');
    expect(run.promotionCourtReady).toBe(true);
    expect(run.passes).toHaveLength(0);
  });

  it('prioritizes high-fanout shared scopes over page-local issues', () => {
    const shared = finding('shared-atom', 'atom', { descend: false });
    const local = finding('page-local', 'page', { descend: false });
    expect(findingPriority(shared, 30)).toBeGreaterThan(
      findingPriority(local, 1)
    );
  });

  it('keeps the current version and converges a node when no candidate improves', async () => {
    const tree = [node('page', 'page')];
    const env = harness(tree, [CHEAP_CERTIFIED], {
      findings: { page: [finding('page', 'page')] },
      candidateQuality: 0.5,
    });
    const run = await runDesignRefinementLoop(tree, 'page', BRIEF, env, {
      ...{
        materialImprovementThreshold: 0.03,
        parentRegressionTolerance: 0.01,
        findingScoreThreshold: 0.15,
        plateauThreshold: 0.01,
        plateauWindow: 1,
        maxPasses: 10,
        disagreementEscalationThreshold: 0.3,
      },
    });
    expect(env.applied).toHaveLength(0);
    expect(run.stopReason).toBe('plateau');
    expect(run.passes.every(p => p.acceptedCandidateId === null)).toBe(true);
  });
});

describe('evaluation independence', () => {
  it('evaluates candidates through the independent evaluator, not the builder', async () => {
    const tree = [node('page', 'page')];
    let builderClaims = 0;
    const env = harness(tree, [CHEAP_CERTIFIED], {
      findings: { page: [finding('page', 'page')] },
      candidates: () => {
        builderClaims += 1;
        return [{ id: 'c1', description: 'x', artifactRef: 'a://1' }];
      },
    });
    const evalCalls: string[] = [];
    const inner = env.evaluateCandidate.bind(env);
    env.evaluateCandidate = (n, c) => {
      evalCalls.push(c.id);
      return inner(n, c);
    };
    await runDesignRefinementLoop(tree, 'page', BRIEF, env);
    expect(builderClaims).toBe(1);
    expect(evalCalls).toEqual(['c1']);
  });
});
