import {
  type ObservationState,
  SHIPPING_STATE_CLOCK_SKEW_MS,
  type ShippingSourceId,
} from './contract';
import { parseTimestamp } from './envelope';

export type SourceCursor = {
  readonly lastEventId: string | null;
  readonly lastSequence: number;
  readonly lastAcceptedAt: string | null;
  readonly lastSuccessSequence: number | null;
  readonly gapSequences: readonly number[];
  readonly connected: boolean;
};

export type IngestAction =
  | 'accepted'
  | 'duplicate'
  | 'replay'
  | 'out-of-order'
  | 'gap'
  | 'backfill'
  | 'schema-mismatch'
  | 'reconnect';

export type IngestInput = {
  readonly eventId: string;
  readonly sequence: number;
  readonly sourceTimestamp: string | null;
  readonly observationTimestamp: string;
  readonly schemaOk: boolean;
  readonly reachable: boolean;
};

export type IngestResult = {
  readonly action: IngestAction;
  readonly cursor: SourceCursor;
  readonly sequenceGap: boolean;
  readonly clockSkew: boolean;
  readonly recovered: boolean;
  readonly replaceCurrent: boolean;
};

export function emptyCursor(): SourceCursor {
  return {
    lastEventId: null,
    lastSequence: 0,
    lastAcceptedAt: null,
    lastSuccessSequence: null,
    gapSequences: [],
    connected: false,
  };
}

export function detectClockSkew(
  sourceTimestamp: string | null,
  observationTimestamp: string
): boolean {
  const sourceMs = sourceTimestamp ? Date.parse(sourceTimestamp) : Number.NaN;
  const observedMs = Date.parse(observationTimestamp);
  if (!Number.isFinite(sourceMs) || !Number.isFinite(observedMs)) return false;
  return sourceMs - observedMs > SHIPPING_STATE_CLOCK_SKEW_MS;
}

export function ingestSourceEvent(
  cursor: SourceCursor,
  input: IngestInput
): IngestResult {
  const clockSkew = detectClockSkew(
    parseTimestamp(input.sourceTimestamp) ?? input.sourceTimestamp,
    input.observationTimestamp
  );
  const recovered =
    input.reachable && !cursor.connected && cursor.lastSequence > 0;

  if (!input.schemaOk) {
    return {
      action: 'schema-mismatch',
      cursor: { ...cursor, connected: input.reachable },
      sequenceGap: false,
      clockSkew,
      recovered,
      replaceCurrent: false,
    };
  }

  if (input.eventId === cursor.lastEventId) {
    return {
      action: 'duplicate',
      cursor,
      sequenceGap: false,
      clockSkew,
      recovered: false,
      replaceCurrent: false,
    };
  }

  if (input.sequence < cursor.lastSequence) {
    return {
      action: cursor.lastSequence - input.sequence > 1 ? 'backfill' : 'replay',
      cursor,
      sequenceGap: false,
      clockSkew,
      recovered,
      replaceCurrent: false,
    };
  }

  if (input.sequence === cursor.lastSequence && cursor.lastSequence > 0) {
    return {
      action: 'replay',
      cursor,
      sequenceGap: false,
      clockSkew,
      recovered: false,
      replaceCurrent: false,
    };
  }

  const expected = cursor.lastSequence + 1;
  const gap = cursor.lastSequence > 0 && input.sequence > expected;
  const outOfOrder = gap;
  const gapSequences = gap
    ? [...cursor.gapSequences, ...range(expected, input.sequence)]
    : cursor.gapSequences;

  const next: SourceCursor = {
    lastEventId: input.eventId,
    lastSequence: input.sequence,
    lastAcceptedAt: input.observationTimestamp,
    lastSuccessSequence: input.sequence,
    gapSequences,
    connected: input.reachable,
  };

  return {
    action: recovered ? 'reconnect' : outOfOrder ? 'gap' : 'accepted',
    cursor: next,
    sequenceGap: gap,
    clockSkew,
    recovered,
    replaceCurrent: true,
  };
}

function range(start: number, endExclusive: number): number[] {
  const values: number[] = [];
  for (let n = start; n < endExclusive; n += 1) {
    values.push(n);
  }
  return values;
}

export function observationFreshness(
  observationTimestamp: string,
  freshnessDeadline: string,
  nowIso: string,
  baseState: ObservationState
): ObservationState {
  if (
    baseState === 'disconnected' ||
    baseState === 'unavailable' ||
    baseState === 'unauthorized' ||
    baseState === 'unknown' ||
    baseState === 'error' ||
    baseState === 'not-measured'
  ) {
    return baseState;
  }
  const nowMs = Date.parse(nowIso);
  const deadlineMs = Date.parse(freshnessDeadline);
  if (
    Number.isFinite(nowMs) &&
    Number.isFinite(deadlineMs) &&
    nowMs > deadlineMs
  ) {
    return 'stale';
  }
  return baseState === 'degraded' || baseState === 'partial'
    ? baseState
    : 'fresh';
}

export type CursorMap = Map<ShippingSourceId, SourceCursor>;
