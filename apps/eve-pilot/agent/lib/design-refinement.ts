import {
  calibrateRouteCost,
  type ExecutionJob,
  type GovernorJob,
  NoCertifiedRouteError,
  type RouteActualOutcome,
  type RouteCalibrationReceipt,
  type RouteCandidate,
  type RouteReceipt,
  routeByExpectedCost,
  type ShadowPricingContext,
} from './governor-route';

export const DESIGN_REFINEMENT_SCHEMA =
  'jovie.eve.design-refinement-run/v1' as const;
export const DESIGN_CRITIQUE_SCHEMA =
  'jovie.eve.design-critique-finding/v1' as const;
export const DESIGN_PASS_SCHEMA =
  'jovie.eve.design-refinement-pass/v1' as const;

export const REFINEMENT_ROUTER_VERSION = '2026-09-29' as const;

export type DesignScopeLevel = 'page' | 'organism' | 'molecule' | 'atom';

const LEVEL_ORDER: Record<DesignScopeLevel, number> = {
  page: 0,
  organism: 1,
  molecule: 2,
  atom: 3,
};

export type DesignNode = {
  readonly id: string;
  readonly level: DesignScopeLevel;
  readonly parentId: string | null;
  readonly childIds: readonly string[];
  /** Surfaces sharing this scope; shared primitives have high fanout. */
  readonly fanout: number;
};

export type QualityDimension =
  | 'hierarchy'
  | 'spacingRhythm'
  | 'visualCoherence'
  | 'componentCorrectness'
  | 'typography'
  | 'colorDiscipline'
  | 'mediaTreatment'
  | 'densityNoise'
  | 'premiumFeel'
  | 'stateConsistency'
  | 'responsiveness'
  | 'invariantCompliance'
  | 'referenceAlignment';

export const QUALITY_DIMENSIONS: readonly QualityDimension[] = [
  'hierarchy',
  'spacingRhythm',
  'visualCoherence',
  'componentCorrectness',
  'typography',
  'colorDiscipline',
  'mediaTreatment',
  'densityNoise',
  'premiumFeel',
  'stateConsistency',
  'responsiveness',
  'invariantCompliance',
  'referenceAlignment',
];

/** All dimensions scored 0..1 by the independent evaluator. */
export type QualityVector = Readonly<Record<QualityDimension, number>>;

export type FindingDeterminism =
  | 'deterministic'
  | 'objective-visual'
  | 'semantic'
  | 'taste-adjacent';

/**
 * Multi-scale critique contract: one structured finding bound to a scope,
 * emitted by an evaluator that never sees the builder's claims.
 */
export type CritiqueFinding = {
  readonly schema: typeof DESIGN_CRITIQUE_SCHEMA;
  readonly nodeId: string;
  readonly level: DesignScopeLevel;
  readonly findingClass: string;
  readonly dimension: QualityDimension;
  readonly evidenceRef: string;
  readonly invariantRef: string | null;
  readonly confidence: number;
  readonly expectedImpact: number;
  readonly blastRadius: number;
  readonly recommendedScope: DesignScopeLevel;
  /** True when the defect localizes to a child scope. */
  readonly descend: boolean;
  readonly reversible: boolean;
  readonly determinism: FindingDeterminism;
};

export type NodeEvaluation = {
  readonly nodeId: string;
  readonly quality: QualityVector;
  readonly findings: readonly CritiqueFinding[];
  readonly artifactRef: string | null;
};

export type RefinementCandidate = {
  readonly id: string;
  readonly description: string;
  readonly artifactRef: string;
};

export type RefinementBrief = {
  readonly text: string;
  readonly invariantsRef: string | null;
  readonly referenceCorpusRef: string | null;
};

/** Observed outcome of one executed pass; feeds route calibration. */
export type PassOutcome = {
  readonly elapsedMinutes: number;
  readonly laneOccupancyMinutes: number;
  readonly humanInterventionMinutes: number;
  readonly retries: number;
  readonly downstreamDelayMinutes: number;
  readonly sourceRef: string;
  readonly observedAt: string;
};

export type RefinementEnvironment = {
  /** Independent evaluator render+critique of a scope as it currently exists. */
  evaluateScope(node: DesignNode): Promise<NodeEvaluation> | NodeEvaluation;
  /**
   * Builder/art-director role: generate bounded candidates for the selected
   * node under the chosen execution route. Never the final evaluator.
   */
  generateCandidates(
    node: DesignNode,
    brief: RefinementBrief,
    route: RouteReceipt
  ): Promise<readonly RefinementCandidate[]> | readonly RefinementCandidate[];
  /** Independent evaluator scores a candidate artifact for the node. */
  evaluateCandidate(
    node: DesignNode,
    candidate: RefinementCandidate
  ): Promise<NodeEvaluation> | NodeEvaluation;
  /** Apply an accepted candidate; the parent is re-evaluated afterwards. */
  applyCandidate(node: DesignNode, candidate: RefinementCandidate): void;
  /**
   * Observe the actual cost/outcome of an executed pass. Returned actuals are
   * fed to the canonical route calibration (JOV-6467) so routing for the
   * design-refinement workload class improves over time.
   */
  observePassOutcome(
    node: DesignNode,
    route: RouteReceipt,
    accepted: RefinementCandidate | null
  ): Promise<PassOutcome | null> | PassOutcome | null;
  /** Route registry available to refinement passes. */
  routes: readonly RouteCandidate[];
  /** Optional measured-capacity snapshot forwarded to the canonical router. */
  shadowPricing?: ShadowPricingContext;
  routesVersion?: string;
  now?: () => string;
};

export type RefinementPolicy = {
  /** Independent-eval delta below which a candidate is not material. */
  readonly materialImprovementThreshold: number;
  /** Maximum parent quality loss accepted when a child improves. */
  readonly parentRegressionTolerance: number;
  /** Finding score below which a scope is considered converged. */
  readonly findingScoreThreshold: number;
  /** Passes with delta below this count toward the plateau window. */
  readonly plateauThreshold: number;
  /** Consecutive sub-threshold passes that mark a node converged. */
  readonly plateauWindow: number;
  /** Hard bound on total executed passes across the whole run. */
  readonly maxPasses: number;
  /** Evaluator disagreement above this forces route escalation. */
  readonly disagreementEscalationThreshold: number;
};

export const DEFAULT_REFINEMENT_POLICY: RefinementPolicy = {
  materialImprovementThreshold: 0.03,
  parentRegressionTolerance: 0.01,
  findingScoreThreshold: 0.15,
  plateauThreshold: 0.01,
  plateauWindow: 2,
  maxPasses: 40,
  disagreementEscalationThreshold: 0.3,
};

export type EscalationReason =
  | 'diminishing-returns'
  | 'persistent-critique-class'
  | 'evaluator-disagreement'
  | 'high-uncertainty';

export type RefinementPassReceipt = {
  readonly schema: typeof DESIGN_PASS_SCHEMA;
  readonly passIndex: number;
  readonly nodeId: string;
  readonly level: DesignScopeLevel;
  readonly workloadClass: string;
  readonly routeReceipt: RouteReceipt;
  readonly escalated: boolean;
  readonly escalationReasons: readonly EscalationReason[];
  readonly acceptedCandidateId: string | null;
  readonly qualityDelta: number;
  readonly parentQualityDelta: number;
  readonly parentRegressed: boolean;
  readonly calibration: RouteCalibrationReceipt | null;
};

export type RefinementStopReason =
  | 'converged'
  | 'plateau'
  | 'pass-budget-exhausted'
  | 'no-certified-route'
  | 'blocked';

export type RefinementRunReceipt = {
  readonly schema: typeof DESIGN_REFINEMENT_SCHEMA;
  readonly rootId: string;
  readonly brief: string;
  readonly passes: readonly RefinementPassReceipt[];
  readonly stopReason: RefinementStopReason;
  readonly finalQuality: QualityVector | null;
  readonly promotionCourtReady: boolean;
  readonly routerVersion: string;
  readonly completedAt: string;
};

export function workloadClassFor(level: DesignScopeLevel): string {
  return `design-refinement:${level}`;
}

export function qualityScore(quality: QualityVector): number {
  const total = QUALITY_DIMENSIONS.reduce(
    (sum, dimension) => sum + quality[dimension],
    0
  );
  return total / QUALITY_DIMENSIONS.length;
}

function clamp01(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
}

/**
 * Work-selection score: severity x confidence x visual impact x reuse/fanout x
 * reversibility. Higher-fanout shared scopes outrank page-local cosmetics.
 */
export function findingPriority(
  finding: CritiqueFinding,
  fanout: number
): number {
  const reversibility = finding.reversible ? 1 : 0.5;
  const tasteDiscount = finding.determinism === 'taste-adjacent' ? 0.5 : 1;
  return (
    (finding.expectedImpact *
      clamp01(finding.confidence) *
      Math.max(1, fanout) *
      reversibility *
      tasteDiscount) /
    (1 + clamp01(finding.blastRadius))
  );
}

function nodeMap(tree: readonly DesignNode[]): Map<string, DesignNode> {
  const map = new Map<string, DesignNode>();
  for (const node of tree) map.set(node.id, node);
  return map;
}

function weakestFindingTarget(
  evaluations: ReadonlyMap<string, NodeEvaluation>,
  nodes: Map<string, DesignNode>,
  locallyConverged: ReadonlySet<string>
): { node: DesignNode; finding: CritiqueFinding; score: number } | null {
  let best: {
    node: DesignNode;
    finding: CritiqueFinding;
    score: number;
  } | null = null;
  for (const evaluation of evaluations.values()) {
    const node = nodes.get(evaluation.nodeId);
    if (!node) continue;
    for (const finding of evaluation.findings) {
      const target = nodes.get(finding.nodeId) ?? node;
      if (locallyConverged.has(target.id)) continue;
      const score = findingPriority(finding, target.fanout);
      if (best === null || score > best.score) {
        best = { node: target, finding, score };
      }
    }
  }
  return best;
}

function isDescendantOf(
  nodes: Map<string, DesignNode>,
  ancestorId: string,
  nodeId: string
): boolean {
  let cursor = nodes.get(nodeId);
  while (cursor) {
    if (cursor.id === ancestorId) return true;
    cursor = cursor.parentId ? nodes.get(cursor.parentId) : undefined;
  }
  return false;
}

function nextHopToward(
  nodes: Map<string, DesignNode>,
  from: DesignNode,
  targetId: string
): DesignNode | null {
  for (const childId of from.childIds) {
    const child = nodes.get(childId);
    if (child && isDescendantOf(nodes, child.id, targetId)) return child;
  }
  return null;
}

function refinementJob(
  node: DesignNode,
  passIndex: number,
  brief: RefinementBrief
): ExecutionJob {
  return {
    kind: 'execution',
    id: `design-refine:${node.id}:pass-${passIndex}`,
    jobClass: 'ambiguous-product-reasoning',
    riskTier: node.level === 'page' ? 'medium' : 'low',
    objective: brief.text,
    requiredCapabilities: ['design-refinement', `scope:${node.level}`],
    certificationPredicate: 'jovie.certification/v1:design-artifact',
    authority: 'automation',
    evidenceRefs: [brief.invariantsRef, brief.referenceCorpusRef].filter(
      (ref): ref is string => !!ref
    ),
    payload: { nodeId: node.id, level: node.level },
  };
}

function selectRoute(
  job: GovernorJob,
  env: RefinementEnvironment,
  excludedRouteIds: ReadonlySet<string>
): RouteReceipt {
  const candidates = env.routes.filter(
    route => !excludedRouteIds.has(route.id)
  );
  return routeByExpectedCost(
    job,
    candidates,
    env.routesVersion ?? 'refinement-routes-unversioned',
    env.shadowPricing
  );
}

function meanDelta(before: QualityVector, after: QualityVector): number {
  const total = QUALITY_DIMENSIONS.reduce(
    (sum, dimension) => sum + (after[dimension] - before[dimension]),
    0
  );
  return total / QUALITY_DIMENSIONS.length;
}

function worstRegression(before: QualityVector, after: QualityVector): number {
  return QUALITY_DIMENSIONS.reduce(
    (worst, dimension) => Math.min(worst, after[dimension] - before[dimension]),
    0
  );
}

function calibrationFor(
  route: RouteReceipt,
  outcome: PassOutcome
): RouteCalibrationReceipt {
  const actual: RouteActualOutcome = {
    routeId: route.selectedRoute.id,
    workloadClass: route.fullyLoadedCost.workloadClass,
    riskTier: route.riskTier,
    observedAt: outcome.observedAt,
    sourceRef: outcome.sourceRef,
    laneOccupancyMinutes: outcome.laneOccupancyMinutes,
    completionMinutes: outcome.elapsedMinutes,
    humanInterventionMinutes: outcome.humanInterventionMinutes,
    retries: outcome.retries,
    downstreamDelayMinutes: outcome.downstreamDelayMinutes,
  };
  return calibrateRouteCost(route, actual);
}

/**
 * Recursive coarse-to-fine design refinement. Descends page -> organism ->
 * molecule -> atom along the highest-leverage weakest finding, runs bounded
 * candidate passes routed by the canonical expected-fully-loaded-cost router,
 * then ascends and re-evaluates the parent after every accepted child change.
 */
export async function runDesignRefinementLoop(
  tree: readonly DesignNode[],
  rootId: string,
  brief: RefinementBrief,
  env: RefinementEnvironment,
  policy: RefinementPolicy = DEFAULT_REFINEMENT_POLICY
): Promise<RefinementRunReceipt> {
  const nodes = nodeMap(tree);
  const root = nodes.get(rootId);
  if (!root) {
    throw new Error(`design tree has no root node ${rootId}`);
  }
  const now = () => env.now?.() ?? new Date().toISOString();
  const passes: RefinementPassReceipt[] = [];
  const evaluations = new Map<string, NodeEvaluation>();
  const passesSinceMaterialGain = new Map<string, number>();
  const repeatedClasses = new Map<string, number>();
  const locallyConverged = new Set<string>();

  evaluations.set(root.id, await env.evaluateScope(root));

  while (passes.length < policy.maxPasses) {
    const target = weakestFindingTarget(evaluations, nodes, locallyConverged);
    if (!target) {
      // No actionable findings remain; if nodes were retired on plateau rather
      // than clean critique clearance, report the plateau explicitly.
      return finish(locallyConverged.size > 0 ? 'plateau' : 'converged');
    }
    if (target.score < policy.findingScoreThreshold) {
      return finish('converged');
    }

    // Descend to the smallest useful scope: follow the finding's nodeId when
    // it names a deeper descendant, otherwise step to a child at the
    // recommended level.
    let node = target.node;
    let finding = target.finding;
    for (;;) {
      if (!evaluations.has(node.id)) {
        evaluations.set(node.id, await env.evaluateScope(node));
      }
      const localized = evaluations
        .get(node.id)!
        .findings.filter(
          f => f.nodeId === node.id || isDescendantOf(nodes, node.id, f.nodeId)
        )
        .sort(
          (a, b) =>
            findingPriority(b, node.fanout) - findingPriority(a, node.fanout)
        )[0];
      if (localized) finding = localized;
      if (!finding.descend) break;
      let nextId: string | undefined;
      if (finding.nodeId !== node.id) {
        nextId = nextHopToward(nodes, node, finding.nodeId)?.id;
      } else if (
        LEVEL_ORDER[finding.recommendedScope] > LEVEL_ORDER[node.level]
      ) {
        nextId = node.childIds.find(
          id => nodes.get(id)?.level === finding.recommendedScope
        );
      }
      if (!nextId) break;
      node = nodes.get(nextId)!;
    }

    if (locallyConverged.has(node.id)) {
      // Descent landed on an exhausted node; retire the originating scope so
      // target selection moves to the next weakest node.
      locallyConverged.add(target.node.id);
      continue;
    }

    // Route the pass through the canonical router. Escalation is triggered by
    // measured signals, not a fixed pass count: plateaued gains, a repeated
    // critique class, or evaluator disagreement all disqualify routes that
    // already failed to move the node.
    const excluded = new Set<string>();
    const escalationReasons: EscalationReason[] = [];
    if ((passesSinceMaterialGain.get(node.id) ?? 0) >= policy.plateauWindow) {
      escalationReasons.push('diminishing-returns');
    }
    if ((repeatedClasses.get(`${node.id}:${finding.findingClass}`) ?? 0) >= 2) {
      escalationReasons.push('persistent-critique-class');
    }
    const priorPasses = passes.filter(p => p.nodeId === node.id);
    for (const prior of priorPasses) {
      if (prior.qualityDelta < policy.plateauThreshold) {
        excluded.add(prior.routeReceipt.selectedRoute.id);
      }
      if (prior.parentRegressed) {
        excluded.add(prior.routeReceipt.selectedRoute.id);
      }
    }

    let route: RouteReceipt;
    try {
      route = selectRoute(
        refinementJob(node, passes.length, brief),
        env,
        excluded
      );
    } catch (error) {
      if (error instanceof NoCertifiedRouteError && excluded.size > 0) {
        route = selectRoute(
          refinementJob(node, passes.length, brief),
          env,
          new Set()
        );
      } else if (error instanceof NoCertifiedRouteError) {
        return finish('no-certified-route');
      } else {
        throw error;
      }
    }

    const before = evaluations.get(node.id) ?? (await env.evaluateScope(node));
    const parent = node.parentId ? nodes.get(node.parentId) : null;
    const parentBefore = parent
      ? (evaluations.get(parent.id) ?? (await env.evaluateScope(parent)))
      : null;

    const candidates = await env.generateCandidates(node, brief, route);
    let best: { candidate: RefinementCandidate; eval: NodeEvaluation } | null =
      null;
    for (const candidate of candidates) {
      const candidateEval = await env.evaluateCandidate(node, candidate);
      const delta = meanDelta(before.quality, candidateEval.quality);
      if (!best || delta > meanDelta(before.quality, best.eval.quality)) {
        best = { candidate, eval: candidateEval };
      }
    }

    let accepted: RefinementCandidate | null = null;
    let qualityDelta = 0;
    let parentDelta = 0;
    let parentRegressed = false;

    if (best) {
      qualityDelta = meanDelta(before.quality, best.eval.quality);
      if (qualityDelta >= policy.materialImprovementThreshold) {
        env.applyCandidate(node, best.candidate);
        evaluations.set(node.id, await env.evaluateScope(node));
        accepted = best.candidate;
        if (parent && parentBefore) {
          // Ascend one level: a local win cannot silently hurt the parent.
          const parentAfter = await env.evaluateScope(parent);
          parentDelta = worstRegression(
            parentBefore.quality,
            parentAfter.quality
          );
          if (parentDelta < -policy.parentRegressionTolerance) {
            parentRegressed = true;
            evaluations.set(parent.id, parentBefore);
            locallyConverged.add(node.id);
          } else {
            evaluations.set(parent.id, parentAfter);
          }
        }
      }
    }

    if (!accepted || parentRegressed) {
      const prior = passesSinceMaterialGain.get(node.id) ?? 0;
      if (prior + 1 >= policy.plateauWindow) {
        locallyConverged.add(node.id);
      }
      passesSinceMaterialGain.set(node.id, prior + 1);
    } else {
      passesSinceMaterialGain.set(node.id, 0);
    }
    const classKey = `${node.id}:${finding.findingClass}`;
    repeatedClasses.set(classKey, (repeatedClasses.get(classKey) ?? 0) + 1);

    const outcome = await env.observePassOutcome(node, route, accepted);
    passes.push({
      schema: DESIGN_PASS_SCHEMA,
      passIndex: passes.length,
      nodeId: node.id,
      level: node.level,
      workloadClass: workloadClassFor(node.level),
      routeReceipt: route,
      escalated: escalationReasons.length > 0 || excluded.size > 0,
      escalationReasons,
      acceptedCandidateId: accepted?.id ?? null,
      qualityDelta,
      parentQualityDelta: parentDelta,
      parentRegressed,
      calibration: outcome ? calibrationFor(route, outcome) : null,
    });
  }

  return finish('pass-budget-exhausted');

  function finish(stopReason: RefinementStopReason): RefinementRunReceipt {
    const finalEval = evaluations.get(rootId);
    const materialFindings = finalEval
      ? finalEval.findings.filter(
          f =>
            f.determinism !== 'taste-adjacent' &&
            findingPriority(f, nodes.get(f.nodeId)?.fanout ?? 1) >=
              policy.findingScoreThreshold
        )
      : [];
    return {
      schema: DESIGN_REFINEMENT_SCHEMA,
      rootId,
      brief: brief.text,
      passes,
      stopReason,
      finalQuality: finalEval?.quality ?? null,
      promotionCourtReady:
        (stopReason === 'converged' || stopReason === 'plateau') &&
        materialFindings.length === 0,
      routerVersion: REFINEMENT_ROUTER_VERSION,
      completedAt: now(),
    };
  }
}
