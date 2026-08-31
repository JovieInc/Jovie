import {
  type CountMeasurement,
  EMPTY_CORRELATION,
  emptyCounts,
  emptyDurations,
  isExactSha,
  measuredCount,
  measuredDuration,
  NOT_MEASURED_COUNT,
  type ObservationState,
  SHIPPING_SOURCE_IDS,
  SHIPPING_SOURCE_SCHEMAS,
  SHIPPING_SOURCE_SEMANTIC_FRESHNESS_MS,
  type ShippingCorrelation,
  type ShippingEntity,
  type ShippingSourceId,
  type SourceObservation,
} from './contract';
import {
  emptyCursor,
  eventIdFor,
  type IngestAction,
  identityFields,
  ingestSourceEvent,
  parseTimestamp,
  type SourceCursor,
  sanitizedError,
  sanitizeOpaqueIdentifier,
} from './envelope';

export type AuthorityReadStatus =
  | 'ok'
  | 'disconnected'
  | 'unavailable'
  | 'unauthorized'
  | 'unknown'
  | 'error';

export type AuthorityRead = {
  readonly sourceId: ShippingSourceId;
  readonly status: AuthorityReadStatus;
  readonly schema: string | null;
  readonly payload: Readonly<Record<string, unknown>> | null;
  readonly truncated: boolean;
  readonly sourceTimestamp: string | null;
  readonly sourceRevision: string | null;
  readonly sequence: number | null;
  readonly eventId: string | null;
  readonly errorCode?: string;
  readonly errorMessage?: string;
  readonly correlation?: Partial<ShippingCorrelation>;
  readonly measuredMeanings?: {
    readonly merged?: boolean | null;
    readonly queued?: boolean | null;
    readonly ciGreen?: boolean | null;
    readonly productionVerified?: boolean | null;
    readonly exactLiveBuild?: boolean | null;
  };
};

export type AuthorityReader = () => Promise<AuthorityRead>;
export type NamedAuthorityReaders = Readonly<
  Record<ShippingSourceId, AuthorityReader>
>;

const NATIVE_QUEUE_ENTRY_STATES = new Set([
  'QUEUED',
  'AWAITING_CHECKS',
  'MERGEABLE',
  'UNMERGEABLE',
  'LOCKED',
]);

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asList(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : [];
}

function schemaMatches(
  sourceId: ShippingSourceId,
  schema: string | null
): boolean {
  if (schema == null) return false;
  if (schema === SHIPPING_SOURCE_SCHEMAS[sourceId]) return true;
  return (
    (sourceId === 'symphony-runtime' &&
      schema === 'symphony-runtime-state/v1') ||
    (sourceId === 'production-controller' && schema === 'github-actions-run/v1')
  );
}

function countFromList(value: unknown, present: boolean): CountMeasurement {
  return present && Array.isArray(value)
    ? measuredCount(value.length)
    : NOT_MEASURED_COUNT;
}

function countFromNumber(value: unknown): CountMeasurement {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? measuredCount(value)
    : NOT_MEASURED_COUNT;
}

export function failedRead(
  sourceId: ShippingSourceId,
  status: AuthorityReadStatus,
  message: string,
  extra: Partial<AuthorityRead> = {}
): AuthorityRead {
  return {
    sourceId,
    status,
    schema: null,
    payload: null,
    truncated: false,
    sourceTimestamp: null,
    sourceRevision: null,
    sequence: null,
    eventId: null,
    errorCode: status,
    errorMessage: message,
    ...extra,
  };
}

export function disconnectedRead(
  sourceId: ShippingSourceId,
  message = 'producer disconnected'
): AuthorityRead {
  return failedRead(sourceId, 'disconnected', message);
}

export function interpretCounts(
  sourceId: ShippingSourceId,
  payload: Readonly<Record<string, unknown>> | null,
  status: AuthorityReadStatus,
  truncated = false
): SourceObservation['counts'] {
  if (status !== 'ok' || payload == null) return emptyCounts();
  if (sourceId === 'symphony-runtime' || sourceId === 'symphony-task') {
    return {
      running: countFromList(payload.running, 'running' in payload),
      retrying: countFromList(payload.retrying, 'retrying' in payload),
      blocked: countFromList(payload.blocked, 'blocked' in payload),
      queued: NOT_MEASURED_COUNT,
      openPullRequests: NOT_MEASURED_COUNT,
      capacityAvailable: NOT_MEASURED_COUNT,
    };
  }
  if (sourceId === 'lease-guard-capacity') {
    const capacity = isRecord(payload.capacity) ? payload.capacity : payload;
    return {
      ...emptyCounts(),
      capacityAvailable: countFromNumber(capacity.available),
    };
  }
  if (sourceId === 'github-native-merge-queue') {
    const entries = payload.entries ?? payload.nodes;
    return {
      ...emptyCounts(),
      queued:
        truncated || payload.truncated === true
          ? NOT_MEASURED_COUNT
          : countFromList(entries, Array.isArray(entries)),
      openPullRequests: countFromNumber(payload.openPullRequests),
    };
  }
  return emptyCounts();
}

function elapsedMs(start: unknown, end: unknown) {
  const startMs = typeof start === 'string' ? Date.parse(start) : Number.NaN;
  const endMs = typeof end === 'string' ? Date.parse(end) : Number.NaN;
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) {
    return null;
  }
  return Math.round(endMs - startMs);
}

function interpretDurations(
  sourceId: ShippingSourceId,
  payload: Readonly<Record<string, unknown>> | null,
  status: AuthorityReadStatus
): SourceObservation['durations'] {
  if (status !== 'ok' || payload == null || sourceId !== 'exact-sha-ci') {
    return emptyDurations();
  }
  const startedAt = payload.run_started_at;
  const queueWaitMs = elapsedMs(payload.created_at, startedAt);
  const runDurationMs =
    payload.status === 'completed'
      ? elapsedMs(startedAt, payload.updated_at)
      : null;
  return {
    queueWaitMs:
      queueWaitMs == null
        ? emptyDurations().queueWaitMs
        : measuredDuration(queueWaitMs),
    runDurationMs:
      runDurationMs == null
        ? emptyDurations().runDurationMs
        : measuredDuration(runDurationMs),
  };
}

function taskEntities(
  payload: Readonly<Record<string, unknown>>,
  observationTimestamp: string,
  emissionTimestamp: string,
  sequence: number
): ShippingEntity[] {
  const groups: ReadonlyArray<{
    readonly key: 'running' | 'retrying' | 'blocked';
    readonly state: ObservationState;
  }> = [
    { key: 'running', state: 'fresh' },
    { key: 'retrying', state: 'degraded' },
    { key: 'blocked', state: 'error' },
  ];
  const entities: ShippingEntity[] = [];
  for (const group of groups) {
    for (const item of asList(payload[group.key])) {
      if (!isRecord(item)) continue;
      const issue = sanitizeOpaqueIdentifier(
        typeof item.issue_identifier === 'string'
          ? item.issue_identifier
          : typeof item.issue === 'string'
            ? item.issue
            : null
      );
      if (issue == null) continue;
      entities.push({
        ...identityFields({
          sourceId: 'symphony-task',
          entityId: `task:${issue}`,
          sequence,
          observationTimestamp,
          emissionTimestamp,
          sourceRevision:
            typeof item.head === 'string'
              ? item.head
              : typeof item.workspaceRevision === 'string'
                ? item.workspaceRevision
                : null,
          sourceTimestamp:
            parseTimestamp(item.due_at) ?? parseTimestamp(item.ts),
          correlation: {
            workId: issue,
            leaseId: issue,
            sha: isExactSha(item.head) ? item.head : null,
          },
          lastError:
            typeof item.error === 'string'
              ? sanitizedError(observationTimestamp, 'task-error', item.error)
              : null,
        }),
        state: group.state,
        truncated: false,
      });
    }
  }
  return entities;
}

function queueEntities(
  payload: Readonly<Record<string, unknown>>,
  observationTimestamp: string,
  emissionTimestamp: string,
  sequence: number
): ShippingEntity[] {
  return asList(payload.entries ?? payload.nodes).flatMap((entry, index) => {
    if (!isRecord(entry)) return [];
    const id = sanitizeOpaqueIdentifier(entry.id) ?? `entry:${index}`;
    const pr = isRecord(entry.pullRequest) ? entry.pullRequest : entry;
    const sha =
      typeof pr.headRefOid === 'string' && isExactSha(pr.headRefOid)
        ? pr.headRefOid
        : isExactSha(entry.headSha)
          ? entry.headSha
          : null;
    const state = typeof entry.state === 'string' ? entry.state : null;
    return [
      {
        ...identityFields({
          sourceId: 'github-native-merge-queue',
          entityId: `mergeQueueEntry:${id}`,
          sequence,
          observationTimestamp,
          emissionTimestamp,
          sourceRevision: sha,
          correlation: {
            prNumber: typeof pr.number === 'number' ? pr.number : null,
            sha,
          },
        }),
        state:
          state != null && NATIVE_QUEUE_ENTRY_STATES.has(state)
            ? 'fresh'
            : 'degraded',
        truncated: false,
      },
    ];
  });
}

export function interpretAuthorityRead(
  read: AuthorityRead,
  cursor: SourceCursor,
  observationTimestamp: string,
  emissionTimestamp: string
): { readonly observation: SourceObservation; readonly cursor: SourceCursor } {
  const schemaOk =
    read.status !== 'ok' || schemaMatches(read.sourceId, read.schema);
  const sequence =
    Number.isSafeInteger(read.sequence) && Number(read.sequence) >= 1
      ? Number(read.sequence)
      : cursor.lastSequence + 1;
  const revision = sanitizeOpaqueIdentifier(read.sourceRevision);
  const eventId =
    sanitizeOpaqueIdentifier(read.eventId) ??
    eventIdFor(read.sourceId, sequence, revision);
  const ingest = ingestSourceEvent(cursor, {
    eventId,
    sequence,
    sourceTimestamp: read.sourceTimestamp,
    observationTimestamp,
    schemaOk,
    reachable: read.status !== 'disconnected',
  });

  let state: ObservationState = read.status === 'ok' ? 'fresh' : read.status;
  if (read.status === 'ok' && !schemaOk) state = 'error';
  if (
    (read.truncated || ingest.sequenceGap || ingest.clockSkew) &&
    state === 'fresh'
  ) {
    state = 'degraded';
  }
  const semanticFreshnessMs =
    SHIPPING_SOURCE_SEMANTIC_FRESHNESS_MS[read.sourceId];
  const sourceMs = read.sourceTimestamp
    ? Date.parse(read.sourceTimestamp)
    : Number.NaN;
  const observationMs = Date.parse(observationTimestamp);
  if (
    state === 'fresh' &&
    semanticFreshnessMs != null &&
    Number.isFinite(sourceMs) &&
    Number.isFinite(observationMs) &&
    observationMs - sourceMs > semanticFreshnessMs
  ) {
    state = 'stale';
  }

  const rejectedGap = ingest.action === 'gap-rejected';
  const lastError =
    read.errorCode || read.status !== 'ok' || !schemaOk || rejectedGap
      ? sanitizedError(
          observationTimestamp,
          read.errorCode ??
            (rejectedGap
              ? 'sequence-gap-too-large'
              : schemaOk
                ? read.status
                : 'schema-mismatch'),
          read.errorMessage ??
            (rejectedGap
              ? 'Source sequence gap exceeded the accepted bound'
              : schemaOk
                ? read.status
                : 'producer schema mismatch')
        )
      : null;
  const lastSuccess =
    ingest.replaceCurrent && read.status === 'ok' && schemaOk
      ? { at: observationTimestamp, sequence, eventId }
      : cursor.lastSuccessSequence != null && cursor.lastAcceptedAt
        ? {
            at: cursor.lastAcceptedAt,
            sequence: cursor.lastSuccessSequence,
            eventId: cursor.lastEventId ?? eventId,
          }
        : null;
  const payload = ingest.replaceCurrent ? read.payload : null;
  const live = read.status === 'ok' && schemaOk && payload != null;
  const entities = live
    ? read.sourceId === 'github-native-merge-queue'
      ? queueEntities(
          payload,
          observationTimestamp,
          emissionTimestamp,
          sequence
        )
      : read.sourceId === 'symphony-runtime' ||
          read.sourceId === 'symphony-task'
        ? taskEntities(
            payload,
            observationTimestamp,
            emissionTimestamp,
            sequence
          )
        : []
    : [];

  return {
    observation: {
      ...identityFields({
        sourceId: read.sourceId,
        entityId: read.sourceId,
        sequence,
        observationTimestamp,
        emissionTimestamp,
        sourceRevision: revision,
        sourceTimestamp: read.sourceTimestamp,
        correlation: read.correlation ?? EMPTY_CORRELATION,
        lastSuccess,
        lastError,
        schema: read.schema ?? SHIPPING_SOURCE_SCHEMAS[read.sourceId],
      }),
      state,
      truncated: read.truncated,
      clockSkew: ingest.clockSkew,
      recovered: ingest.recovered,
      sequenceGap: ingest.sequenceGap,
      ingest: ingest.action as IngestAction,
      measuredMeanings: {
        merged: live ? (read.measuredMeanings?.merged ?? null) : null,
        queued: live ? (read.measuredMeanings?.queued ?? null) : null,
        ciGreen: live ? (read.measuredMeanings?.ciGreen ?? null) : null,
        productionVerified: live
          ? (read.measuredMeanings?.productionVerified ?? null)
          : null,
        exactLiveBuild: live
          ? (read.measuredMeanings?.exactLiveBuild ?? null)
          : null,
      },
      entities,
      counts: interpretCounts(
        read.sourceId,
        payload,
        live ? 'ok' : read.status,
        read.truncated
      ),
      durations: interpretDurations(
        read.sourceId,
        payload,
        live ? 'ok' : read.status
      ),
    },
    cursor: ingest.cursor,
  };
}

export function snapshotReaders(
  snapshots: Partial<Record<ShippingSourceId, AuthorityRead>>
): NamedAuthorityReaders {
  const readers = {} as Record<ShippingSourceId, AuthorityReader>;
  for (const sourceId of SHIPPING_SOURCE_IDS) {
    const snapshot = snapshots[sourceId];
    readers[sourceId] = async () =>
      snapshot ?? disconnectedRead(sourceId, 'not measured');
  }
  return readers;
}

export function initialCursors(): Map<ShippingSourceId, SourceCursor> {
  return new Map(SHIPPING_SOURCE_IDS.map(id => [id, emptyCursor()]));
}

export function mergeQueueIsMembership(
  isInMergeQueue: boolean,
  entry: {
    readonly id?: unknown;
    readonly state?: unknown;
    readonly position?: unknown;
  } | null
): boolean {
  return Boolean(
    isInMergeQueue &&
      entry &&
      typeof entry.id === 'string' &&
      typeof entry.state === 'string' &&
      NATIVE_QUEUE_ENTRY_STATES.has(entry.state) &&
      Number.isInteger(entry.position) &&
      Number(entry.position) >= 1
  );
}
