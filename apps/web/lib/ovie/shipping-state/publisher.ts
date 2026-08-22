import {
  M1_SOURCE_TO_PROJECTION_BUDGET_MS,
  SHIPPING_SOURCE_IDS,
  type ShippingClock,
  type ShippingSourceId,
  type ShippingStateProjection,
  type SourceObservation,
} from './contract';
import { type SourceCursor, sanitizedError, systemClock } from './envelope';
import { projectShippingState, unknownProjection } from './project';
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

export function resetShippingStatePublisher(): void {
  runtime = createState();
}

export function stopPublishingShippingState(): ShippingStateProjection | null {
  runtime.publishing = false;
  if (runtime.lastKnown == null) return null;
  const stopped = {
    ...runtime.lastKnown,
    publishing: false,
    state: 'stale' as const,
    lastError: sanitizedError(
      runtime.lastKnown.observationTimestamp,
      'publisher-stopped',
      'Publishing stopped; expired last-known marker retained'
    ),
  };
  runtime.lastKnown = stopped;
  return stopped;
}

export function startPublishingShippingState(): void {
  runtime.publishing = true;
}

export function getLastKnownShippingState(): ShippingStateProjection | null {
  return runtime.lastKnown;
}

export type PublishShippingStateInput = {
  readonly readers: NamedAuthorityReaders;
  readonly clock?: ShippingClock;
};

export async function publishShippingState(
  input: PublishShippingStateInput
): Promise<ShippingStateProjection> {
  const clock = input.clock ?? systemClock();
  const startedMs = clock.nowMs();
  const observationTimestamp = clock.nowIso();

  if (!runtime.publishing) {
    const latencyMs = Math.max(0, clock.nowMs() - startedMs);
    const stopped = stopPublishingShippingState();
    if (stopped) {
      return {
        ...stopped,
        latencyMs,
        withinM1Budget: latencyMs <= M1_SOURCE_TO_PROJECTION_BUDGET_MS,
      };
    }
    runtime.sequence += 1;
    const projection = unknownProjection({
      sequence: runtime.sequence,
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
    runtime.lastKnown = projection;
    return projection;
  }

  const reads = await Promise.all(
    SHIPPING_SOURCE_IDS.map(async sourceId => {
      try {
        return await input.readers[sourceId]();
      } catch (error) {
        return failedRead(
          sourceId,
          'error',
          error instanceof Error ? error.message : 'reader-threw',
          { errorCode: 'reader-threw' }
        );
      }
    })
  );

  const emissionTimestamp = clock.nowIso();
  runtime.sequence += 1;
  const sources = {} as Record<ShippingSourceId, SourceObservation>;
  for (const read of reads) {
    const current =
      runtime.cursors.get(read.sourceId) ??
      initialCursors().get(read.sourceId)!;
    const interpreted = interpretAuthorityRead(
      read,
      current,
      observationTimestamp,
      emissionTimestamp
    );
    runtime.cursors.set(read.sourceId, interpreted.cursor);
    const previous = runtime.lastKnown?.sources[read.sourceId];
    const keep =
      interpreted.observation.ingest === 'duplicate' ||
      interpreted.observation.ingest === 'replay' ||
      interpreted.observation.ingest === 'backfill';
    sources[read.sourceId] =
      keep && previous ? previous : interpreted.observation;
  }

  const latencyMs = Math.max(0, clock.nowMs() - startedMs);
  const projection = projectShippingState({
    sequence: runtime.sequence,
    observationTimestamp,
    emissionTimestamp,
    sources,
    publishing: true,
    latencyMs,
    nowIso: emissionTimestamp,
    lastKnown: runtime.lastKnown,
  });
  runtime.lastKnown = projection;
  return projection;
}

export function getShippingPublisherRuntime(): ShippingPublisherState {
  return runtime;
}
