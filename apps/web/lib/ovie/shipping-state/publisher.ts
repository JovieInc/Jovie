import {
  M1_SOURCE_TO_PROJECTION_BUDGET_MS,
  SHIPPING_SOURCE_IDS,
  SHIPPING_SOURCE_READ_TIMEOUT_MS,
  type ShippingClock,
  type ShippingSourceId,
  type ShippingStateProjection,
  type SourceObservation,
} from './contract';
import {
  observationFreshness,
  type SourceCursor,
  sanitizedError,
  systemClock,
} from './envelope';
import {
  ageShippingStateProjection,
  projectShippingState,
  unknownProjection,
} from './project';
import {
  failedRead,
  initialCursors,
  interpretAuthorityRead,
  type NamedAuthorityReaders,
} from './sources';

export type ShippingPublisherState = {
  publishing: boolean;
  sequence: number;
  lastKnown: ShippingStateProjection | null;
  cursors: Map<ShippingSourceId, SourceCursor>;
};

function createState(): ShippingPublisherState {
  return {
    publishing: true,
    sequence: 0,
    lastKnown: null,
    cursors: initialCursors(),
  };
}

let runtime = createState();
let inFlightPublish: {
  readonly readers: NamedAuthorityReaders;
  readonly state: ShippingPublisherState;
  readonly promise: Promise<ShippingStateProjection>;
} | null = null;
let lastCompletedReaders: NamedAuthorityReaders | null = null;
let lastCompletedAtMs = Number.NEGATIVE_INFINITY;

export function resetShippingStatePublisher(): void {
  runtime = createState();
  inFlightPublish = null;
  lastCompletedReaders = null;
  lastCompletedAtMs = Number.NEGATIVE_INFINITY;
}

function stopPublisher(
  state: ShippingPublisherState
): ShippingStateProjection | null {
  state.publishing = false;
  if (state.lastKnown == null) return null;
  const stopped = {
    ...state.lastKnown,
    publishing: false,
    state: 'stale' as const,
    lastError: sanitizedError(
      state.lastKnown.observationTimestamp,
      'publisher-stopped',
      'Publishing stopped; expired last-known marker retained'
    ),
  };
  state.lastKnown = stopped;
  return stopped;
}

export function stopPublishingShippingState(): ShippingStateProjection | null {
  lastCompletedAtMs = Number.NEGATIVE_INFINITY;
  return stopPublisher(runtime);
}

export function startPublishingShippingState(): void {
  runtime.publishing = true;
  lastCompletedAtMs = Number.NEGATIVE_INFINITY;
}

export function getLastKnownShippingState(): ShippingStateProjection | null {
  return runtime.lastKnown;
}

export type PublishShippingStateInput = {
  readonly readers: NamedAuthorityReaders;
  readonly clock?: ShippingClock;
  readonly maxAgeMs?: number;
};

function stoppedProjection(
  state: ShippingPublisherState,
  clock: ShippingClock,
  startedMs: number,
  observationTimestamp: string
): ShippingStateProjection {
  const latencyMs = Math.max(0, clock.nowMs() - startedMs);
  const stopped = stopPublisher(state);
  if (stopped) {
    return {
      ...stopped,
      latencyMs,
      withinM1Budget: latencyMs <= M1_SOURCE_TO_PROJECTION_BUDGET_MS,
    };
  }
  state.sequence += 1;
  const projection = unknownProjection({
    sequence: state.sequence,
    observationTimestamp,
    emissionTimestamp: observationTimestamp,
    latencyMs,
    publishing: false,
    lastError: sanitizedError(
      observationTimestamp,
      'publisher-stopped',
      'Publishing stopped with no last-known marker'
    ),
  });
  state.lastKnown = projection;
  return projection;
}

async function publishShippingStateOnce(
  input: PublishShippingStateInput,
  state: ShippingPublisherState
): Promise<ShippingStateProjection> {
  const clock = input.clock ?? systemClock();
  const startedMs = clock.nowMs();
  const observationTimestamp = clock.nowIso();

  if (!state.publishing) {
    return stoppedProjection(state, clock, startedMs, observationTimestamp);
  }

  const reads = await Promise.all(
    SHIPPING_SOURCE_IDS.map(sourceId =>
      readAuthorityWithinDeadline(input.readers, sourceId)
    )
  );

  if (!state.publishing) {
    return stoppedProjection(state, clock, startedMs, observationTimestamp);
  }

  const emissionTimestamp = clock.nowIso();
  state.sequence += 1;
  const sources = {} as Record<ShippingSourceId, SourceObservation>;
  for (const read of reads) {
    const current =
      state.cursors.get(read.sourceId) ?? initialCursors().get(read.sourceId)!;
    const interpreted = interpretAuthorityRead(
      read,
      current,
      observationTimestamp,
      emissionTimestamp
    );
    state.cursors.set(read.sourceId, interpreted.cursor);
    const previous = state.lastKnown?.sources[read.sourceId];
    const refreshDuplicate =
      interpreted.observation.ingest === 'duplicate' && previous;
    const retainRejectedGap =
      interpreted.observation.ingest === 'gap-rejected' && previous;
    const keepHistorical =
      interpreted.observation.ingest === 'replay' ||
      interpreted.observation.ingest === 'backfill';
    const observation = refreshDuplicate
      ? {
          ...previous,
          observationTimestamp: interpreted.observation.observationTimestamp,
          emissionTimestamp: interpreted.observation.emissionTimestamp,
          freshnessDeadline: interpreted.observation.freshnessDeadline,
          state: interpreted.observation.state,
          lastError: interpreted.observation.lastError,
        }
      : retainRejectedGap
        ? {
            ...previous,
            observationTimestamp: interpreted.observation.observationTimestamp,
            emissionTimestamp: interpreted.observation.emissionTimestamp,
            freshnessDeadline: interpreted.observation.freshnessDeadline,
            state: 'degraded' as const,
            sequenceGap: true,
            ingest: 'gap-rejected' as const,
            lastError: interpreted.observation.lastError,
          }
        : keepHistorical && previous
          ? previous
          : interpreted.observation;
    sources[read.sourceId] = {
      ...observation,
      state: observationFreshness(
        observation.sourceTimestamp ?? observation.observationTimestamp,
        observation.freshnessDeadline,
        emissionTimestamp,
        observation.state
      ),
    };
  }

  const latencyMs = Math.max(0, clock.nowMs() - startedMs);
  const projection = projectShippingState({
    sequence: state.sequence,
    observationTimestamp,
    emissionTimestamp,
    sources,
    publishing: true,
    latencyMs,
    nowIso: emissionTimestamp,
    lastKnown: state.lastKnown,
  });
  state.lastKnown = projection;
  return projection;
}

async function readAuthorityWithinDeadline(
  readers: NamedAuthorityReaders,
  sourceId: ShippingSourceId
) {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  const timedOut = new Promise<ReturnType<typeof failedRead>>(resolve => {
    timeout = setTimeout(
      () =>
        resolve(
          failedRead(sourceId, 'unavailable', 'Authority read timed out', {
            errorCode: 'reader-timeout',
          })
        ),
      SHIPPING_SOURCE_READ_TIMEOUT_MS
    );
  });
  try {
    return await Promise.race([
      readers[sourceId]().catch(error =>
        failedRead(
          sourceId,
          'error',
          error instanceof Error ? error.message : 'reader-threw',
          { errorCode: 'reader-threw' }
        )
      ),
      timedOut,
    ]);
  } finally {
    if (timeout != null) clearTimeout(timeout);
  }
}

export function publishShippingState(
  input: PublishShippingStateInput
): Promise<ShippingStateProjection> {
  const state = runtime;
  const clock = input.clock ?? systemClock();
  const maxAgeMs = Math.max(0, input.maxAgeMs ?? 0);
  const cacheAgeMs = clock.nowMs() - lastCompletedAtMs;

  if (
    state.publishing &&
    state.lastKnown?.publishing === true &&
    input.readers === lastCompletedReaders &&
    maxAgeMs > 0 &&
    cacheAgeMs >= 0 &&
    cacheAgeMs <= maxAgeMs
  ) {
    const aged = ageShippingStateProjection(state.lastKnown, clock.nowIso());
    state.lastKnown = aged;
    return Promise.resolve(aged);
  }

  if (
    inFlightPublish?.state === state &&
    inFlightPublish.readers === input.readers
  ) {
    return inFlightPublish.promise;
  }

  if (inFlightPublish?.state === state) {
    return inFlightPublish.promise.then(
      () => publishShippingState(input),
      () => publishShippingState(input)
    );
  }

  const publication = Promise.resolve().then(() =>
    publishShippingStateOnce({ ...input, clock }, state)
  );
  inFlightPublish = { readers: input.readers, state, promise: publication };
  void publication.then(
    projection => {
      if (state === runtime && projection.publishing) {
        lastCompletedReaders = input.readers;
        lastCompletedAtMs = clock.nowMs();
      }
      if (inFlightPublish?.promise === publication) inFlightPublish = null;
    },
    () => {
      if (inFlightPublish?.promise === publication) inFlightPublish = null;
    }
  );
  return publication;
}

export function getShippingPublisherRuntime(): ShippingPublisherState {
  return runtime;
}
