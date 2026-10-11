// Autonomous demand judge (JOV-7421).
//
// Sits on top of the Demand Map (JOV-7419): for each material cluster it
// applies strategic context the signals cannot derive — job importance, graph
// leverage, revenue proximity, primitive reuse, asset compounding, cost, and
// fragmentation risk — then emits an explainable judgment:
//   recommendation + strongest countercase + confidence + evidence +
//   prior-art finding + disposition.
//
// Hard rules encoded here:
//   - Scoring is pure and reproducible: same evidence + context → same score.
//   - The recommendation exposes per-dimension evidence, never an opaque
//     score alone.
//   - Prior-art research runs only for consequential dispositions; routine
//     weak signals do not pay the research cost.
//   - Demand cannot override a RED certified-cone/domain gate or human-gated
//     spend/outbound: RED caps the disposition at 'investigate'.
//   - Ambiguous high-value tradeoffs (high upside AND high cost, fragmentation
//     risk, or failed prior art) escalate to a human. Judge output is a
//     disposition, never an execution authorization.

import {
  DEMAND_DISPOSITION_THRESHOLDS,
  recommendForCluster,
} from './demand-map';
import type {
  DemandCluster,
  DemandConfidence,
  DemandDisposition,
  DemandJudgeContext,
  DemandJudgment,
  DemandPriorArt,
  DemandPriorArtResearcher,
  DemandScoreComponent,
} from './types';

function clamp01(value: number | undefined): number {
  if (value == null || Number.isNaN(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/**
 * Signed points each context dimension contributes at value 1. Upside
 * dimensions are additive; cost/risk dimensions are subtractive.
 */
export const DEMAND_JUDGE_WEIGHTS = {
  jobImportance: 10,
  graphLeverage: 10,
  revenueProximity: 10,
  primitiveReuse: 8,
  assetCompounding: 8,
  implementationCost: -12,
  ongoingCost: -8,
  fragmentationRisk: -10,
} as const;

/** Combined downside at or above which a high-value cluster is ambiguous. */
export const DEMAND_AMBIGUITY_DOWNSIDE = 1.2;

const CONTEXT_DIMENSIONS: readonly {
  key: keyof Omit<DemandJudgeContext, 'gateStatus'>;
  dimension: string;
  note: string;
}[] = [
  {
    key: 'jobImportance',
    dimension: 'job-importance',
    note: 'importance of the underlying job-to-be-done',
  },
  {
    key: 'graphLeverage',
    dimension: 'graph-leverage',
    note: 'graph/network-density leverage',
  },
  {
    key: 'revenueProximity',
    dimension: 'revenue-proximity',
    note: 'proximity to revenue',
  },
  {
    key: 'primitiveReuse',
    dimension: 'primitive-reuse',
    note: 'reusable-primitive leverage',
  },
  {
    key: 'assetCompounding',
    dimension: 'asset-compounding',
    note: 'compounding proprietary-asset value',
  },
  {
    key: 'implementationCost',
    dimension: 'implementation-cost',
    note: 'implementation + integration cost',
  },
  {
    key: 'ongoingCost',
    dimension: 'ongoing-cost',
    note: 'ongoing data/provider/maintenance cost',
  },
  {
    key: 'fragmentationRisk',
    dimension: 'fragmentation-risk',
    note: 'risk of roadmap fragmentation',
  },
];

function confidenceFor(cluster: DemandCluster): DemandConfidence {
  if (cluster.independentSources >= 3 && cluster.syntheticShare < 0.3)
    return 'high';
  if (cluster.independentSources >= 1 && cluster.syntheticShare < 0.6)
    return 'medium';
  return 'low';
}

/**
 * Dispositions consequential enough to require prior-art research.
 * 'investigate' is itself the bounded research step, so prior art applies
 * from build candidacy upward.
 */
const CONSEQUENTIAL: readonly DemandDisposition[] = [
  'build-when-capacity',
  'urgent-candidate',
  'human-escalation',
];

function dispositionRank(disposition: DemandDisposition): number {
  return [
    'noise',
    'observe',
    'investigate',
    'build-when-capacity',
    'urgent-candidate',
    'human-escalation',
  ].indexOf(disposition);
}

function scoreDisposition(score: number): DemandDisposition {
  if (score >= DEMAND_DISPOSITION_THRESHOLDS.urgentCandidate)
    return 'urgent-candidate';
  if (score >= DEMAND_DISPOSITION_THRESHOLDS.buildWhenCapacity)
    return 'build-when-capacity';
  if (score >= DEMAND_DISPOSITION_THRESHOLDS.investigate) return 'investigate';
  if (score >= DEMAND_DISPOSITION_THRESHOLDS.observe) return 'observe';
  return 'noise';
}

function runPriorArt(
  cluster: DemandCluster,
  disposition: DemandDisposition,
  researcher?: DemandPriorArtResearcher
): DemandPriorArt {
  if (!CONSEQUENTIAL.includes(disposition)) {
    return { status: 'not-required' };
  }
  const finding = researcher?.(cluster);
  if (!finding) {
    return {
      status: 'unavailable',
      summary:
        'Consequential disposition requires prior-art research, but no finding was available.',
    };
  }
  return { ...finding, status: 'researched' };
}

/**
 * Judge one cluster. Pure: same cluster + context + researcher → same
 * judgment, so identical evidence always reproduces the same score.
 */
export function judgeCluster(
  cluster: DemandCluster,
  context: DemandJudgeContext = {},
  researcher?: DemandPriorArtResearcher
): DemandJudgment {
  const evidence: DemandScoreComponent[] = [
    {
      dimension: 'signal-quality',
      value: 1,
      weight: cluster.strategicScore,
      contribution: cluster.strategicScore,
      note:
        `${cluster.independentSources} independent / ` +
        `${cluster.customerSources} customer / ` +
        `${cluster.syntheticSources} synthetic source(s); ` +
        `${Math.round(cluster.syntheticShare * 100)}% synthetic share`,
    },
    {
      dimension: 'icp-relevance',
      value: cluster.icpAdjacent ? 1 : 0,
      weight: 0,
      contribution: 0,
      note: cluster.icpAdjacent
        ? 'adjacent to the active ICP graph (already inside signal score)'
        : 'outside the active musician ICP',
    },
  ];

  let judgedScore = cluster.strategicScore;
  for (const dim of CONTEXT_DIMENSIONS) {
    const value = clamp01(context[dim.key]);
    const weight = DEMAND_JUDGE_WEIGHTS[dim.key];
    const contribution = Math.round(value * weight);
    judgedScore += contribution;
    evidence.push({
      dimension: dim.dimension,
      value,
      weight,
      contribution,
      note: dim.note,
    });
  }
  judgedScore = Math.max(0, judgedScore);

  const overrideReasons: string[] = [];
  const downside =
    clamp01(context.implementationCost) +
    clamp01(context.ongoingCost) * 0.5 +
    clamp01(context.fragmentationRisk);
  const gateStatus = context.gateStatus ?? 'clear';

  // Start from the judged score, then apply governor constraints. Demand can
  // reorder work but context can never inflate synthetic/fleet/founder/unknown
  // volume into a build decision — zero independent demand keeps the map
  // disposition exactly.
  let disposition: DemandDisposition;
  if (cluster.independentSources === 0) {
    disposition = cluster.disposition;
  } else {
    disposition = scoreDisposition(judgedScore);
    // Context may lift but never demote below the disposition the raw
    // evidence earned; heavy downside escalates instead of quietly sliding.
    if (dispositionRank(disposition) < dispositionRank(cluster.disposition)) {
      disposition = cluster.disposition;
    }
  }

  const priorArt = runPriorArt(cluster, disposition, researcher);

  // RED cone: cap at investigate. Demand may reorder inside governor
  // constraints but cannot silently override a mission-critical RED gate.
  if (
    gateStatus === 'red' &&
    (disposition === 'build-when-capacity' ||
      disposition === 'urgent-candidate')
  ) {
    overrideReasons.push(
      'Certified-cone/domain gate is RED: capped at investigate pending human gate resolution.'
    );
    disposition = 'investigate';
  }

  // Ambiguous high-value tradeoff: real upside but heavy downside or failed
  // prior art — escalate rather than auto-committing roadmap capacity.
  if (
    disposition === 'build-when-capacity' ||
    disposition === 'urgent-candidate'
  ) {
    if (downside >= DEMAND_AMBIGUITY_DOWNSIDE) {
      overrideReasons.push(
        `High-value but ambiguous: combined cost/fragmentation downside ${downside.toFixed(2)} >= ${DEMAND_AMBIGUITY_DOWNSIDE}; escalating for human tradeoff.`
      );
      disposition = 'human-escalation';
    } else if (priorArt.outcome === 'failed') {
      overrideReasons.push(
        `Closest analogue '${priorArt.closestAnalogue ?? 'unknown'}' failed; escalating for human review of what differs in Jovie's context.`
      );
      disposition = 'human-escalation';
    }
  }

  // Human-gated spend/outbound always escalates regardless of score.
  if (cluster.requiresHumanGate && disposition !== 'human-escalation') {
    overrideReasons.push(
      'Capability touches human-gated outbound/spend (JOV-7415).'
    );
    disposition = 'human-escalation';
  }

  const judgedCluster: DemandCluster = { ...cluster, disposition };
  const recommendation = recommendForCluster(judgedCluster);

  const counters: string[] = [];
  if (downside >= DEMAND_AMBIGUITY_DOWNSIDE)
    counters.push(
      'implementation, ongoing, and fragmentation costs together outweigh a clean build call'
    );
  if (priorArt.outcome === 'failed')
    counters.push(
      `closest analogue failed${priorArt.jovieDifference ? ` — Jovie differs: ${priorArt.jovieDifference}` : ''}`
    );
  if (gateStatus === 'red')
    counters.push('domain gate is RED; roadmap capacity is already committed');
  if (confidenceFor(cluster) !== 'high')
    counters.push('confidence is not high; evidence base is thin or synthetic');
  const countercase =
    counters.length > 0
      ? `${recommendation.countercase} ${counters.join('; ')}.`
      : recommendation.countercase;

  return {
    clusterKey: cluster.key,
    cluster,
    judgedScore,
    confidence: confidenceFor(cluster),
    disposition,
    recommendation: { ...recommendation, countercase },
    evidence,
    countercase,
    priorArt,
    overrideReasons,
  };
}

export interface JudgeAllOptions {
  /** Per-cluster context lookup; defaults to empty context. */
  readonly contextFor?: (cluster: DemandCluster) => DemandJudgeContext;
  readonly researcher?: DemandPriorArtResearcher;
}

/** Judge every cluster in map order. */
export function judgeAll(
  clusters: readonly DemandCluster[],
  options: JudgeAllOptions = {}
): DemandJudgment[] {
  return clusters.map(cluster =>
    judgeCluster(
      cluster,
      options.contextFor?.(cluster) ?? {},
      options.researcher
    )
  );
}
