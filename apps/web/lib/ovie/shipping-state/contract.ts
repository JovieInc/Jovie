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

/** M1 source-to-projection budget. Measured latency is always reported. */
export const M1_SOURCE_TO_PROJECTION_BUDGET_MS = 10_000;

/** Freshness window for a successful observation. */
export const SHIPPING_STATE_FRESHNESS_MS = 10_000;

/** Source timestamps this far in the future of observation are clock skew. */
export const SHIPPING_STATE_CLOCK_SKEW_MS = 60_000;

export const SHIPPING_SOURCE_IDS = [
  'symphony-runtime',
  'symphony-task',
  'lease-guard-capacity',
  'github-native-merge-queue',
  'exact-sha-ci',
  'production-controller',
  'live-build-info',
  'fleet-receipt',
] as const;

export type ShippingSourceId = (typeof SHIPPING_SOURCE_IDS)[number];

export const SHIPPING_SOURCE_SCHEMAS = {
  'symphony-runtime': 'symphony-runtime-receipt/v1',
  'symphony-task': 'symphony-workspace-revision/v1',
  'lease-guard-capacity': 'symphony-lease-guard-report/v1',
  'github-native-merge-queue': 'github-merge-queue-entry/v1',
  'exact-sha-ci': 'github-actions-run/v1',
  'production-controller': 'jovie-controller-snapshot/v1',
  'live-build-info': 'jovie-build-info/v1',
  'fleet-receipt': 'jovie-fleet-gate/v1',
} as const satisfies Record<ShippingSourceId, string>;

export const SHIPPING_SOURCE_PRODUCERS = {
  'symphony-runtime': 'symphony-reconciler',
  'symphony-task': 'symphony-ui-pilot',
  'lease-guard-capacity': 'symphony-lease-guard',
  'github-native-merge-queue': 'github-native-merge-queue',
  'exact-sha-ci': 'github-actions-ci',
  'production-controller': 'production-controller',
  'live-build-info': 'live-build-info',
  'fleet-receipt': 'gem-priority-gate',
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

/** Distinct ship meanings — never collapsed into each other. */
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
    readonly queued: CountMeasurement;
    readonly capacityAvailable: CountMeasurement;
  };
};

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
    queued: NOT_MEASURED_COUNT,
    capacityAvailable: NOT_MEASURED_COUNT,
  };
}
