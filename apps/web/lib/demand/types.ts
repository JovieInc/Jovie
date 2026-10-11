// Demand intelligence types (JOV-7419).
//
// Canonical shapes for the Demand Map:
//   entities × requested capabilities × underlying jobs × provenance
//   × graph/ICP adjacency × strategic score × disposition × outcome.
//
// These types are the durable contract. Producers (CLI/agent request surfaces,
// Ask Jovie, agent feedback) normalize into DemandSignal; the map in
// demand-map.ts dedupes, clusters, scores, and recommends. Persistence and
// route wiring are follow-up slices on the same identity scheme.

/** Where a request was observed. */
export type DemandSurface =
  | 'cli'
  | 'mcp'
  | 'agent-api'
  | 'ask-jovie'
  | 'agent-feedback'
  | 'chat'
  | 'web';

/**
 * Who produced the request. Raw volume is not demand: provenance decides
 * whether a signal can count as independent evidence at all.
 */
export type DemandProvenanceKind =
  /** Real user/customer traffic attributable to an account or person. */
  | 'external-customer'
  /** Unauthenticated or unattributed traffic from outside the fleet. */
  | 'external-organic'
  /** Founder/team-originated observation; taste evidence, not customer demand. */
  | 'founder'
  /** Internal fleet/dogfood automation — never independent demand. */
  | 'internal-fleet'
  /** Generated/synthetic traffic (tests, benchmarks, evals). */
  | 'internal-synthetic'
  /** Provenance could not be established; treated as weakest evidence. */
  | 'unknown';

export interface DemandProvenance {
  readonly kind: DemandProvenanceKind;
  /**
   * Stable identity of the requesting source (account id, hashed fingerprint,
   * fleet worker id). Repeated requests from one automated source share this
   * key and collapse to one unit of demand.
   */
  readonly sourceKey: string;
  /** Upstream request/trace id for auditability. */
  readonly requestId?: string;
}

export type DemandEntityKind =
  | 'artist'
  | 'song'
  | 'release'
  | 'venue'
  | 'fan'
  | 'label'
  | 'other';

export interface DemandEntity {
  readonly kind: DemandEntityKind;
  /** Normalized lowercase name used for clustering. */
  readonly name: string;
  /** Graph id when the entity resolves to a known node. */
  readonly graphId?: string;
}

/** A single normalized observation of demand. */
export interface DemandSignal {
  /** Stable dedupe identity; see demandSignalIdentity(). */
  readonly id: string;
  readonly observedAt: string;
  readonly surface: DemandSurface;
  /** Original request text, retained for audit. */
  readonly rawRequest: string;
  /** Lowercased, whitespace-collapsed form used for clustering. */
  readonly normalizedRequest: string;
  /** Capability the request asks for (data or action), e.g. "sms-campaigns". */
  readonly capability: string;
  /** Inferred job-to-be-done, e.g. "notify-fans-about-release". */
  readonly job: string;
  readonly entity?: DemandEntity;
  readonly provenance: DemandProvenance;
  /** True when Jovie already supports the requested capability. */
  readonly supported: boolean;
  /** True when the entity/capability is adjacent to the active ICP graph. */
  readonly icpAdjacent: boolean;
  /**
   * Capabilities that trigger human-gated outbound or spend (JOV-7415) must
   * be flagged here so disposition routes to human escalation.
   */
  readonly requiresHumanGate?: boolean;
}

export type DemandDisposition =
  | 'noise'
  | 'observe'
  | 'investigate'
  | 'build-when-capacity'
  | 'urgent-candidate'
  | 'human-escalation';

export const DEMAND_DISPOSITIONS: readonly DemandDisposition[] = [
  'noise',
  'observe',
  'investigate',
  'build-when-capacity',
  'urgent-candidate',
  'human-escalation',
];

/**
 * One cell of the Demand Map: the same entity×capability×job seen across
 * signals, with independent-vs-synthetic demand already separated.
 */
export interface DemandCluster {
  /** Stable cluster key: entity|capability|job. */
  readonly key: string;
  readonly entity?: DemandEntity;
  readonly capability: string;
  readonly job: string;
  readonly supported: boolean;
  readonly icpAdjacent: boolean;
  readonly requiresHumanGate: boolean;
  /** Signals belonging to this cluster (post-dedupe audit trail). */
  readonly signalIds: readonly string[];
  /** Distinct provenance keys across all signals. */
  readonly totalSources: number;
  /**
   * Distinct non-synthetic provenance keys — the only count that is allowed
   * to drive investigation or build decisions.
   */
  readonly independentSources: number;
  /** Distinct external-customer provenance keys (strongest evidence). */
  readonly customerSources: number;
  /** Distinct internal-fleet/internal-synthetic provenance keys. */
  readonly syntheticSources: number;
  /** Fraction of distinct sources that are synthetic or unknown. */
  readonly syntheticShare: number;
  readonly firstSeenAt: string;
  readonly lastSeenAt: string;
  readonly strategicScore: number;
  readonly disposition: DemandDisposition;
}

export interface DemandRecommendation {
  readonly clusterKey: string;
  readonly disposition: DemandDisposition;
  /** The recommended action in one sentence. */
  readonly action: string;
  /** Evidence-backed case for the recommendation. */
  readonly rationale: string;
  /** Strongest case against acting now. Always present. */
  readonly countercase: string;
  /** Gate reminders that apply before execution. */
  readonly gates: readonly string[];
}

export type DemandOutcomeVerdict = 'validated' | 'missed' | 'inconclusive';

/** Evidence observed after a recommendation was executed. */
export interface DemandOutcome {
  readonly clusterKey: string;
  /** Signals-adoption metrics, all optional — score on what exists. */
  readonly usageCount?: number;
  readonly repeatUsageCount?: number;
  readonly claimCount?: number;
  readonly activationCount?: number;
  readonly retentionCount?: number;
  readonly revenueCents?: number;
  /** New graph nodes attributable to the executed recommendation. */
  readonly graphExpansionCount?: number;
}

// --- Autonomous demand judge (JOV-7421) ------------------------------------

/**
 * Certified-cone / domain gate status for the surface a cluster touches.
 * Demand may reorder work inside governor constraints but can never silently
 * override a 'red' mission-critical cone.
 */
export type DemandGateStatus = 'clear' | 'yellow' | 'red';

/**
 * Strategic context the judge needs that signals alone cannot derive.
 * All numeric fields are normalized 0..1; cost fields are subtractive.
 */
export interface DemandJudgeContext {
  /** Importance of the underlying job-to-be-done. */
  readonly jobImportance?: number;
  /** Graph/network-density leverage of the entity×capability cell. */
  readonly graphLeverage?: number;
  /** Proximity to revenue (billing-adjacent jobs score higher). */
  readonly revenueProximity?: number;
  /** Reusable-primitive leverage — does this compound shared capability? */
  readonly primitiveReuse?: number;
  /** Compounding proprietary-asset value (data, graph, trust). */
  readonly assetCompounding?: number;
  /** Implementation cost including integration surface. */
  readonly implementationCost?: number;
  /** Ongoing data/provider/maintenance cost. */
  readonly ongoingCost?: number;
  /** Risk of fragmenting the roadmap away from the certified cone. */
  readonly fragmentationRisk?: number;
  /** Current certified-cone/domain gate status. Default 'clear'. */
  readonly gateStatus?: DemandGateStatus;
}

/** One explainable scoring component — evidence, not an opaque score. */
export interface DemandScoreComponent {
  readonly dimension: string;
  /** Normalized 0..1 input value (1 for binary signals that fired). */
  readonly value: number;
  /** Points this dimension contributes at value 1 (signed). */
  readonly weight: number;
  /** value × weight, rounded. */
  readonly contribution: number;
  readonly note: string;
}

export type DemandConfidence = 'low' | 'medium' | 'high';

export type DemandPriorArtStatus =
  /** Disposition is routine; prior-art research not required. */
  | 'not-required'
  /** Researcher ran and returned a finding. */
  | 'researched'
  /** Consequential disposition but no finding was available. */
  | 'unavailable';

export interface DemandPriorArt {
  readonly status: DemandPriorArtStatus;
  /** Closest analogue attempted elsewhere, when known. */
  readonly closestAnalogue?: string;
  /** What happened to the analogue when evidence exists. */
  readonly outcome?: 'persisted' | 'changed' | 'failed' | 'unknown';
  readonly summary?: string;
  /**
   * What differs in Jovie's context vs the analogue. Prior art is evidence,
   * not authority — this field is required for 'researched' findings.
   */
  readonly jovieDifference?: string;
}

/**
 * Injectable prior-art researcher. Deterministic judge calls this only for
 * consequential dispositions; wiring to real research is a later slice.
 */
export type DemandPriorArtResearcher = (
  cluster: DemandCluster
) => DemandPriorArt | null | undefined;

/** Full judge output for one cluster: recommendation + explainable score. */
export interface DemandJudgment {
  readonly clusterKey: string;
  readonly cluster: DemandCluster;
  /**
   * Strategic score after judge context is applied on top of the cluster's
   * signal-derived score. Reproducible: same inputs → same score.
   */
  readonly judgedScore: number;
  readonly confidence: DemandConfidence;
  /**
   * Final disposition after judge overrides (RED cone cap, ambiguous
   * high-value escalation). May differ from cluster.disposition.
   */
  readonly disposition: DemandDisposition;
  readonly recommendation: DemandRecommendation;
  /** Explainable per-dimension evidence behind judgedScore. */
  readonly evidence: readonly DemandScoreComponent[];
  /** Strongest case against acting now, including judge-level counters. */
  readonly countercase: string;
  readonly priorArt: DemandPriorArt;
  /** Why the judge overrode the cluster disposition, if it did. */
  readonly overrideReasons: readonly string[];
}

export interface DemandBacktest {
  readonly clusterKey: string;
  readonly predictedScore: number;
  readonly verdict: DemandOutcomeVerdict;
  /** Realized strength 0..1 used to recalibrate future scoring. */
  readonly realizedStrength: number;
  /** Human-readable explanation of the verdict. */
  readonly explanation: string;
}
