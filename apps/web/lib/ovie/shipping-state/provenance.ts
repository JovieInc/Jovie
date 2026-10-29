import type {
  DeliverySummary,
  ShippingSourceId,
  ShippingStateProjection,
} from './contract';

/**
 * Why a Delivery measurement reads the way it does. A null `CountMeasurement`
 * carries no reason, so the UI reads this instead of rendering a bare "n/a":
 * "Unknown . <sourceId> . <lastObservedAgeSeconds>" (or "Syncing" while
 * `status` is `syncing`).
 */
export type DeliveryEvidenceStatus =
  | 'measured'
  | 'stale'
  | 'syncing'
  | 'unavailable'
  | 'unauthorized'
  | 'not-configured'
  | 'rate-limited'
  | 'timeout'
  | 'malformed';

export type DeliveryEvidence = {
  readonly sourceId: ShippingSourceId;
  readonly status: DeliveryEvidenceStatus;
  /** Sanitized producer error code, when the last read failed. */
  readonly code: string | null;
  /** Seconds since the source last produced a usable read; null if never. */
  readonly lastObservedAgeSeconds: number | null;
};

export type DeliveryEvidenceKey = keyof DeliverySummary;

/** Primary authority for each delivery block. */
export const DELIVERY_EVIDENCE_SOURCES = {
  lanes: 'lanes-status',
  merges: 'github-merges',
  mergeQueueDepth: 'github-native-merge-queue',
  inFlight: 'lane-pull-requests',
  certifiedHead: 'exact-sha-ci',
  production: 'production-controller',
  staging: 'staging-build-info',
  summer: 'summer-runtime',
} as const satisfies Record<DeliveryEvidenceKey, ShippingSourceId>;

const USABLE_STATES = new Set<string>([
  'fresh',
  'stale',
  'degraded',
  'partial',
  'measured-zero',
  'measured-nonzero',
]);

const FAILURE_CODES: Readonly<Record<string, DeliveryEvidenceStatus>> = {
  'not-configured': 'not-configured',
  'rate-limited': 'rate-limited',
  'reader-timeout': 'timeout',
  malformed: 'malformed',
};

function ageSeconds(fromIso: string | null | undefined, nowMs: number) {
  const fromMs = fromIso ? Date.parse(fromIso) : Number.NaN;
  return Number.isFinite(fromMs)
    ? Math.max(0, Math.round((nowMs - fromMs) / 1000))
    : null;
}

/** Evidence for every delivery block, derived from the source observations. */
export function deliveryEvidence(
  projection: Pick<ShippingStateProjection, 'sources'>,
  nowIso: string
): Readonly<Record<DeliveryEvidenceKey, DeliveryEvidence>> {
  const nowMs = Date.parse(nowIso);
  const entries = (
    Object.keys(DELIVERY_EVIDENCE_SOURCES) as DeliveryEvidenceKey[]
  ).map(key => {
    const sourceId = DELIVERY_EVIDENCE_SOURCES[key];
    const source = projection.sources[sourceId];
    const code = source.lastError?.code ?? null;
    let status: DeliveryEvidenceStatus;
    if (USABLE_STATES.has(source.state)) {
      status = source.state === 'stale' ? 'stale' : 'measured';
    } else if (source.state === 'unknown' && code == null) {
      status = 'syncing';
    } else if (source.state === 'unauthorized') {
      status = 'unauthorized';
    } else {
      status = (code != null && FAILURE_CODES[code]) || 'unavailable';
    }
    const evidence: DeliveryEvidence = {
      sourceId,
      status,
      code,
      lastObservedAgeSeconds: ageSeconds(
        source.lastSuccess?.at ?? source.sourceTimestamp,
        nowMs
      ),
    };
    return [key, evidence] as const;
  });
  return Object.fromEntries(entries) as Record<
    DeliveryEvidenceKey,
    DeliveryEvidence
  >;
}
