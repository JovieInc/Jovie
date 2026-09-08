import type { OperationalTruthState } from '@/lib/ovie/program';
import {
  SHIPPING_STATE_FRESHNESS_MS,
  SHIPPING_STATE_SCHEMA,
} from '@/lib/ovie/shipping-state';

export { SHIPPING_STATE_SCHEMA };
export const SHIPPING_STATE_FRESHNESS_BUDGET_MS = SHIPPING_STATE_FRESHNESS_MS;
export const SHIPPING_STATE_POLL_INTERVAL_MS = 4_000;
export const SHIPPING_STATE_CLOCK_UNCERTAINTY_MS = 1_000;
export const SHIPPING_STATE_CACHE_GC_MS = 30_000;

export type ShippingTruth = OperationalTruthState;
export type ShippingConnection = 'connected' | 'disconnected' | 'unauthorized';
export type ShippingCountView = {
  readonly value: number | null;
  readonly measurement: 'measured' | 'not_measured';
  readonly zero: 'measured-zero' | 'measured-nonzero' | 'not-measured';
};
export type ShippingMeaningView = {
  readonly value: boolean | null;
  readonly measurement: 'measured' | 'not_measured';
};
export type ShippingFlag =
  | 'replay'
  | 'duplicate'
  | 'sequenceGap'
  | 'partial'
  | 'unsupportedSchema'
  | 'cacheExpired'
  | 'clockUncertain';
export type ShippingStateView = {
  readonly schema: typeof SHIPPING_STATE_SCHEMA;
  readonly truth: ShippingTruth;
  readonly connection: ShippingConnection;
  readonly projectionId: string | null;
  readonly sequence: number | null;
  readonly sourceIdentity: string | null;
  readonly revision: string | null;
  readonly entityId: string | null;
  readonly correlationEventId: string | null;
  readonly sourceTime: string | null;
  readonly freshnessDeadlineAt: string | null;
  readonly ageMs: number | null;
  readonly lastSuccess: ShippingStateView | null;
  readonly lastError: string | null;
  readonly queued: ShippingCountView;
  readonly inFlight: ShippingCountView;
  readonly merged: ShippingMeaningView;
  readonly ciGreen: ShippingMeaningView;
  readonly productionVerified: ShippingMeaningView;
  readonly exactLiveBuild: ShippingMeaningView;
  readonly flags: ReadonlySet<ShippingFlag>;
};
export type ShippingStateRead =
  | { readonly kind: 'projection'; readonly payload: unknown }
  | { readonly kind: 'timeout' | 'unauthorized' | 'disconnected' | 'missing' }
  | { readonly kind: 'unavailable' | 'error'; readonly reason: string };
export type ShippingMachineState = {
  readonly view: ShippingStateView;
  readonly lastAppliedSequence: number | null;
  readonly lastAppliedProjectionId: string | null;
};

const NONE: ShippingCountView = {
  value: null,
  measurement: 'not_measured',
  zero: 'not-measured',
};
const NONE_MEANING: ShippingMeaningView = {
  value: null,
  measurement: 'not_measured',
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v : null;
}

function int(v: unknown): number | null {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : null;
}

function iso(v: unknown): string | null {
  const text = str(v);
  if (!text) return null;
  const ms = Date.parse(text);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

function age(sourceTime: string | null, now: number): number | null {
  if (!sourceTime) return null;
  const ms = Date.parse(sourceTime);
  return Number.isFinite(ms) ? Math.max(0, now - ms) : null;
}

export function countViewFromMeasurement(
  value: unknown,
  measurement: unknown
): ShippingCountView {
  if (
    measurement !== 'measured' ||
    typeof value !== 'number' ||
    !Number.isFinite(value)
  ) {
    return NONE;
  }
  return value === 0
    ? { value: 0, measurement: 'measured', zero: 'measured-zero' }
    : { value, measurement: 'measured', zero: 'measured-nonzero' };
}

function parseCount(value: unknown): ShippingCountView {
  if (!isRecord(value)) return NONE;
  if (value.state === 'measured-zero' && value.value === 0) {
    return { value: 0, measurement: 'measured', zero: 'measured-zero' };
  }
  if (
    value.state === 'measured-nonzero' &&
    typeof value.value === 'number' &&
    Number.isFinite(value.value) &&
    value.value !== 0
  ) {
    return {
      value: value.value,
      measurement: 'measured',
      zero: 'measured-nonzero',
    };
  }
  return NONE;
}

function parseMeaning(value: unknown): ShippingMeaningView {
  if (!isRecord(value) || value.state !== 'measured') return NONE_MEANING;
  if (typeof value.value !== 'boolean') return NONE_MEANING;
  return { value: value.value, measurement: 'measured' };
}

function nestedCount(
  record: unknown,
  sourceId: string,
  key: string
): ShippingCountView {
  if (!isRecord(record) || !isRecord(record[sourceId])) return NONE;
  const counts = isRecord(record[sourceId].counts)
    ? record[sourceId].counts
    : null;
  return counts ? parseCount(counts[key]) : NONE;
}

function mapServerState(state: unknown): ShippingTruth {
  switch (state) {
    case 'fresh':
      return 'fresh';
    case 'stale':
      return 'stale';
    case 'disconnected':
      return 'disconnected';
    case 'unavailable':
      return 'unavailable';
    case 'unauthorized':
      return 'unauthorized';
    case 'degraded':
    case 'partial':
      return 'degraded';
    case 'unknown':
      return 'unknown';
    case 'error':
      return 'failure';
    case 'measured-zero':
    case 'measured-nonzero':
    case 'not-measured':
    default:
      return 'unknown';
  }
}

export function createEmptyShippingStateView(): ShippingStateView {
  return {
    schema: SHIPPING_STATE_SCHEMA,
    truth: 'unknown',
    connection: 'disconnected',
    projectionId: null,
    sequence: null,
    sourceIdentity: null,
    revision: null,
    entityId: null,
    correlationEventId: null,
    sourceTime: null,
    freshnessDeadlineAt: null,
    ageMs: null,
    lastSuccess: null,
    lastError: null,
    queued: NONE,
    inFlight: NONE,
    merged: NONE_MEANING,
    ciGreen: NONE_MEANING,
    productionVerified: NONE_MEANING,
    exactLiveBuild: NONE_MEANING,
    flags: new Set(),
  };
}

export function createShippingMachine(): ShippingMachineState {
  return {
    view: createEmptyShippingStateView(),
    lastAppliedSequence: null,
    lastAppliedProjectionId: null,
  };
}

function lastErrorMessage(value: unknown): string | null {
  if (!isRecord(value)) return null;
  return str(value.message) ?? 'Source error';
}

export function parseShippingStateProjection(
  payload: unknown
):
  | { readonly ok: true; readonly projection: ShippingStateView }
  | { readonly ok: false; readonly reason: 'unsupported-schema' | 'invalid' } {
  if (!isRecord(payload)) return { ok: false, reason: 'invalid' };
  if (payload.schema !== SHIPPING_STATE_SCHEMA) {
    return { ok: false, reason: 'unsupported-schema' };
  }
  const correlation = isRecord(payload.correlation) ? payload.correlation : {};
  const meanings = isRecord(payload.meanings) ? payload.meanings : {};
  const projectionId = str(payload.projectionId) ?? str(payload.eventId);
  const sequence = int(payload.sequence);
  const sourceIdentity = str(payload.producerId) ?? str(payload.sourceId);
  const entityId = str(payload.entityId);
  const sourceTime =
    iso(payload.sourceTimestamp) ??
    iso(payload.observationTimestamp) ??
    iso(payload.emissionTimestamp);
  const freshnessDeadlineAt = iso(payload.freshnessDeadline);
  if (
    !projectionId ||
    sequence === null ||
    !sourceIdentity ||
    !entityId ||
    !sourceTime ||
    !freshnessDeadlineAt
  ) {
    return { ok: false, reason: 'invalid' };
  }
  const flags = new Set<ShippingFlag>();
  if (payload.state === 'partial' || payload.state === 'degraded') {
    flags.add('partial');
  }
  const view: ShippingStateView = {
    schema: SHIPPING_STATE_SCHEMA,
    truth: mapServerState(payload.state),
    connection: 'connected',
    projectionId,
    sequence,
    sourceIdentity,
    revision: str(payload.sourceRevision),
    entityId,
    correlationEventId:
      str(correlation.workId) ??
      str(correlation.leaseId) ??
      str(payload.eventId) ??
      projectionId,
    sourceTime,
    freshnessDeadlineAt,
    ageMs: null,
    lastSuccess: null,
    lastError: lastErrorMessage(payload.lastError),
    queued: nestedCount(payload.sources, 'github-native-merge-queue', 'queued'),
    inFlight: nestedCount(payload.sources, 'symphony-runtime', 'running'),
    merged: parseMeaning(meanings.merged),
    ciGreen: parseMeaning(meanings.ciGreen),
    productionVerified: parseMeaning(meanings.productionVerified),
    exactLiveBuild: parseMeaning(meanings.exactLiveBuild),
    flags,
  };
  return { ok: true, projection: view };
}

function reasonFromPayload(payload: unknown, fallback: string): string {
  return (isRecord(payload) ? str(payload.error) : null) ?? fallback;
}

export function shippingStateReadFromHttp(
  status: number,
  payload: unknown
): ShippingStateRead {
  if (status === 401 || status === 403) return { kind: 'unauthorized' };
  if (status === 400) {
    return { kind: 'error', reason: reasonFromPayload(payload, 'bad-request') };
  }
  if (status >= 500) {
    return {
      kind: 'unavailable',
      reason: reasonFromPayload(payload, 'server-error'),
    };
  }
  if (status < 200 || status >= 300) {
    return {
      kind: 'unavailable',
      reason: reasonFromPayload(payload, `http-${status}`),
    };
  }
  if (!isRecord(payload)) {
    return { kind: 'unavailable', reason: 'invalid-response' };
  }
  if (payload.schema === SHIPPING_STATE_SCHEMA) {
    return { kind: 'projection', payload };
  }
  return { kind: 'unavailable', reason: 'invalid-response' };
}

function retain(
  prev: ShippingMachineState,
  truth: ShippingTruth,
  connection: ShippingConnection,
  now: number,
  flags: Iterable<ShippingFlag> = [],
  lastError: string | null = prev.view.lastError
): ShippingMachineState {
  const last =
    prev.view.lastSuccess ?? (prev.view.sourceTime ? prev.view : null);
  const base = last ?? prev.view;
  return {
    ...prev,
    view: {
      ...base,
      truth,
      connection,
      lastError,
      ageMs: age(base.sourceTime, now),
      flags: new Set(flags),
      lastSuccess: last,
    },
  };
}

function freshnessOf(view: ShippingStateView, now: number): ShippingTruth {
  const slack = SHIPPING_STATE_CLOCK_UNCERTAINTY_MS;
  const clockUncertain = Date.parse(view.sourceTime ?? '') > now + slack;
  const cacheExpired = Date.parse(view.freshnessDeadlineAt ?? '') + slack < now;
  if (
    view.truth === 'disconnected' ||
    view.truth === 'unavailable' ||
    view.truth === 'unauthorized' ||
    view.truth === 'unknown'
  ) {
    return view.truth;
  }
  if (clockUncertain || cacheExpired) return 'stale';
  if (view.lastError && view.flags.has('partial')) return 'degraded';
  if (view.truth === 'failure') return 'failure';
  if (view.lastError) return 'failure';
  if (view.flags.has('partial') || view.truth === 'degraded') return 'degraded';
  return view.truth === 'stale' ? 'stale' : 'fresh';
}

function applyProjection(
  prev: ShippingMachineState,
  parsed: ShippingStateView,
  now: number
): ShippingMachineState {
  const lastSeq = prev.lastAppliedSequence;
  if (lastSeq !== null && (parsed.sequence ?? 0) < lastSeq) {
    return retain(prev, prev.view.truth, prev.view.connection, now, ['replay']);
  }
  if (
    lastSeq !== null &&
    parsed.sequence === lastSeq &&
    parsed.projectionId === prev.lastAppliedProjectionId
  ) {
    return retain(prev, prev.view.truth, prev.view.connection, now, [
      'duplicate',
    ]);
  }
  const flags = new Set(parsed.flags);
  if (
    Date.parse(parsed.sourceTime ?? '') >
    now + SHIPPING_STATE_CLOCK_UNCERTAINTY_MS
  ) {
    flags.add('clockUncertain');
  }
  if (
    Date.parse(parsed.freshnessDeadlineAt ?? '') +
      SHIPPING_STATE_CLOCK_UNCERTAINTY_MS <
    now
  ) {
    flags.add('cacheExpired');
  }
  if (lastSeq !== null && (parsed.sequence ?? 0) > lastSeq + 1) {
    flags.add('sequenceGap');
  }
  const resolved = freshnessOf({ ...parsed, flags }, now);
  const recovering =
    prev.view.lastSuccess !== null &&
    prev.view.connection !== 'connected' &&
    resolved === 'fresh';
  const parsedAgeMs = age(parsed.sourceTime, now);
  const lastSuccess =
    resolved === 'fresh'
      ? {
          ...parsed,
          flags,
          truth: resolved,
          connection: 'connected' as const,
          ageMs: parsedAgeMs,
          lastSuccess: prev.view.lastSuccess,
        }
      : prev.view.lastSuccess;
  return {
    lastAppliedSequence: parsed.sequence,
    lastAppliedProjectionId: parsed.projectionId,
    view: {
      ...parsed,
      truth: recovering ? 'recovery' : resolved,
      connection:
        resolved === 'unauthorized'
          ? 'unauthorized'
          : resolved === 'disconnected' || resolved === 'unavailable'
            ? 'disconnected'
            : 'connected',
      ageMs: parsedAgeMs,
      flags,
      lastSuccess,
    },
  };
}

export function applyShippingStateRead(
  prev: ShippingMachineState,
  read: ShippingStateRead,
  now: number
): ShippingMachineState {
  switch (read.kind) {
    case 'timeout':
    case 'missing':
      return retain(
        prev,
        'unavailable',
        prev.view.connection === 'unauthorized'
          ? 'unauthorized'
          : 'disconnected',
        now
      );
    case 'disconnected':
      return retain(prev, 'disconnected', 'disconnected', now);
    case 'unauthorized':
      return retain(prev, 'unauthorized', 'unauthorized', now);
    case 'unavailable':
      return retain(prev, 'unavailable', 'disconnected', now, [], read.reason);
    case 'error':
      return retain(
        prev,
        'failure',
        prev.view.connection,
        now,
        [],
        read.reason
      );
    case 'projection': {
      const parsed = parseShippingStateProjection(read.payload);
      if (!parsed.ok) {
        return retain(prev, 'unknown', prev.view.connection, now, [
          'unsupportedSchema',
        ]);
      }
      return applyProjection(prev, parsed.projection, now);
    }
    default: {
      const unknownRead = read as unknown;
      const reason = isRecord(unknownRead)
        ? (str(unknownRead.reason) ?? 'unknown-read-kind')
        : 'unknown-read-kind';
      return retain(prev, 'unknown', prev.view.connection, now, [], reason);
    }
  }
}

export function expireShippingStateIfNeeded(
  state: ShippingMachineState,
  now: number
): ShippingMachineState {
  if (
    state.view.connection !== 'connected' ||
    !state.view.freshnessDeadlineAt
  ) {
    return state;
  }
  if (
    now <=
    Date.parse(state.view.freshnessDeadlineAt) +
      SHIPPING_STATE_CLOCK_UNCERTAINTY_MS
  ) {
    return state;
  }
  if (state.view.truth === 'stale' && state.view.flags.has('cacheExpired')) {
    return state;
  }
  return retain(state, 'stale', 'connected', now, [
    'cacheExpired',
    ...state.view.flags,
  ]);
}

export function matchesShippingIdentity(
  view: ShippingStateView,
  query: {
    readonly correlationId?: string | null;
    readonly entityId?: string | null;
    readonly revision?: string | null;
  }
): boolean {
  if (query.entityId && view.entityId !== query.entityId) return false;
  if (query.revision && view.revision !== query.revision) return false;
  if (
    query.correlationId &&
    view.correlationEventId !== query.correlationId &&
    view.projectionId !== query.correlationId
  ) {
    return false;
  }
  return Boolean(query.correlationId || query.entityId || query.revision);
}

export function summarizeFreshnessSamples(samplesMs: readonly number[]): {
  readonly samples: readonly number[];
  readonly p50: number | null;
  readonly p95: number | null;
  readonly withinBudget: boolean;
} {
  if (samplesMs.length === 0) {
    return { samples: [], p50: null, p95: null, withinBudget: false };
  }
  const sorted = [...samplesMs].sort((a, b) => a - b);
  const pick = (p: number) =>
    sorted[
      Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)
    ] ?? 0;
  const p95 = pick(95);
  return {
    samples: sorted,
    p50: pick(50),
    p95,
    withinBudget: p95 <= SHIPPING_STATE_FRESHNESS_BUDGET_MS,
  };
}

let boundRead: (() => Promise<ShippingStateRead>) | null = null;

export function bindShippingStateSourceForTests(
  source: {
    readonly identity: string;
    read(): Promise<ShippingStateRead>;
  } | null
): void {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Test shipping-state source bind refused in production');
  }
  boundRead = source ? () => source.read() : null;
}

export function resetShippingStateSource(): void {
  boundRead = null;
}

export async function readShippingStateSource(): Promise<ShippingStateRead> {
  try {
    return boundRead
      ? await boundRead()
      : { kind: 'unavailable', reason: 'publisher-unbound' };
  } catch {
    return { kind: 'unavailable', reason: 'source-read-failed' };
  }
}
