import {
  EMPTY_CORRELATION,
  type IdentityFields,
  type LastSuccess,
  type ObservationState,
  type SanitizedError,
  SHIPPING_SOURCE_PRODUCERS,
  SHIPPING_SOURCE_SCHEMAS,
  SHIPPING_STATE_CLOCK_SKEW_MS,
  SHIPPING_STATE_FRESHNESS_MS,
  SHIPPING_STATE_PRODUCER_ID,
  SHIPPING_STATE_PRODUCER_VERSION,
  type ShippingClock,
  type ShippingCorrelation,
  type ShippingSourceId,
} from './contract';

const SECRET_RE =
  /\b(ghp_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk_(?:live|test)_[A-Za-z0-9]+|Bearer\s+[A-Za-z0-9._\-]+|xox[baprs]-[A-Za-z0-9-]+)\b/gi;
const PATH_RE =
  /(?:\/(?:home|Users|root|var\/log|etc)\/[^\s"'`]+|~\/[^\s"'`]+|(?:[A-Za-z]:)?\\Users\\[^\s"'`]+)/g;
const PROMPT_RE = /\b(?:system prompt|conversation|chat log)\b/gi;

export function systemClock(): ShippingClock {
  return {
    nowIso: () => new Date().toISOString(),
    nowMs: () => Date.now(),
  };
}

export function parseTimestamp(value: unknown): string | null {
  if (typeof value !== 'string' || value.length === 0) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

export function sanitizeErrorMessage(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return 'source-error';
  }
  return (
    value
      .replace(SECRET_RE, '[redacted]')
      .replace(PATH_RE, '[path]')
      .replace(PROMPT_RE, '[redacted]')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 240) || 'source-error'
  );
}

export function sanitizedError(
  at: string,
  code: string,
  value: unknown
): SanitizedError {
  return { at, code, message: sanitizeErrorMessage(value) };
}

export function cursorFor(sequence: number): string {
  return `seq:${sequence}`;
}

export function eventIdFor(
  sourceId: ShippingSourceId,
  sequence: number,
  revision: string | null
): string {
  return `${sourceId}:${sequence}:${revision ?? 'none'}`;
}

export function projectionIdFor(sequence: number, revision: string): string {
  return `${SHIPPING_STATE_PRODUCER_ID}:${sequence}:${revision}`;
}

export function freshnessDeadline(
  observationTimestamp: string,
  freshnessMs = SHIPPING_STATE_FRESHNESS_MS
): string {
  return new Date(Date.parse(observationTimestamp) + freshnessMs).toISOString();
}

export function mergeCorrelation(
  base: ShippingCorrelation,
  extra: Partial<ShippingCorrelation>
): ShippingCorrelation {
  return {
    workId: extra.workId ?? base.workId,
    leaseId: extra.leaseId ?? base.leaseId,
    prNumber: extra.prNumber ?? base.prNumber,
    ciRunId: extra.ciRunId ?? base.ciRunId,
    deploymentId: extra.deploymentId ?? base.deploymentId,
    buildId: extra.buildId ?? base.buildId,
    sha: extra.sha ?? base.sha,
  };
}

export function identityFields(input: {
  readonly sourceId: ShippingSourceId;
  readonly entityId: string;
  readonly sequence: number;
  readonly observationTimestamp: string;
  readonly emissionTimestamp: string;
  readonly sourceRevision?: string | null;
  readonly sourceTimestamp?: string | null;
  readonly correlation?: Partial<ShippingCorrelation>;
  readonly lastSuccess?: LastSuccess | null;
  readonly lastError?: SanitizedError | null;
  readonly producerId?: string;
  readonly schema?: string;
}): IdentityFields {
  const sourceRevision = input.sourceRevision ?? null;
  return {
    producerId: input.producerId ?? SHIPPING_SOURCE_PRODUCERS[input.sourceId],
    producerVersion: SHIPPING_STATE_PRODUCER_VERSION,
    sourceId: input.sourceId,
    entityId: input.entityId,
    schema: input.schema ?? SHIPPING_SOURCE_SCHEMAS[input.sourceId],
    eventId: eventIdFor(input.sourceId, input.sequence, sourceRevision),
    sequence: input.sequence,
    cursor: cursorFor(input.sequence),
    sourceRevision,
    sourceTimestamp: input.sourceTimestamp ?? null,
    observationTimestamp: input.observationTimestamp,
    emissionTimestamp: input.emissionTimestamp,
    freshnessDeadline: freshnessDeadline(input.observationTimestamp),
    correlation: mergeCorrelation(EMPTY_CORRELATION, input.correlation ?? {}),
    lastSuccess: input.lastSuccess ?? null,
    lastError: input.lastError ?? null,
  };
}

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
  return (
    Number.isFinite(sourceMs) &&
    Number.isFinite(observedMs) &&
    sourceMs - observedMs > SHIPPING_STATE_CLOCK_SKEW_MS
  );
}

function range(start: number, endExclusive: number): number[] {
  const values: number[] = [];
  for (let n = start; n < endExclusive; n += 1) values.push(n);
  return values;
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
  const unchanged = (
    action: IngestAction,
    recoveredFlag = recovered
  ): IngestResult => ({
    action,
    cursor,
    sequenceGap: false,
    clockSkew,
    recovered: recoveredFlag,
    replaceCurrent: false,
  });

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
  if (input.eventId === cursor.lastEventId)
    return unchanged('duplicate', false);
  if (input.sequence < cursor.lastSequence) {
    return unchanged(
      cursor.lastSequence - input.sequence > 1 ? 'backfill' : 'replay'
    );
  }
  if (input.sequence === cursor.lastSequence && cursor.lastSequence > 0) {
    return unchanged('replay', false);
  }

  const expected = cursor.lastSequence + 1;
  const gap = cursor.lastSequence > 0 && input.sequence > expected;
  return {
    action: recovered ? 'reconnect' : gap ? 'gap' : 'accepted',
    cursor: {
      lastEventId: input.eventId,
      lastSequence: input.sequence,
      lastAcceptedAt: input.observationTimestamp,
      lastSuccessSequence: input.sequence,
      gapSequences: gap
        ? [...cursor.gapSequences, ...range(expected, input.sequence)]
        : cursor.gapSequences,
      connected: input.reachable,
    },
    sequenceGap: gap,
    clockSkew,
    recovered,
    replaceCurrent: true,
  };
}

const TERMINAL_FRESHNESS = new Set<ObservationState>([
  'disconnected',
  'unavailable',
  'unauthorized',
  'unknown',
  'error',
  'not-measured',
]);

export function observationFreshness(
  observationTimestamp: string,
  deadline: string,
  nowIso: string,
  baseState: ObservationState
): ObservationState {
  if (TERMINAL_FRESHNESS.has(baseState)) return baseState;
  const nowMs = Date.parse(nowIso);
  const deadlineMs = Date.parse(deadline);
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
