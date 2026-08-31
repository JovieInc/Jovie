import {
  EMPTY_CORRELATION,
  type IdentityFields,
  isExactSha,
  type LastSuccess,
  MAX_ACCEPTED_SOURCE_SEQUENCE_GAP,
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
  /\b(gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk_(?:live|test)_[A-Za-z0-9]+|Bearer\s+[A-Za-z0-9._\-]+|xox[baprs]-[A-Za-z0-9-]+)\b/gi;
const SECRET_SHAPED_RE =
  /(?:gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk_(?:live|test)_[A-Za-z0-9]+|xox[baprs]-[A-Za-z0-9-]+)/i;
const PATH_RE =
  /(?:\/(?:home|Users|root|private|tmp|opt|usr|Library|var\/log|etc)\/[^\s"'`]+|~\/[^\s"'`]+|(?:[A-Za-z]:)?\\Users\\[^\s"'`]+)/g;
const PROMPT_RE = /\b(?:system prompt|conversation|chat log)\b/gi;
const SAFE_IDENTIFIER_RE = /^[A-Za-z0-9][A-Za-z0-9._:@+=-]*$/;
const MAX_IDENTIFIER_LENGTH = 128;

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

export function sanitizeOpaqueIdentifier(
  value: unknown,
  maxLength = MAX_IDENTIFIER_LENGTH
): string | null {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > maxLength ||
    !SAFE_IDENTIFIER_RE.test(value) ||
    SECRET_SHAPED_RE.test(value)
  ) {
    return null;
  }
  return value;
}

function sourceSchema(
  sourceId: ShippingSourceId,
  candidate: string | undefined
): string {
  const expected = SHIPPING_SOURCE_SCHEMAS[sourceId];
  if (candidate === expected) return candidate;
  if (
    sourceId === 'symphony-runtime' &&
    candidate === 'symphony-runtime-state/v1'
  ) {
    return candidate;
  }
  if (
    sourceId === 'production-controller' &&
    candidate === 'github-actions-run/v1'
  ) {
    return candidate;
  }
  return expected;
}

function safeSequence(value: number, fallback = 1): number {
  return Number.isSafeInteger(value) && value >= 0 ? value : fallback;
}

export function sanitizedError(
  at: string,
  code: string,
  value: unknown
): SanitizedError {
  return {
    at: parseTimestamp(at) ?? new Date(0).toISOString(),
    code: sanitizeOpaqueIdentifier(code, 64) ?? 'source-error',
    message: sanitizeErrorMessage(value),
  };
}

export function cursorFor(sequence: number): string {
  return `seq:${sequence}`;
}

export function eventIdFor(
  sourceId: ShippingSourceId,
  sequence: number,
  revision: string | null
): string {
  return `${sourceId}:${safeSequence(sequence)}:${sanitizeOpaqueIdentifier(revision) ?? 'none'}`;
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
  const prNumber =
    Number.isSafeInteger(extra.prNumber) && Number(extra.prNumber) > 0
      ? Number(extra.prNumber)
      : Number.isSafeInteger(base.prNumber) && Number(base.prNumber) > 0
        ? Number(base.prNumber)
        : null;
  return {
    workId:
      sanitizeOpaqueIdentifier(extra.workId) ??
      sanitizeOpaqueIdentifier(base.workId),
    leaseId:
      sanitizeOpaqueIdentifier(extra.leaseId) ??
      sanitizeOpaqueIdentifier(base.leaseId),
    prNumber,
    ciRunId:
      sanitizeOpaqueIdentifier(extra.ciRunId) ??
      sanitizeOpaqueIdentifier(base.ciRunId),
    deploymentId:
      sanitizeOpaqueIdentifier(extra.deploymentId) ??
      sanitizeOpaqueIdentifier(base.deploymentId),
    buildId:
      sanitizeOpaqueIdentifier(extra.buildId) ??
      sanitizeOpaqueIdentifier(base.buildId),
    sha: isExactSha(extra.sha)
      ? extra.sha
      : isExactSha(base.sha)
        ? base.sha
        : null,
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
  const sequence = safeSequence(input.sequence);
  const sourceRevision = sanitizeOpaqueIdentifier(input.sourceRevision);
  const sourceTimestamp = parseTimestamp(input.sourceTimestamp);
  const entityId =
    sanitizeOpaqueIdentifier(input.entityId) ?? `${input.sourceId}:unknown`;
  const producerId =
    sanitizeOpaqueIdentifier(input.producerId) ??
    SHIPPING_SOURCE_PRODUCERS[input.sourceId];
  const lastSuccess = input.lastSuccess
    ? {
        at: parseTimestamp(input.lastSuccess.at) ?? input.observationTimestamp,
        sequence: safeSequence(input.lastSuccess.sequence, sequence),
        eventId:
          sanitizeOpaqueIdentifier(input.lastSuccess.eventId) ??
          eventIdFor(input.sourceId, sequence, sourceRevision),
      }
    : null;
  const lastError = input.lastError
    ? sanitizedError(
        input.lastError.at,
        input.lastError.code,
        input.lastError.message
      )
    : null;
  return {
    producerId,
    producerVersion: SHIPPING_STATE_PRODUCER_VERSION,
    sourceId: input.sourceId,
    entityId,
    schema: sourceSchema(input.sourceId, input.schema),
    eventId: eventIdFor(input.sourceId, sequence, sourceRevision),
    sequence,
    cursor: cursorFor(sequence),
    sourceRevision,
    sourceTimestamp,
    observationTimestamp: input.observationTimestamp,
    emissionTimestamp: input.emissionTimestamp,
    freshnessDeadline: freshnessDeadline(input.observationTimestamp),
    correlation: mergeCorrelation(EMPTY_CORRELATION, input.correlation ?? {}),
    lastSuccess,
    lastError,
  };
}

export type SourceCursor = {
  readonly lastEventId: string | null;
  readonly lastSequence: number;
  readonly lastAcceptedAt: string | null;
  readonly lastSuccessSequence: number | null;
  readonly gapCount: number;
  readonly gapRanges: readonly {
    readonly from: number;
    readonly to: number;
  }[];
  readonly connected: boolean;
};

export type IngestAction =
  | 'accepted'
  | 'duplicate'
  | 'replay'
  | 'out-of-order'
  | 'gap'
  | 'gap-rejected'
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
    gapCount: 0,
    gapRanges: [],
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

function recordGap(
  cursor: SourceCursor,
  from: number,
  to: number
): Pick<SourceCursor, 'gapCount' | 'gapRanges'> {
  const missing = Math.max(0, to - from + 1);
  return {
    gapCount: Math.min(Number.MAX_SAFE_INTEGER, cursor.gapCount + missing),
    gapRanges: [...cursor.gapRanges, { from, to }].slice(-32),
  };
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
  const missing = gap ? input.sequence - expected : 0;
  if (gap && missing > MAX_ACCEPTED_SOURCE_SEQUENCE_GAP) {
    return {
      action: 'gap-rejected',
      cursor: {
        ...cursor,
        ...recordGap(cursor, expected, input.sequence - 1),
        connected: input.reachable,
      },
      sequenceGap: true,
      clockSkew,
      recovered,
      replaceCurrent: false,
    };
  }
  return {
    action: recovered ? 'reconnect' : gap ? 'gap' : 'accepted',
    cursor: {
      lastEventId: input.eventId,
      lastSequence: input.sequence,
      lastAcceptedAt: input.observationTimestamp,
      lastSuccessSequence: input.sequence,
      ...(gap
        ? recordGap(cursor, expected, input.sequence - 1)
        : { gapCount: cursor.gapCount, gapRanges: cursor.gapRanges }),
      connected: input.reachable,
    },
    sequenceGap: gap,
    clockSkew,
    recovered,
    replaceCurrent: true,
  };
}

const TERMINAL_FRESHNESS = new Set<ObservationState>([
  'stale',
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
