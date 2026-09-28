/**
 * ovie.shipping-state.v1 — Ubuntu Operational Truth contract (JOV-5248).
 *
 * Composes existing producers. Zero is only legal after a successful
 * authoritative measurement whose value is actually zero. Missing data never
 * becomes now, zero, healthy, or blank.
 */

export const SHIPPING_STATE_SCHEMA = 'ovie.shipping-state.v1' as const;
export const SHIPPING_STATE_PRODUCER_ID = 'ubuntu-operational-truth' as const;
export const SHIPPING_STATE_PRODUCER_VERSION = '1' as const;
export const M1_SOURCE_TO_PROJECTION_BUDGET_MS = 10_000;
export const SHIPPING_SOURCE_READ_TIMEOUT_MS = 7_500;
export const SHIPPING_STATE_FRESHNESS_MS = 10_000;
export const SHIPPING_STATE_CLOCK_SKEW_MS = 60_000;
export const MAX_ACCEPTED_SOURCE_SEQUENCE_GAP = 10_000;

export const SHIPPING_SOURCE_IDS = [
  'lanes-status',
  'lane-pull-requests',
  'github-native-merge-queue',
  'github-merges',
  'exact-sha-ci',
  'production-controller',
  'live-build-info',
  'summer-runtime',
] as const;

export type ShippingSourceId = (typeof SHIPPING_SOURCE_IDS)[number];

/**
 * Producer-event validity is distinct from successful observation freshness.
 * Current GitHub/runtime reads are identity-bound and therefore have no
 * elapsed-time expiry here. The published lanes feed carries its own `at`
 * and is stale once that is older than ten minutes.
 */
export const SHIPPING_SOURCE_SEMANTIC_FRESHNESS_MS = {
  'lanes-status': 10 * 60_000,
  'lane-pull-requests': null,
  'github-native-merge-queue': null,
  'github-merges': null,
  'exact-sha-ci': null,
  'production-controller': null,
  'live-build-info': null,
  'summer-runtime': null,
} as const satisfies Record<ShippingSourceId, number | null>;

export const SHIPPING_SOURCE_SCHEMAS = {
  'lanes-status': 'symphony-lanes-status/v1',
  'lane-pull-requests': 'github-lane-pull-requests/v1',
  'github-native-merge-queue': 'github-merge-queue-entry/v1',
  'github-merges': 'github-merge-counts/v1',
  'exact-sha-ci': 'github-actions-run/v1',
  'production-controller': 'jovie-controller-snapshot/v1',
  'live-build-info': 'jovie-build-info/v1',
  'summer-runtime': 'summer-runtime-health/v1',
} as const satisfies Record<ShippingSourceId, string>;

export const SHIPPING_SOURCE_PRODUCERS = {
  'lanes-status': 'symphony-lanes',
  'lane-pull-requests': 'github-pull-requests',
  'github-native-merge-queue': 'github-native-merge-queue',
  'github-merges': 'github-search',
  'exact-sha-ci': 'github-actions-ci',
  'production-controller': 'production-controller',
  'live-build-info': 'live-build-info',
  'summer-runtime': 'summer-runtime',
} as const satisfies Record<ShippingSourceId, string>;

export const OBSERVATION_STATES = [
  'fresh',
  'stale',
  'disconnected',
  'unavailable',
  'unauthorized',
  'degraded',
  'unknown',
  'error',
  'measured-nonzero',
  'measured-zero',
  'not-measured',
  'partial',
] as const;

export type ObservationState = (typeof OBSERVATION_STATES)[number];

export const OPERATIONAL_TASK_WORKFLOW_STATES = [
  'queued',
  'running',
  'retrying',
  'blocked',
  'in-review',
  'merge-queued',
  'merged',
  'production-verified',
] as const;

export type OperationalTaskWorkflowState =
  (typeof OPERATIONAL_TASK_WORKFLOW_STATES)[number];

export const OPERATIONAL_TASK_SYNC_STATES = [
  'fresh',
  'stale',
  'syncing',
  'failed',
] as const;

export type OperationalTaskSyncState =
  (typeof OPERATIONAL_TASK_SYNC_STATES)[number];

export type OperationalTaskPriority =
  | 'urgent'
  | 'high'
  | 'medium'
  | 'low'
  | 'none';

/** Rollup of the head-commit check suite for a lane pull request. */
export type OperationalTaskChecks = {
  readonly rollup: 'success' | 'failure' | 'pending' | 'unknown';
  /** Sanitized names of failing check runs / status contexts (bounded). */
  readonly failing: readonly string[];
};

/**
 * GitHub pull-request detail for a lane task. Null when the task came from a
 * source without PR evidence, or when an older publisher produced the feed.
 */
export type OperationalTaskPullRequest = {
  readonly number: number;
  readonly url: string | null;
  readonly branch: string | null;
  /** Owning agent lane derived from the branch prefix. */
  readonly agent: 'devin' | 'codex' | null;
  readonly isDraft: boolean;
  readonly checks: OperationalTaskChecks;
  readonly queuePosition: number | null;
  readonly queueState: string | null;
  readonly createdAt: string | null;
};

export type OperationalTask = {
  /** Stable cross-presentation identity. Linear remains the canonical owner. */
  readonly id: `linear:${string}`;
  readonly linearIdentifier: string;
  readonly linearUrl: string | null;
  readonly title: string;
  readonly workflowState: OperationalTaskWorkflowState;
  readonly priority: OperationalTaskPriority;
  readonly attempt: number | null;
  readonly retryAt: string | null;
  readonly sourceRevision: string | null;
  readonly updatedAt: string | null;
  readonly pullRequest?: OperationalTaskPullRequest | null;
};

export type OperationalTaskDelta = {
  readonly taskId: OperationalTask['id'];
  readonly kind: 'added' | 'updated' | 'removed';
  readonly fromState: OperationalTaskWorkflowState | null;
  readonly toState: OperationalTaskWorkflowState | null;
  readonly sequence: number;
};

export type OperationalTaskFeed = {
  readonly canonicalSource: 'linear';
  readonly cacheMode: 'local-reconciled';
  readonly syncState: OperationalTaskSyncState;
  readonly sourceId: 'lane-pull-requests';
  readonly observedAt: string | null;
  readonly lastSyncedAt: string | null;
  readonly freshnessDeadline: string | null;
  readonly tasks: readonly OperationalTask[];
  readonly deltas: readonly OperationalTaskDelta[];
};

export const SHIP_MEANING_KEYS = [
  'merged',
  'queued',
  'ciGreen',
  'productionVerified',
  'exactLiveBuild',
] as const;

export type ShipMeaningKey = (typeof SHIP_MEANING_KEYS)[number];

export const FORBIDDEN_ACTUATION = [
  'raw-logs',
  'secrets',
  'credentials',
  'arbitrary-paths',
  'arbitrary-command',
  'command-execution',
  'dispatch',
  'retry',
  'cancel',
  'restart',
  'actuation',
] as const;

export const FORBIDDEN_QUERY_KEYS = [
  'path',
  'file',
  'log',
  'logs',
  'cmd',
  'command',
  'exec',
  'spawn',
  'action',
  'dispatch',
  'retry',
  'cancel',
  'restart',
] as const;

export type CountMeasurement =
  | { readonly state: 'not-measured'; readonly value: null }
  | { readonly state: 'measured-zero'; readonly value: 0 }
  | { readonly state: 'measured-nonzero'; readonly value: number };

export type BooleanMeasurement =
  | { readonly state: 'not-measured'; readonly value: null }
  | { readonly state: 'measured'; readonly value: boolean };

export type DurationMeasurement =
  | { readonly state: 'not-measured'; readonly value: null }
  | { readonly state: 'measured-zero'; readonly value: 0 }
  | { readonly state: 'measured-nonzero'; readonly value: number };

export type SanitizedError = {
  readonly at: string;
  readonly code: string;
  readonly message: string;
};

export type LastSuccess = {
  readonly at: string;
  readonly sequence: number;
  readonly eventId: string;
};

export type ShippingCorrelation = {
  readonly workId: string | null;
  readonly leaseId: string | null;
  readonly prNumber: number | null;
  readonly ciRunId: string | null;
  readonly deploymentId: string | null;
  readonly buildId: string | null;
  readonly sha: string | null;
};

export type IdentityFields = {
  readonly producerId: string;
  readonly producerVersion: string;
  readonly sourceId: ShippingSourceId;
  readonly entityId: string;
  readonly schema: string;
  readonly eventId: string;
  readonly sequence: number;
  readonly cursor: string;
  readonly sourceRevision: string | null;
  readonly sourceTimestamp: string | null;
  readonly observationTimestamp: string;
  readonly emissionTimestamp: string;
  readonly freshnessDeadline: string;
  readonly correlation: ShippingCorrelation;
  readonly lastSuccess: LastSuccess | null;
  readonly lastError: SanitizedError | null;
};

export type ShippingEntity = IdentityFields & {
  readonly state: ObservationState;
  readonly truncated: boolean;
  readonly operationalTask?: OperationalTask;
};

export type SourceObservation = IdentityFields & {
  readonly state: ObservationState;
  readonly truncated: boolean;
  readonly clockSkew: boolean;
  readonly recovered: boolean;
  readonly sequenceGap: boolean;
  readonly ingest:
    | 'accepted'
    | 'duplicate'
    | 'replay'
    | 'out-of-order'
    | 'gap'
    | 'gap-rejected'
    | 'backfill'
    | 'schema-mismatch'
    | 'reconnect';
  readonly measuredMeanings: {
    readonly merged: boolean | null;
    readonly queued: boolean | null;
    readonly ciGreen: boolean | null;
    readonly productionVerified: boolean | null;
    readonly exactLiveBuild: boolean | null;
  };
  readonly entities: readonly ShippingEntity[];
  readonly counts: {
    readonly running: CountMeasurement;
    readonly retrying: CountMeasurement;
    readonly blocked: CountMeasurement;
    /**
     * Terminal (dead-lettered) failures. Distinct from `blocked`: blocked work
     * is still live and may recover; terminal failures ended without success.
     * Never aliases another list — absent evidence stays `not-measured`.
     */
    readonly terminalFailures: CountMeasurement;
    readonly queued: CountMeasurement;
    readonly openPullRequests: CountMeasurement;
    readonly capacityAvailable: CountMeasurement;
  };
  readonly durations: {
    readonly queueWaitMs: DurationMeasurement;
    readonly runDurationMs: DurationMeasurement;
  };
  /** The delivery block this source owns, present only for a live read. */
  readonly delivery: DeliveryPatch | null;
};

/** Repositories whose merges since Pacific midnight the delivery card reports. */
export const DELIVERY_MERGE_REPOS = [
  'Jovie',
  'LogYourBody',
  'summer-config',
] as const;

export type DeliveryMergeRepo = (typeof DELIVERY_MERGE_REPOS)[number];

export type DeliveryLane = {
  readonly name: string;
  readonly running: number;
  readonly slots: number;
};

export type DeliveryLanes = {
  readonly running: CountMeasurement;
  readonly slots: CountMeasurement;
  readonly idle: CountMeasurement;
  readonly pool: CountMeasurement;
  readonly lastLandingAgeSeconds: CountMeasurement;
  readonly diskFreePct: number | null;
  readonly lanes: readonly DeliveryLane[];
  readonly alerts: readonly string[];
  readonly heldByReason: Readonly<Record<string, number>>;
  readonly failedByReason: Readonly<Record<string, number>>;
  readonly publishedAt: string | null;
  /** The feed's own `at` is older than the lanes semantic window. */
  readonly stale: boolean;
};

export type DeliveryMerges = {
  /** Pacific midnight, the start of "today" for every `today` count. */
  readonly since: string | null;
  readonly today: CountMeasurement;
  readonly byRepo: Readonly<Record<DeliveryMergeRepo, CountMeasurement>>;
  readonly last7Days: CountMeasurement;
  readonly prior7Days: CountMeasurement;
};

export type DeliveryProduction = {
  readonly sha: string | null;
  readonly version: string | null;
  readonly deployedAt: string | null;
  readonly behindMain: CountMeasurement;
};

export type DeliverySummer = {
  readonly availability: 'up' | 'down' | 'degraded' | null;
};

/**
 * Flat, per-metric delivery truth for the Ovie card and Mac door. Each block
 * is owned by exactly one source; a failed source leaves its block
 * not-measured without touching the others.
 */
export type DeliverySummary = {
  readonly lanes: DeliveryLanes;
  readonly merges: DeliveryMerges;
  readonly mergeQueueDepth: CountMeasurement;
  readonly inFlight: CountMeasurement;
  readonly production: DeliveryProduction;
  readonly summer: DeliverySummer;
};

export type DeliveryPatch = Partial<DeliverySummary>;

export type ShipMeanings = {
  readonly merged: BooleanMeasurement;
  readonly queued: BooleanMeasurement;
  readonly ciGreen: BooleanMeasurement;
  readonly productionVerified: BooleanMeasurement;
  readonly exactLiveBuild: BooleanMeasurement;
};

export type ShippingStateProjection = IdentityFields & {
  readonly schema: typeof SHIPPING_STATE_SCHEMA;
  readonly projectionId: string;
  readonly state: ObservationState;
  readonly publishing: boolean;
  readonly latencyMs: number;
  readonly withinM1Budget: boolean;
  readonly sources: Readonly<Record<ShippingSourceId, SourceObservation>>;
  readonly meanings: ShipMeanings;
  readonly timeToShipSeconds: DurationMeasurement;
  readonly retrying: CountMeasurement;
  readonly terminalFailures: CountMeasurement;
  readonly capacityAvailable: CountMeasurement;
  readonly delivery: DeliverySummary;
  /** Shared cache-backed task projection consumed by Ovie and terminal adapters. */
  readonly operationalTasks: OperationalTaskFeed;
};

export type ShippingClock = {
  readonly nowIso: () => string;
  readonly nowMs: () => number;
};

export const EMPTY_CORRELATION: ShippingCorrelation = {
  workId: null,
  leaseId: null,
  prNumber: null,
  ciRunId: null,
  deploymentId: null,
  buildId: null,
  sha: null,
};

export const NOT_MEASURED_COUNT: CountMeasurement = {
  state: 'not-measured',
  value: null,
};

export const NOT_MEASURED_BOOLEAN: BooleanMeasurement = {
  state: 'not-measured',
  value: null,
};

export const NOT_MEASURED_DURATION: DurationMeasurement = {
  state: 'not-measured',
  value: null,
};

export function measuredCount(value: number): CountMeasurement {
  if (!Number.isSafeInteger(value) || value < 0) return NOT_MEASURED_COUNT;
  if (value === 0) return { state: 'measured-zero', value: 0 };
  return { state: 'measured-nonzero', value };
}

export function measuredBoolean(value: boolean): BooleanMeasurement {
  return { state: 'measured', value };
}

export function measuredDuration(value: number): DurationMeasurement {
  if (value === 0) return { state: 'measured-zero', value: 0 };
  return { state: 'measured-nonzero', value };
}

export function isExactSha(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{40}$/.test(value);
}

export function emptyCounts(): SourceObservation['counts'] {
  return {
    running: NOT_MEASURED_COUNT,
    retrying: NOT_MEASURED_COUNT,
    blocked: NOT_MEASURED_COUNT,
    terminalFailures: NOT_MEASURED_COUNT,
    queued: NOT_MEASURED_COUNT,
    openPullRequests: NOT_MEASURED_COUNT,
    capacityAvailable: NOT_MEASURED_COUNT,
  };
}

export function emptyDurations(): SourceObservation['durations'] {
  return {
    queueWaitMs: NOT_MEASURED_DURATION,
    runDurationMs: NOT_MEASURED_DURATION,
  };
}

export function emptyDeliverySummary(): DeliverySummary {
  return {
    lanes: {
      running: NOT_MEASURED_COUNT,
      slots: NOT_MEASURED_COUNT,
      idle: NOT_MEASURED_COUNT,
      pool: NOT_MEASURED_COUNT,
      lastLandingAgeSeconds: NOT_MEASURED_COUNT,
      diskFreePct: null,
      lanes: [],
      alerts: [],
      heldByReason: {},
      failedByReason: {},
      publishedAt: null,
      stale: false,
    },
    merges: {
      since: null,
      today: NOT_MEASURED_COUNT,
      byRepo: {
        Jovie: NOT_MEASURED_COUNT,
        LogYourBody: NOT_MEASURED_COUNT,
        'summer-config': NOT_MEASURED_COUNT,
      },
      last7Days: NOT_MEASURED_COUNT,
      prior7Days: NOT_MEASURED_COUNT,
    },
    mergeQueueDepth: NOT_MEASURED_COUNT,
    inFlight: NOT_MEASURED_COUNT,
    production: {
      sha: null,
      version: null,
      deployedAt: null,
      behindMain: NOT_MEASURED_COUNT,
    },
    summer: { availability: null },
  };
}
