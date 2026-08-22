import {
  EMPTY_CORRELATION,
  type IdentityFields,
  type LastSuccess,
  type SanitizedError,
  SHIPPING_SOURCE_PRODUCERS,
  SHIPPING_SOURCE_SCHEMAS,
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
  if (!Number.isFinite(parsed)) return null;
  return new Date(parsed).toISOString();
}

export function sanitizeErrorMessage(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return 'source-error';
  }
  const stripped = value
    .replace(SECRET_RE, '[redacted]')
    .replace(PATH_RE, '[path]')
    .replace(PROMPT_RE, '[redacted]')
    .replace(/\s+/g, ' ')
    .trim();
  return stripped.slice(0, 240) || 'source-error';
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

export function projectionIdentity(input: {
  readonly sequence: number;
  readonly observationTimestamp: string;
  readonly emissionTimestamp: string;
  readonly sourceRevision: string;
  readonly correlation?: Partial<ShippingCorrelation>;
  readonly lastSuccess?: LastSuccess | null;
  readonly lastError?: SanitizedError | null;
}): IdentityFields {
  return {
    producerId: SHIPPING_STATE_PRODUCER_ID,
    producerVersion: SHIPPING_STATE_PRODUCER_VERSION,
    sourceId: 'fleet-receipt',
    entityId: 'ovie.shipping-state',
    schema: 'ovie.shipping-state.v1',
    eventId: projectionIdFor(input.sequence, input.sourceRevision),
    sequence: input.sequence,
    cursor: cursorFor(input.sequence),
    sourceRevision: input.sourceRevision,
    sourceTimestamp: null,
    observationTimestamp: input.observationTimestamp,
    emissionTimestamp: input.emissionTimestamp,
    freshnessDeadline: freshnessDeadline(input.observationTimestamp),
    correlation: mergeCorrelation(EMPTY_CORRELATION, input.correlation ?? {}),
    lastSuccess: input.lastSuccess ?? null,
    lastError: input.lastError ?? null,
  };
}
