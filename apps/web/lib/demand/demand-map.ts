// Demand Map core (JOV-7419).
//
// Deterministic, side-effect-free core loop:
//   observe → provenance/dedupe → cluster → score → recommend → backtest.
//
// Hard rules encoded here:
//   - Raw request volume is not demand; only distinct non-synthetic
//     provenance keys count as independent demand.
//   - Synthetic/fleet traffic can never reach investigate/build dispositions.
//   - Demand earns investigation; dispositions never authorize execution —
//     human-gated capabilities always route to 'human-escalation'.
//   - Recommendations always ship with the strongest countercase.

import { createHash } from 'node:crypto';

import type {
  DemandBacktest,
  DemandCluster,
  DemandDisposition,
  DemandOutcome,
  DemandOutcomeVerdict,
  DemandProvenanceKind,
  DemandRecommendation,
  DemandSignal,
} from './types';

const SYNTHETIC_KINDS: readonly DemandProvenanceKind[] = [
  'internal-fleet',
  'internal-synthetic',
];

const STRONG_KINDS: readonly DemandProvenanceKind[] = [
  'external-customer',
  'external-organic',
];

/** Raw request text an adapter observed on a CLI/agent surface. */
export interface RawDemandObservation {
  readonly observedAt: string;
  readonly surface: DemandSignal['surface'];
  readonly request: string;
  readonly capability: string;
  readonly job: string;
  readonly entity?: DemandSignal['entity'];
  readonly provenance: DemandSignal['provenance'];
  readonly supported?: boolean;
  readonly icpAdjacent?: boolean;
  readonly requiresHumanGate?: boolean;
}

export function normalizeRequestText(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Stable dedupe identity: same normalized request from the same provenance
 * source converges on one id regardless of delivery count or surface retries.
 */
export function demandSignalIdentity(
  observation: Omit<RawDemandObservation, 'observedAt'>
): string {
  const basis = [
    observation.provenance.kind,
    observation.provenance.sourceKey,
    observation.entity
      ? `${observation.entity.kind}:${observation.entity.name}`
      : '',
    observation.capability,
    observation.job,
    normalizeRequestText(observation.request),
  ].join('|');
  return createHash('sha256').update(basis).digest('hex').slice(0, 24);
}

/** Normalize a raw observation into a canonical DemandSignal. */
export function normalizeDemandSignal(
  observation: RawDemandObservation
): DemandSignal {
  const { observedAt, request, ...rest } = observation;
  return {
    id: demandSignalIdentity(observation),
    observedAt,
    rawRequest: request,
    normalizedRequest: normalizeRequestText(request),
    supported: observation.supported ?? false,
    icpAdjacent: observation.icpAdjacent ?? false,
    requiresHumanGate: observation.requiresHumanGate ?? false,
    ...rest,
    entity: observation.entity
      ? {
          ...observation.entity,
          name: normalizeRequestText(observation.entity.name),
        }
      : undefined,
    capability: normalizeRequestText(observation.capability),
    job: normalizeRequestText(observation.job),
  };
}

export function isSyntheticKind(kind: DemandProvenanceKind): boolean {
  return SYNTHETIC_KINDS.includes(kind);
}

export function clusterKeyFor(signal: DemandSignal): string {
  const entity = signal.entity
    ? `${signal.entity.kind}:${signal.entity.name}`
    : '*';
  return `${entity}|${signal.capability}|${signal.job}`;
}

// --- Scoring ---------------------------------------------------------------
//
// Score components (0..~100). Independent external/customer demand dominates;
// ICP adjacency and unsupported-capability gaps raise priority; synthetic
// share and founder-only evidence discount it. Volume alone cannot score.

export const DEMAND_SCORE_WEIGHTS = {
  perIndependentSource: 12,
  perCustomerSource: 8,
  icpAdjacentBonus: 15,
  unsupportedGapBonus: 15,
  repeatDepthBonus: 4,
  syntheticPenaltyPerTenth: 6,
  founderOnlyCap: 25,
  unknownOnlyCap: 15,
} as const;

export const DEMAND_DISPOSITION_THRESHOLDS = {
  observe: 15,
  investigate: 35,
  buildWhenCapacity: 60,
  urgentCandidate: 80,
} as const;

interface ClusterAggregate {
  readonly key: string;
  readonly signals: DemandSignal[];
  readonly independentKeys: Set<string>;
  readonly customerKeys: Set<string>;
  readonly syntheticKeys: Set<string>;
  readonly founderKeys: Set<string>;
}

function aggregate(signals: readonly DemandSignal[]): ClusterAggregate[] {
  const byKey = new Map<string, DemandSignal[]>();
  const seenIds = new Set<string>();
  for (const signal of signals) {
    if (seenIds.has(signal.id)) continue;
    seenIds.add(signal.id);
    const key = clusterKeyFor(signal);
    const list = byKey.get(key);
    if (list) list.push(signal);
    else byKey.set(key, [signal]);
  }
  return [...byKey.entries()].map(([key, clusterSignals]) => {
    const independentKeys = new Set<string>();
    const customerKeys = new Set<string>();
    const syntheticKeys = new Set<string>();
    const founderKeys = new Set<string>();
    for (const signal of clusterSignals) {
      const kind = signal.provenance.kind;
      const sourceKey = signal.provenance.sourceKey;
      if (isSyntheticKind(kind)) {
        syntheticKeys.add(sourceKey);
      } else if (STRONG_KINDS.includes(kind)) {
        independentKeys.add(sourceKey);
        if (kind === 'external-customer') customerKeys.add(sourceKey);
      } else if (kind === 'founder') {
        founderKeys.add(sourceKey);
      }
    }
    return {
      key,
      signals: clusterSignals,
      independentKeys,
      customerKeys,
      syntheticKeys,
      founderKeys,
    };
  });
}

function scoreCluster(agg: ClusterAggregate): {
  score: number;
  syntheticShare: number;
} {
  const distinctSources = new Set(agg.signals.map(s => s.provenance.sourceKey));
  const total = distinctSources.size;
  const syntheticShare =
    total === 0
      ? 0
      : (agg.syntheticKeys.size +
          [...distinctSources].filter(k =>
            agg.signals.some(
              s =>
                s.provenance.sourceKey === k && s.provenance.kind === 'unknown'
            )
          ).length) /
        total;

  const independent = agg.independentKeys.size;
  const customers = agg.customerKeys.size;
  const first = agg.signals[0];
  const repeatDepth = Math.max(
    0,
    agg.signals.length - independent - agg.syntheticKeys.size
  );

  let score =
    independent * DEMAND_SCORE_WEIGHTS.perIndependentSource +
    customers * DEMAND_SCORE_WEIGHTS.perCustomerSource +
    (first?.icpAdjacent ? DEMAND_SCORE_WEIGHTS.icpAdjacentBonus : 0) +
    (first && !first.supported ? DEMAND_SCORE_WEIGHTS.unsupportedGapBonus : 0) +
    Math.min(repeatDepth, 5) * DEMAND_SCORE_WEIGHTS.repeatDepthBonus -
    Math.round(syntheticShare * 10) *
      DEMAND_SCORE_WEIGHTS.syntheticPenaltyPerTenth;

  // Founder and unknown provenance are real but capped evidence.
  const strongestKind = agg.signals.reduce<DemandProvenanceKind>((best, s) => {
    const rank = (k: DemandProvenanceKind) =>
      k === 'external-customer'
        ? 4
        : k === 'external-organic'
          ? 3
          : k === 'founder'
            ? 2
            : k === 'unknown'
              ? 1
              : 0;
    return rank(s.provenance.kind) > rank(best) ? s.provenance.kind : best;
  }, 'internal-synthetic');
  if (strongestKind === 'founder') {
    score = Math.min(score, DEMAND_SCORE_WEIGHTS.founderOnlyCap);
  } else if (strongestKind === 'unknown') {
    score = Math.min(score, DEMAND_SCORE_WEIGHTS.unknownOnlyCap);
  }

  return { score: Math.max(0, Math.round(score)), syntheticShare };
}

function dispositionFor(
  score: number,
  independentSources: number,
  requiresHumanGate: boolean,
  hasFounderObservation: boolean
): DemandDisposition {
  if (independentSources === 0) {
    // Founder observations are real evidence (JOV-5916) even though they are
    // not customer demand — keep them observable, never noise.
    return hasFounderObservation ? 'observe' : 'noise';
  }
  if (requiresHumanGate) return 'human-escalation';
  if (score >= DEMAND_DISPOSITION_THRESHOLDS.urgentCandidate)
    return 'urgent-candidate';
  if (score >= DEMAND_DISPOSITION_THRESHOLDS.buildWhenCapacity)
    return 'build-when-capacity';
  if (score >= DEMAND_DISPOSITION_THRESHOLDS.investigate) return 'investigate';
  return 'observe';
}

/** Build the Demand Map: dedupe signals, cluster, score, assign disposition. */
export function buildDemandMap(
  signals: readonly DemandSignal[]
): DemandCluster[] {
  return aggregate(signals)
    .map(agg => {
      const { score, syntheticShare } = scoreCluster(agg);
      const first = agg.signals[0];
      const times = agg.signals.map(s => s.observedAt).sort();
      const independent = agg.independentKeys.size;
      return {
        key: agg.key,
        entity: first.entity,
        capability: first.capability,
        job: first.job,
        supported: first.supported,
        icpAdjacent: first.icpAdjacent,
        requiresHumanGate: agg.signals.some(s => s.requiresHumanGate),
        signalIds: agg.signals.map(s => s.id),
        totalSources: new Set(agg.signals.map(s => s.provenance.sourceKey))
          .size,
        independentSources: independent,
        customerSources: agg.customerKeys.size,
        syntheticSources: agg.syntheticKeys.size,
        syntheticShare,
        firstSeenAt: times[0],
        lastSeenAt: times[times.length - 1],
        strategicScore: score,
        disposition: dispositionFor(
          score,
          independent,
          agg.signals.some(s => s.requiresHumanGate),
          agg.founderKeys.size > 0
        ),
      } satisfies DemandCluster;
    })
    .sort((a, b) => b.strategicScore - a.strategicScore);
}

// --- Recommendation --------------------------------------------------------

const GATE_NOTES = {
  human:
    'Human-gated outbound/spend (JOV-7415): requires explicit human approval before any execution.',
  domainRed:
    'Domain RED gates still apply — unrelated breadth work stays blocked.',
  certifiedCone:
    'Does not override the mission-critical certified cone; capacity allocator owns admission.',
} as const;

/**
 * Produce the recommendation and the strongest countercase for a cluster.
 * Never returns an execution authorization — only a disposition and reasoning.
 */
export function recommendForCluster(
  cluster: DemandCluster
): DemandRecommendation {
  const gates: string[] = [GATE_NOTES.certifiedCone, GATE_NOTES.domainRed];
  if (cluster.requiresHumanGate) gates.unshift(GATE_NOTES.human);

  const evidenceBits: string[] = [
    `${cluster.independentSources} independent source(s)`,
    `${cluster.customerSources} customer source(s)`,
  ];
  if (!cluster.supported) evidenceBits.push('capability not yet supported');
  if (cluster.icpAdjacent) evidenceBits.push('adjacent to active ICP/graph');
  const rationale =
    `Request for '${cluster.capability}' (job: '${cluster.job}') shows ` +
    evidenceBits.join(', ') +
    `; strategic score ${cluster.strategicScore}.`;

  const counters: string[] = [];
  if (cluster.independentSources <= 1)
    counters.push('a single independent source may be anecdotal, not demand');
  if (cluster.syntheticShare > 0)
    counters.push(
      `${Math.round(cluster.syntheticShare * 100)}% of distinct sources are synthetic/unknown`
    );
  if (cluster.supported)
    counters.push(
      'capability already exists — this may be a discovery/education gap, not a build'
    );
  if (!cluster.icpAdjacent)
    counters.push('outside the active musician ICP; expansion not yet earned');
  if (cluster.entity == null)
    counters.push(
      'no entity resolution — concentration inside the graph is unverified'
    );
  if (cluster.requiresHumanGate)
    counters.push('execution touches human-gated spend/outbound');
  if (counters.length === 0)
    counters.push(
      'demand looks real but correlation with retention/revenue is unproven until backtested'
    );

  const actionByDisposition: Record<DemandDisposition, string> = {
    noise: 'Do not act; retain for calibration only.',
    observe: `Keep observing '${cluster.capability}' demand; no investigation spend yet.`,
    investigate: `Open a bounded investigation into '${cluster.job}' demand before any build commitment.`,
    'build-when-capacity': `Queue '${cluster.capability}' behind certified-cone capacity with an executable next action.`,
    'urgent-candidate': `Escalate '${cluster.capability}' to the capacity allocator as an urgent candidate with this evidence attached.`,
    'human-escalation':
      'Route to human review — gated spend/outbound cannot proceed autonomously.',
  };

  return {
    clusterKey: cluster.key,
    disposition: cluster.disposition,
    action: actionByDisposition[cluster.disposition],
    rationale,
    countercase: counters.join('; ') + '.',
    gates,
  };
}

/** Recommendations for every cluster, in map order. */
export function recommendAll(
  clusters: readonly DemandCluster[]
): DemandRecommendation[] {
  return clusters.map(recommendForCluster);
}

// --- Backtest / recalibration ----------------------------------------------

const REALIZED_THRESHOLDS = { validated: 0.5, missed: 0.15 } as const;

/**
 * Score whether an executed recommendation was actually correct against
 * downstream evidence. Returns realized strength 0..1 for recalibrating
 * future prioritization — misses should lower confidence in the signals
 * that produced the recommendation.
 */
export function backtestRecommendation(
  cluster: DemandCluster,
  outcome: DemandOutcome
): DemandBacktest {
  const hasAnyMetric = [
    outcome.usageCount,
    outcome.repeatUsageCount,
    outcome.claimCount,
    outcome.activationCount,
    outcome.retentionCount,
    outcome.revenueCents,
    outcome.graphExpansionCount,
  ].some(v => typeof v === 'number' && v > 0);

  if (!hasAnyMetric) {
    return {
      clusterKey: cluster.key,
      predictedScore: cluster.strategicScore,
      verdict: 'inconclusive',
      realizedStrength: 0,
      explanation:
        'No downstream evidence recorded; cannot judge the recommendation.',
    };
  }

  // Realized strength: each evidence channel contributes up to a bounded share.
  const usage = Math.min(
    (outcome.usageCount ?? 0) / Math.max(cluster.independentSources * 5, 5),
    1
  );
  const repeat = Math.min(
    (outcome.repeatUsageCount ?? 0) /
      Math.max(cluster.independentSources * 2, 2),
    1
  );
  const claims = Math.min(
    (outcome.claimCount ?? 0) / Math.max(cluster.independentSources, 1),
    1
  );
  const activation = Math.min(
    (outcome.activationCount ?? 0) / Math.max(cluster.customerSources, 1),
    1
  );
  const retention = Math.min(
    (outcome.retentionCount ?? 0) / Math.max(cluster.customerSources, 1),
    1
  );
  const revenue = (outcome.revenueCents ?? 0) > 0 ? 1 : 0;
  const graph = Math.min((outcome.graphExpansionCount ?? 0) / 3, 1);

  const realizedStrength =
    usage * 0.2 +
    repeat * 0.15 +
    claims * 0.15 +
    activation * 0.2 +
    retention * 0.15 +
    revenue * 0.1 +
    graph * 0.05;

  const verdict: DemandOutcomeVerdict =
    realizedStrength >= REALIZED_THRESHOLDS.validated
      ? 'validated'
      : realizedStrength < REALIZED_THRESHOLDS.missed
        ? 'missed'
        : 'inconclusive';

  const explanation =
    verdict === 'validated'
      ? 'Downstream evidence confirms the recommendation; similar signals can score higher.'
      : verdict === 'missed'
        ? 'Executed recommendation produced no meaningful downstream evidence; recalibrate weights down for this signal profile.'
        : 'Partial downstream evidence; keep observing before adjusting calibration.';

  return {
    clusterKey: cluster.key,
    predictedScore: cluster.strategicScore,
    verdict,
    realizedStrength: Math.round(realizedStrength * 100) / 100,
    explanation,
  };
}
