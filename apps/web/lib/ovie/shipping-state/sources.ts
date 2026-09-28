import {
  type CountMeasurement,
  type DeliveryPatch,
  EMPTY_CORRELATION,
  emptyCounts,
  emptyDurations,
  isExactSha,
  measuredCount,
  measuredDuration,
  NOT_MEASURED_COUNT,
  type ObservationState,
  type OperationalTask,
  type OperationalTaskWorkflowState,
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
  /** The delivery block this source owns, when the read measured it. */
  readonly delivery?: DeliveryPatch;
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
    sourceId === 'production-controller' && schema === 'github-actions-run/v1'
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
  if (sourceId === 'lanes-status') {
    return {
      ...emptyCounts(),
      running: countFromNumber(payload.running),
      capacityAvailable: countFromNumber(payload.idle),
    };
  }
  if (sourceId === 'lane-pull-requests') {
    const pullRequests = asList(payload.pullRequests).filter(isRecord);
    const measured = Array.isArray(payload.pullRequests) && !truncated;
    return {
      ...emptyCounts(),
      running: measured
        ? measuredCount(pullRequests.length)
        : NOT_MEASURED_COUNT,
      blocked: measured
        ? measuredCount(
            pullRequests.filter(
              pr => lanePullRequestWorkflowState(pr) === 'blocked'
            ).length
          )
        : NOT_MEASURED_COUNT,
      openPullRequests: measured
        ? measuredCount(pullRequests.length)
        : NOT_MEASURED_COUNT,
    };
  }
  if (sourceId === 'github-native-merge-queue') {
    const entries = payload.entries ?? payload.nodes;
    return {
      ...emptyCounts(),
      queued:
        typeof payload.totalCount === 'number'
          ? countFromNumber(payload.totalCount)
          : truncated || payload.truncated === true
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

const LANE_ISSUE_RE = /^(?:devin|codex)\/(jov-\d+)(?:-|$)/i;

/** Linear issue a lane branch (`devin/jov-123-<stamp>`) is working. */
export function laneIssueIdentifier(headRefName: unknown): string | null {
  if (typeof headRefName !== 'string') return null;
  const match = LANE_ISSUE_RE.exec(headRefName);
  return match?.[1] ? match[1].toUpperCase() : null;
}

export function lanePullRequestWorkflowState(
  pr: Readonly<Record<string, unknown>>
): OperationalTaskWorkflowState {
  if (Number.isInteger(pr.mergeQueuePosition)) return 'merge-queued';
  if (
    pr.mergeable === 'CONFLICTING' ||
    pr.reviewDecision === 'CHANGES_REQUESTED'
  ) {
    return 'blocked';
  }
  if (pr.isDraft === true) return 'running';
  return 'in-review';
}

const WORKFLOW_OBSERVATION: Record<
  OperationalTaskWorkflowState,
  ObservationState
> = {
  queued: 'fresh',
  running: 'fresh',
  retrying: 'degraded',
  blocked: 'error',
  'in-review': 'fresh',
  'merge-queued': 'fresh',
  merged: 'fresh',
  'production-verified': 'fresh',
};

const LANE_TASK_ORDER: Record<OperationalTaskWorkflowState, number> = {
  'merge-queued': 0,
  blocked: 1,
  'in-review': 2,
  running: 3,
  retrying: 4,
  queued: 5,
  merged: 6,
  'production-verified': 7,
};

function safeDisplayText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.replace(/\s+/g, ' ').trim().slice(0, 180);
  return normalized.length > 0 ? normalized : null;
}

function lanePullRequestEntities(
  payload: Readonly<Record<string, unknown>>,
  observationTimestamp: string,
  emissionTimestamp: string,
  sequence: number
): ShippingEntity[] {
  const byIssue = new Map<string, ShippingEntity>();
  for (const pr of asList(payload.pullRequests)) {
    if (!isRecord(pr)) continue;
    const issue = laneIssueIdentifier(pr.headRefName);
    const prNumber = Number.isSafeInteger(pr.number) ? Number(pr.number) : 0;
    if (issue == null || prNumber < 1) continue;
    const updatedAt = parseTimestamp(pr.updatedAt);
    const prior = byIssue.get(issue);
    if (
      prior?.operationalTask?.updatedAt &&
      updatedAt &&
      Date.parse(prior.operationalTask.updatedAt) >= Date.parse(updatedAt)
    ) {
      continue;
    }
    const sha = isExactSha(pr.headRefOid) ? pr.headRefOid : null;
    const workflowState = lanePullRequestWorkflowState(pr);
    byIssue.set(issue, {
      ...identityFields({
        sourceId: 'lane-pull-requests',
        entityId: `linear:${issue}`,
        sequence,
        observationTimestamp,
        emissionTimestamp,
        sourceRevision: sha,
        sourceTimestamp: updatedAt,
        correlation: { workId: issue, prNumber, sha },
      }),
      state: WORKFLOW_OBSERVATION[workflowState],
      truncated: false,
      operationalTask: {
        id: `linear:${issue}`,
        linearIdentifier: issue,
        linearUrl: `https://linear.app/jovie/issue/${issue.toLowerCase()}`,
        title: safeDisplayText(pr.title) ?? issue,
        workflowState,
        priority: 'none',
        attempt: null,
        retryAt: null,
        sourceRevision: sha,
        updatedAt,
      } satisfies OperationalTask,
    });
  }
  // Closest to landing first, then most recently touched.
  return [...byIssue.values()].sort((a, b) => {
    const rank =
      LANE_TASK_ORDER[a.operationalTask?.workflowState ?? 'running'] -
      LANE_TASK_ORDER[b.operationalTask?.workflowState ?? 'running'];
    if (rank !== 0) return rank;
    return (
      Date.parse(b.operationalTask?.updatedAt ?? '') -
        Date.parse(a.operationalTask?.updatedAt ?? '') || 0
    );
  });
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
      : read.sourceId === 'lane-pull-requests'
        ? lanePullRequestEntities(
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
      delivery: live ? (read.delivery ?? null) : null,
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
