import { OPERATIONAL_TRUTH_STATES } from '@/lib/ovie/program';

export const SHIPPING_STATE_SCHEMA = 'ovie.shipping-state.v1' as const;
export const SHIPPING_STATE_FRESHNESS_BUDGET_MS = 10_000;
export const SHIPPING_STATE_POLL_INTERVAL_MS = 4_000;
export const SHIPPING_STATE_CLOCK_UNCERTAINTY_MS = 1_000;
export const SHIPPING_STATE_CACHE_GC_MS = 30_000;
export type ShippingTruth = (typeof OPERATIONAL_TRUTH_STATES)[number];
export type ShippingConnection = 'connected' | 'disconnected' | 'unauthorized';
export type ShippingCountView = {
  readonly value: number | null;
  readonly measurement: 'measured' | 'not_measured';
  readonly zero: 'measured-zero' | 'measured-nonzero' | 'not-measured';
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
  readonly merged: ShippingCountView;
  readonly ciGreen: ShippingCountView;
  readonly productionVerified: ShippingCountView;
  readonly exactLiveBuild: ShippingCountView;
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
function parseCount(record: unknown, key: string): ShippingCountView {
  if (!isRecord(record) || !isRecord(record[key])) return NONE;
  return countViewFromMeasurement(record[key].value, record[key].measurement);
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
    merged: NONE,
    ciGreen: NONE,
    productionVerified: NONE,
    exactLiveBuild: NONE,
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
export function parseShippingStateProjection(
  payload: unknown
):
  | { readonly ok: true; readonly projection: ShippingStateView }
  | { readonly ok: false; readonly reason: 'unsupported-schema' | 'invalid' } {
  if (!isRecord(payload)) return { ok: false, reason: 'invalid' };
  if (payload.schema !== SHIPPING_STATE_SCHEMA) {
    return { ok: false, reason: 'unsupported-schema' };
  }
  const source = isRecord(payload.source) ? payload.source : {};
  const entity = isRecord(payload.entity) ? payload.entity : {};
  const producer = isRecord(payload.producer) ? payload.producer : {};
  const corr = isRecord(payload.correlation) ? payload.correlation : {};
  const projectionId = str(payload.projectionId);
  const sequence = int(payload.sequence);
  const sourceIdentity =
    str(source.identity) ?? str(source.id) ?? str(producer.id);
  const entityId = str(entity.id) ?? str(entity.kind);
  const sourceTime =
    iso(payload.sourceTime) ??
    iso(source.revisionTime) ??
    iso(payload.observedAt);
  const freshnessDeadlineAt = iso(payload.freshnessDeadlineAt);
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
  const lastError = isRecord(payload.lastError)
    ? (str(payload.lastError.message) ?? 'Source error')
    : null;
  const view: ShippingStateView = {
    schema: SHIPPING_STATE_SCHEMA,
    truth: 'fresh',
    connection: 'connected',
    projectionId,
    sequence,
    sourceIdentity,
    revision: str(source.revision) ?? str(payload.revision),
    entityId,
    correlationEventId: str(corr.eventId) ?? str(corr.workId) ?? projectionId,
    sourceTime,
    freshnessDeadlineAt,
    ageMs: null,
    lastSuccess: null,
    lastError,
    queued: parseCount(payload.counts, 'queued'),
    inFlight: parseCount(payload.counts, 'inFlight'),
    merged: parseCount(payload.pipeline, 'merged'),
    ciGreen: parseCount(payload.pipeline, 'ciGreen'),
    productionVerified: parseCount(payload.pipeline, 'productionVerified'),
    exactLiveBuild: parseCount(payload.pipeline, 'exactLiveBuild'),
    flags: new Set(payload.completeness === 'partial' ? ['partial'] : []),
  };
  return { ok: true, projection: view };
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
  if (view.lastError && view.flags.has('partial')) return 'degraded';
  if (view.lastError) return 'failure';
  if (view.flags.has('partial')) return 'degraded';
  if (clockUncertain || cacheExpired) return 'stale';
  return 'fresh';
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
  if (lastSeq !== null && (parsed.sequence ?? 0) > lastSeq + 1)
    flags.add('sequenceGap');
  const resolved = freshnessOf({ ...parsed, flags }, now);
  const recovering =
    prev.view.lastSuccess !== null &&
    prev.view.connection !== 'connected' &&
    resolved === 'fresh';
  return {
    lastAppliedSequence: parsed.sequence,
    lastAppliedProjectionId: parsed.projectionId,
    view: {
      ...parsed,
      truth: recovering ? 'recovery' : resolved,
      connection: 'connected',
      ageMs: age(parsed.sourceTime, now),
      flags,
      lastSuccess: {
        ...parsed,
        flags,
        truth: resolved,
        ageMs: age(parsed.sourceTime, now),
      },
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
  if (state.view.truth === 'stale' && state.view.flags.has('cacheExpired'))
    return state;
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
