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

export interface DemandBacktest {
  readonly clusterKey: string;
  readonly predictedScore: number;
  readonly verdict: DemandOutcomeVerdict;
  /** Realized strength 0..1 used to recalibrate future scoring. */
  readonly realizedStrength: number;
  /** Human-readable explanation of the verdict. */
  readonly explanation: string;
}
