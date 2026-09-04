import {
  emptyCounts,
  emptyDurations,
  isExactSha,
  M1_SOURCE_TO_PROJECTION_BUDGET_MS,
  measuredBoolean,
  measuredDuration,
  NOT_MEASURED_BOOLEAN,
  NOT_MEASURED_COUNT,
  NOT_MEASURED_DURATION,
  type ObservationState,
  type OperationalTask,
  type OperationalTaskDelta,
  type OperationalTaskFeed,
  SHIPPING_SOURCE_IDS,
  SHIPPING_STATE_PRODUCER_ID,
  SHIPPING_STATE_PRODUCER_VERSION,
  SHIPPING_STATE_SCHEMA,
  type ShipMeanings,
  type ShippingCorrelation,
  type ShippingSourceId,
  type ShippingStateProjection,
  type SourceObservation,
} from './contract';
import {
  cursorFor,
  freshnessDeadline,
  identityFields,
  mergeCorrelation,
  observationFreshness,
  projectionIdFor,
} from './envelope';

const SUCCESS_STATES = new Set<ObservationState>([
  'fresh',
  'stale',
  'degraded',
  'partial',
  'measured-zero',
  'measured-nonzero',
]);

export function combineSourceStates(
  states: readonly ObservationState[]
): ObservationState {
  const unique = new Set(states);
  if (unique.size === 1) return states[0] ?? 'unknown';
  if (states.every(state => SUCCESS_STATES.has(state))) {
    if (unique.has('stale')) return 'stale';
    if (unique.has('degraded') || unique.has('partial')) return 'degraded';
    return 'fresh';
  }
  if (states.some(state => SUCCESS_STATES.has(state))) return 'partial';
  if (
    states.every(state => state === 'unavailable' || state === 'disconnected')
  ) {
    return 'unavailable';
  }
  if (unique.has('error')) return 'error';
  if (unique.has('unauthorized')) return 'unauthorized';
  if (unique.has('unknown')) return 'unknown';
  return 'unavailable';
}

function mergeAllCorrelation(
  sources: Readonly<Record<ShippingSourceId, SourceObservation>>
): ShippingCorrelation {
  let acc: ShippingCorrelation = {
    workId: null,
    leaseId: null,
    prNumber: null,
    ciRunId: null,
    deploymentId: null,
    buildId: null,
    sha: null,
  };
  for (const sourceId of SHIPPING_SOURCE_IDS) {
    acc = mergeCorrelation(acc, sources[sourceId].correlation);
  }
  return acc;
}

function measuredOrNull(
  source: SourceObservation,
  key: keyof SourceObservation['measuredMeanings']
): boolean | null {
  return SUCCESS_STATES.has(source.state) ? source.measuredMeanings[key] : null;
}

function meaningFromHint(
  source: SourceObservation,
  key: keyof SourceObservation['measuredMeanings'],
  falseCode: string,
  fallback: () => boolean | null
): boolean | null {
  const hinted = measuredOrNull(source, key);
  if (hinted != null) return hinted;
  if (!SUCCESS_STATES.has(source.state)) return null;
  if (source.lastError?.code === falseCode) return false;
  return fallback();
}

export function projectMeanings(
  sources: Readonly<Record<ShippingSourceId, SourceObservation>>
): ShipMeanings {
  const queue = sources['github-native-merge-queue'];
  const ci = sources['exact-sha-ci'];
  const controller = sources['production-controller'];
  const build = sources['live-build-info'];
  const queuedCount = queue.counts.queued;
  const liveSha = build.correlation.sha;
  const deployedSha = controller.correlation.sha;
  const exact =
    isExactSha(liveSha) && isExactSha(deployedSha)
      ? liveSha === deployedSha
      : null;
  const queuedHint = measuredOrNull(queue, 'queued');
  const queued =
    queuedHint != null
      ? queuedHint
      : queuedCount.state === 'not-measured'
        ? null
        : queuedCount.value != null && queuedCount.value > 0
          ? true
          : queuedCount.state === 'measured-zero'
            ? false
            : null;
  const wrap = (value: boolean | null) =>
    value == null ? NOT_MEASURED_BOOLEAN : measuredBoolean(value);
  return {
    merged: wrap(
      meaningFromHint(
        sources['fleet-receipt'],
        'merged',
        'not-merged',
        () => null
      )
    ),
    queued: wrap(queued),
    ciGreen: wrap(
      meaningFromHint(ci, 'ciGreen', 'ci-not-green', () =>
        ci.correlation.ciRunId == null ? null : ci.lastError == null
      )
    ),
    productionVerified: wrap(
      meaningFromHint(controller, 'productionVerified', 'not-verified', () =>
        controller.correlation.deploymentId == null ? null : true
      )
    ),
    exactLiveBuild: wrap(exact),
  };
}

function pickCount(
  sources: Readonly<Record<ShippingSourceId, SourceObservation>>,
  key: keyof SourceObservation['counts']
) {
  for (const sourceId of SHIPPING_SOURCE_IDS) {
    const count = sources[sourceId].counts[key];
    if (count.state !== 'not-measured') return count;
  }
  return NOT_MEASURED_COUNT;
}

function timeToShip(
  sources: Readonly<Record<ShippingSourceId, SourceObservation>>
) {
  const start =
    sources['github-native-merge-queue'].sourceTimestamp ??
    sources['fleet-receipt'].sourceTimestamp;
  const end =
    sources['live-build-info'].sourceTimestamp ??
    sources['production-controller'].sourceTimestamp;
  if (start == null || end == null) return NOT_MEASURED_DURATION;
  const startMs = Date.parse(start);
  const endMs = Date.parse(end);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) {
    return NOT_MEASURED_DURATION;
  }
  return measuredDuration(Math.round((endMs - startMs) / 1000));
}

function revisionFingerprint(
  sources: Readonly<Record<ShippingSourceId, SourceObservation>>
): string {
  return SHIPPING_SOURCE_IDS.map(
    sourceId => sources[sourceId].sourceRevision ?? sources[sourceId].state
  ).join('|');
}

function operationalTaskSource(
  sources: Readonly<Record<ShippingSourceId, SourceObservation>>,
  lastKnown?: ShippingStateProjection | null
) {
  if (SUCCESS_STATES.has(sources['symphony-runtime'].state)) {
    return 'symphony-runtime' as const;
  }
  if (lastKnown?.operationalTasks.sourceId) {
    return lastKnown.operationalTasks.sourceId;
  }
  const taskReceipt = sources['symphony-task'];
  if (
    SUCCESS_STATES.has(taskReceipt.state) &&
    taskReceipt.entities.some(entity => entity.operationalTask)
  ) {
    return 'symphony-task' as const;
  }
  return 'symphony-runtime' as const;
}

function taskDeltas(
  previous: readonly OperationalTask[],
  current: readonly OperationalTask[],
  sequence: number
): OperationalTaskDelta[] {
  const before = new Map(previous.map(task => [task.id, task]));
  const after = new Map(current.map(task => [task.id, task]));
  const deltas: OperationalTaskDelta[] = [];
  for (const task of current) {
    const prior = before.get(task.id);
    if (!prior) {
      deltas.push({
        taskId: task.id,
        kind: 'added',
        fromState: null,
        toState: task.workflowState,
        sequence,
      });
    } else if (
      prior.workflowState !== task.workflowState ||
      prior.title !== task.title ||
      prior.priority !== task.priority ||
      prior.attempt !== task.attempt ||
      prior.retryAt !== task.retryAt ||
      prior.sourceRevision !== task.sourceRevision
    ) {
      deltas.push({
        taskId: task.id,
        kind: 'updated',
        fromState: prior.workflowState,
        toState: task.workflowState,
        sequence,
      });
    }
  }
  for (const task of previous) {
    if (!after.has(task.id)) {
      deltas.push({
        taskId: task.id,
        kind: 'removed',
        fromState: task.workflowState,
        toState: null,
        sequence,
      });
    }
  }
  return deltas;
}

function projectOperationalTasks(input: {
  readonly sources: Readonly<Record<ShippingSourceId, SourceObservation>>;
  readonly sequence: number;
  readonly publishing: boolean;
  readonly lastKnown?: ShippingStateProjection | null;
}): OperationalTaskFeed {
  const sourceId = operationalTaskSource(input.sources, input.lastKnown);
  const source = input.sources[sourceId];
  const currentTasks = source.entities.flatMap(entity =>
    entity.operationalTask ? [entity.operationalTask] : []
  );
  const last = input.lastKnown?.operationalTasks;
  const currentUsable = SUCCESS_STATES.has(source.state);
  const tasks = currentUsable ? currentTasks : (last?.tasks ?? []);
  const syncState: OperationalTaskFeed['syncState'] = !input.publishing
    ? last
      ? 'stale'
      : 'failed'
    : source.state === 'fresh'
      ? 'fresh'
      : currentUsable || last
        ? 'stale'
        : source.state === 'unknown'
          ? 'syncing'
          : 'failed';
  return {
    canonicalSource: 'linear',
    cacheMode: 'local-reconciled',
    syncState,
    sourceId,
    observedAt: source.observationTimestamp,
    lastSyncedAt: currentUsable
      ? (source.lastSuccess?.at ?? source.observationTimestamp)
      : (last?.lastSyncedAt ?? null),
    freshnessDeadline: source.freshnessDeadline,
    tasks,
    deltas:
      currentUsable && last
        ? taskDeltas(last.tasks, currentTasks, input.sequence)
        : [],
  };
}

export function projectShippingState(input: {
  readonly sequence: number;
  readonly observationTimestamp: string;
  readonly emissionTimestamp: string;
  readonly sources: Readonly<Record<ShippingSourceId, SourceObservation>>;
  readonly publishing: boolean;
  readonly latencyMs: number;
  readonly nowIso: string;
  readonly lastKnown?: ShippingStateProjection | null;
}): ShippingStateProjection {
  const combined = combineSourceStates(
    SHIPPING_SOURCE_IDS.map(sourceId => input.sources[sourceId].state)
  );
  const deadline = freshnessDeadline(input.observationTimestamp);
  const state = input.publishing
    ? observationFreshness(
        input.observationTimestamp,
        deadline,
        input.nowIso,
        combined
      )
    : input.lastKnown
      ? 'stale'
      : 'unavailable';
  const successful = SHIPPING_SOURCE_IDS.some(sourceId =>
    SUCCESS_STATES.has(input.sources[sourceId].state)
  );
  const revision = revisionFingerprint(input.sources);
  const eventId = projectionIdFor(input.sequence, revision);
  return {
    producerId: SHIPPING_STATE_PRODUCER_ID,
    producerVersion: SHIPPING_STATE_PRODUCER_VERSION,
    sourceId: 'fleet-receipt',
    entityId: 'ovie.shipping-state',
    schema: SHIPPING_STATE_SCHEMA,
    eventId,
    projectionId: eventId,
    sequence: input.sequence,
    cursor: cursorFor(input.sequence),
    sourceRevision: revision,
    sourceTimestamp: null,
    observationTimestamp: input.observationTimestamp,
    emissionTimestamp: input.emissionTimestamp,
    freshnessDeadline: deadline,
    correlation: mergeAllCorrelation(input.sources),
    lastSuccess: successful
      ? { at: input.observationTimestamp, sequence: input.sequence, eventId }
      : (input.lastKnown?.lastSuccess ?? null),
    lastError:
      SHIPPING_SOURCE_IDS.map(id => input.sources[id].lastError).find(
        error => error != null
      ) ??
      (input.publishing
        ? null
        : {
            at: input.observationTimestamp,
            code: 'publisher-stopped',
            message: 'Publishing stopped; last-known marker retained',
          }),
    state,
    publishing: input.publishing,
    latencyMs: input.latencyMs,
    withinM1Budget: input.latencyMs <= M1_SOURCE_TO_PROJECTION_BUDGET_MS,
    sources: input.sources,
    meanings: projectMeanings(input.sources),
    timeToShipSeconds: timeToShip(input.sources),
    retrying: pickCount(input.sources, 'retrying'),
    terminalFailures: pickCount(input.sources, 'blocked'),
    capacityAvailable: pickCount(input.sources, 'capacityAvailable'),
    operationalTasks: projectOperationalTasks(input),
  };
}

export function ageShippingStateProjection(
  projection: ShippingStateProjection,
  nowIso: string
): ShippingStateProjection {
  const sources = {} as Record<ShippingSourceId, SourceObservation>;
  for (const sourceId of SHIPPING_SOURCE_IDS) {
    const source = projection.sources[sourceId];
    sources[sourceId] = {
      ...source,
      state: observationFreshness(
        source.sourceTimestamp ?? source.observationTimestamp,
        source.freshnessDeadline,
        nowIso,
        source.state
      ),
    };
  }
  const aggregateState = combineSourceStates(
    SHIPPING_SOURCE_IDS.map(sourceId => sources[sourceId].state)
  );
  return {
    ...projection,
    sources,
    state: projection.publishing
      ? observationFreshness(
          projection.observationTimestamp,
          projection.freshnessDeadline,
          nowIso,
          aggregateState
        )
      : projection.state,
    operationalTasks: {
      ...projection.operationalTasks,
      syncState:
        sources[projection.operationalTasks.sourceId].state === 'fresh'
          ? projection.operationalTasks.syncState
          : 'stale',
    },
  };
}

export function retainLastKnownOnFailure(
  lastKnown: ShippingStateProjection | null,
  _nowIso: string,
  lastError: ShippingStateProjection['lastError'],
  publishing: boolean
): ShippingStateProjection | null {
  if (lastKnown == null) return null;
  return {
    ...lastKnown,
    state: 'stale',
    publishing,
    lastError: lastError ?? lastKnown.lastError,
    operationalTasks: {
      ...lastKnown.operationalTasks,
      syncState: 'stale',
      deltas: [],
    },
  };
}

function emptyObservation(
  sourceId: ShippingSourceId,
  observationTimestamp: string,
  emissionTimestamp: string,
  lastError: ShippingStateProjection['lastError']
): SourceObservation {
  return {
    ...identityFields({
      sourceId,
      entityId: sourceId,
      sequence: 0,
      observationTimestamp,
      emissionTimestamp,
      lastError,
      schema: SHIPPING_STATE_SCHEMA,
      producerId: sourceId,
    }),
    state: 'unknown',
    truncated: false,
    clockSkew: false,
    recovered: false,
    sequenceGap: false,
    ingest: 'accepted',
    measuredMeanings: {
      merged: null,
      queued: null,
      ciGreen: null,
      productionVerified: null,
      exactLiveBuild: null,
    },
    entities: [],
    counts: emptyCounts(),
    durations: emptyDurations(),
  };
}

export function unknownProjection(input: {
  readonly sequence: number;
  readonly observationTimestamp: string;
  readonly emissionTimestamp: string;
  readonly latencyMs: number;
  readonly publishing: boolean;
  readonly lastError: ShippingStateProjection['lastError'];
  readonly lastKnown?: ShippingStateProjection | null;
}): ShippingStateProjection {
  const retained = retainLastKnownOnFailure(
    input.lastKnown ?? null,
    input.observationTimestamp,
    input.lastError,
    input.publishing
  );
  if (retained) {
    const eventId = projectionIdFor(
      input.sequence,
      retained.sourceRevision ?? 'unknown'
    );
    return {
      ...retained,
      sequence: input.sequence,
      cursor: cursorFor(input.sequence),
      eventId,
      projectionId: eventId,
      publishing: input.publishing,
      lastError: input.lastError ?? retained.lastError,
      state: 'stale',
      latencyMs: input.latencyMs,
      withinM1Budget: input.latencyMs <= M1_SOURCE_TO_PROJECTION_BUDGET_MS,
    };
  }

  const emptySources = {} as Record<ShippingSourceId, SourceObservation>;
  for (const sourceId of SHIPPING_SOURCE_IDS) {
    emptySources[sourceId] = emptyObservation(
      sourceId,
      input.observationTimestamp,
      input.emissionTimestamp,
      input.lastError
    );
  }
  const eventId = projectionIdFor(input.sequence, 'unknown');
  return {
    producerId: SHIPPING_STATE_PRODUCER_ID,
    producerVersion: SHIPPING_STATE_PRODUCER_VERSION,
    sourceId: 'fleet-receipt',
    entityId: 'ovie.shipping-state',
    schema: SHIPPING_STATE_SCHEMA,
    eventId,
    projectionId: eventId,
    sequence: input.sequence,
    cursor: cursorFor(input.sequence),
    sourceRevision: null,
    sourceTimestamp: null,
    observationTimestamp: input.observationTimestamp,
    emissionTimestamp: input.emissionTimestamp,
    freshnessDeadline: freshnessDeadline(input.observationTimestamp),
    correlation: {
      workId: null,
      leaseId: null,
      prNumber: null,
      ciRunId: null,
      deploymentId: null,
      buildId: null,
      sha: null,
    },
    lastSuccess: null,
    lastError: input.lastError,
    state: 'unknown',
    publishing: input.publishing,
    latencyMs: input.latencyMs,
    withinM1Budget: input.latencyMs <= M1_SOURCE_TO_PROJECTION_BUDGET_MS,
    sources: emptySources,
    meanings: {
      merged: NOT_MEASURED_BOOLEAN,
      queued: NOT_MEASURED_BOOLEAN,
      ciGreen: NOT_MEASURED_BOOLEAN,
      productionVerified: NOT_MEASURED_BOOLEAN,
      exactLiveBuild: NOT_MEASURED_BOOLEAN,
    },
    timeToShipSeconds: NOT_MEASURED_DURATION,
    retrying: NOT_MEASURED_COUNT,
    terminalFailures: NOT_MEASURED_COUNT,
    capacityAvailable: NOT_MEASURED_COUNT,
    operationalTasks: {
      canonicalSource: 'linear',
      cacheMode: 'local-reconciled',
      syncState: input.publishing ? 'syncing' : 'failed',
      sourceId: 'symphony-runtime',
      observedAt: null,
      lastSyncedAt: null,
      freshnessDeadline: null,
      tasks: [],
      deltas: [],
    },
  };
}
