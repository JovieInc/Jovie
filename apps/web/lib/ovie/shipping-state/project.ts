import {
  emptyCounts,
  isExactSha,
  M1_SOURCE_TO_PROJECTION_BUDGET_MS,
  measuredBoolean,
  measuredDuration,
  NOT_MEASURED_BOOLEAN,
  NOT_MEASURED_COUNT,
  NOT_MEASURED_DURATION,
  type ObservationState,
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
  mergeCorrelation,
  projectionIdFor,
} from './envelope';
import { observationFreshness } from './ingest';

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
  if (unique.has('unauthorized') && unique.size === 1) return 'unauthorized';
  if (states.every(state => state === 'disconnected')) return 'disconnected';
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

function firstSha(
  sources: Readonly<Record<ShippingSourceId, SourceObservation>>
): string | null {
  for (const sourceId of SHIPPING_SOURCE_IDS) {
    const sha = sources[sourceId].correlation.sha;
    if (isExactSha(sha)) return sha;
  }
  return null;
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
    sha: firstSha(sources),
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
  if (!SUCCESS_STATES.has(source.state)) return null;
  return source.measuredMeanings[key];
}

function productionVerified(source: SourceObservation): boolean | null {
  const hinted = measuredOrNull(source, 'productionVerified');
  if (hinted != null) return hinted;
  if (!SUCCESS_STATES.has(source.state)) return null;
  if (source.lastError?.code === 'not-verified') return false;
  if (source.correlation.deploymentId == null) return null;
  return true;
}

function ciGreen(source: SourceObservation): boolean | null {
  const hinted = measuredOrNull(source, 'ciGreen');
  if (hinted != null) return hinted;
  if (!SUCCESS_STATES.has(source.state)) return null;
  if (source.lastError?.code === 'ci-not-green') return false;
  if (source.correlation.ciRunId == null) return null;
  return source.lastError == null;
}

function exactLiveBuild(
  build: SourceObservation,
  controller: SourceObservation
): boolean | null {
  const hinted = measuredOrNull(build, 'exactLiveBuild');
  if (hinted != null) return hinted;
  const live = build.correlation.sha;
  const deployed = controller.correlation.sha;
  if (!isExactSha(live) || !isExactSha(deployed)) {
    if (
      !SUCCESS_STATES.has(build.state) ||
      !SUCCESS_STATES.has(controller.state)
    ) {
      return null;
    }
    return false;
  }
  return live === deployed;
}

function queuedMeaning(source: SourceObservation): boolean | null {
  const hinted = measuredOrNull(source, 'queued');
  if (hinted != null) return hinted;
  if (source.counts.queued.state === 'not-measured') return null;
  return source.counts.queued.value !== null && source.counts.queued.value > 0
    ? true
    : source.counts.queued.state === 'measured-zero'
      ? false
      : null;
}

function mergedMeaning(source: SourceObservation): boolean | null {
  const hinted = measuredOrNull(source, 'merged');
  if (hinted != null) return hinted;
  if (!SUCCESS_STATES.has(source.state)) return null;
  if (source.lastError?.code === 'not-merged') return false;
  return null;
}

export function projectMeanings(
  sources: Readonly<Record<ShippingSourceId, SourceObservation>>
): ShipMeanings {
  const fleet = sources['fleet-receipt'];
  const queue = sources['github-native-merge-queue'];
  const ci = sources['exact-sha-ci'];
  const controller = sources['production-controller'];
  const build = sources['live-build-info'];

  const merged = mergedMeaning(fleet);
  const queued = queuedMeaning(queue);
  const green = ciGreen(ci);
  const verified = productionVerified(controller);
  const live = exactLiveBuild(build, controller);

  return {
    merged: merged == null ? NOT_MEASURED_BOOLEAN : measuredBoolean(merged),
    queued: queued == null ? NOT_MEASURED_BOOLEAN : measuredBoolean(queued),
    ciGreen: green == null ? NOT_MEASURED_BOOLEAN : measuredBoolean(green),
    productionVerified:
      verified == null ? NOT_MEASURED_BOOLEAN : measuredBoolean(verified),
    exactLiveBuild: live == null ? NOT_MEASURED_BOOLEAN : measuredBoolean(live),
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
  const queue = sources['github-native-merge-queue'];
  const fleet = sources['fleet-receipt'];
  const start = queue.sourceTimestamp ?? fleet.sourceTimestamp;
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
  const lastSuccess = successful
    ? {
        at: input.observationTimestamp,
        sequence: input.sequence,
        eventId: projectionIdFor(
          input.sequence,
          revisionFingerprint(input.sources)
        ),
      }
    : (input.lastKnown?.lastSuccess ?? null);

  const lastError =
    SHIPPING_SOURCE_IDS.map(sourceId => input.sources[sourceId].lastError).find(
      error => error != null
    ) ??
    (input.publishing
      ? null
      : {
          at: input.observationTimestamp,
          code: 'publisher-stopped',
          message: 'Publishing stopped; last-known marker retained',
        });

  const revision = revisionFingerprint(input.sources);

  return {
    producerId: SHIPPING_STATE_PRODUCER_ID,
    producerVersion: SHIPPING_STATE_PRODUCER_VERSION,
    sourceId: 'fleet-receipt',
    entityId: 'ovie.shipping-state',
    schema: SHIPPING_STATE_SCHEMA,
    eventId: projectionIdFor(input.sequence, revision),
    projectionId: projectionIdFor(input.sequence, revision),
    sequence: input.sequence,
    cursor: cursorFor(input.sequence),
    sourceRevision: revision,
    sourceTimestamp: null,
    observationTimestamp: input.observationTimestamp,
    emissionTimestamp: input.emissionTimestamp,
    freshnessDeadline: deadline,
    correlation: mergeAllCorrelation(input.sources),
    lastSuccess,
    lastError,
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
    state: publishing ? 'stale' : 'stale',
    publishing,
    emissionTimestamp: lastKnown.emissionTimestamp,
    observationTimestamp: lastKnown.observationTimestamp,
    freshnessDeadline: lastKnown.freshnessDeadline,
    lastError: lastError ?? lastKnown.lastError,
    meanings: lastKnown.meanings,
    retrying: lastKnown.retrying,
    terminalFailures: lastKnown.terminalFailures,
    capacityAvailable: lastKnown.capacityAvailable,
    timeToShipSeconds: lastKnown.timeToShipSeconds,
    latencyMs: lastKnown.latencyMs,
    withinM1Budget: lastKnown.withinM1Budget,
    sourceTimestamp: lastKnown.sourceTimestamp,
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
    return {
      ...retained,
      sequence: input.sequence,
      cursor: cursorFor(input.sequence),
      eventId: projectionIdFor(
        input.sequence,
        retained.sourceRevision ?? 'unknown'
      ),
      projectionId: projectionIdFor(
        input.sequence,
        retained.sourceRevision ?? 'unknown'
      ),
      publishing: input.publishing,
      lastError: input.lastError ?? retained.lastError,
      state: input.publishing ? 'stale' : 'stale',
      latencyMs: input.latencyMs,
      withinM1Budget: input.latencyMs <= M1_SOURCE_TO_PROJECTION_BUDGET_MS,
    };
  }

  const emptySources = {} as Record<ShippingSourceId, SourceObservation>;
  for (const sourceId of SHIPPING_SOURCE_IDS) {
    emptySources[sourceId] = {
      producerId: sourceId,
      producerVersion: SHIPPING_STATE_PRODUCER_VERSION,
      sourceId,
      entityId: sourceId,
      schema: SHIPPING_STATE_SCHEMA,
      eventId: `${sourceId}:0:none`,
      sequence: 0,
      cursor: cursorFor(0),
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
      state: 'unknown' as const,
      truncated: false,
      clockSkew: false,
      recovered: false,
      sequenceGap: false,
      ingest: 'accepted' as const,
      measuredMeanings: {
        merged: null,
        queued: null,
        ciGreen: null,
        productionVerified: null,
        exactLiveBuild: null,
      },
      entities: [],
      counts: emptyCounts(),
    } satisfies SourceObservation;
  }

  return {
    producerId: SHIPPING_STATE_PRODUCER_ID,
    producerVersion: SHIPPING_STATE_PRODUCER_VERSION,
    sourceId: 'fleet-receipt',
    entityId: 'ovie.shipping-state',
    schema: SHIPPING_STATE_SCHEMA,
    eventId: projectionIdFor(input.sequence, 'unknown'),
    projectionId: projectionIdFor(input.sequence, 'unknown'),
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
  };
}
