/**
 * Mesh hub core: limits, envelope validation and the per-agent mailbox store.
 * Pure logic over a minimal SQL interface so it runs in a Durable Object
 * (ctx.storage.sql) and in node:test (node:sqlite) unchanged.
 * Design: gbrain projects/jovie/agent-mesh-hub-architecture-2026-10-31.
 */

export interface SqlCursor {
  toArray(): Record<string, unknown>[];
}
/** The subset of DO SqlStorage the hub uses; node:sqlite satisfies it in tests. */
export interface Sql {
  exec(query: string, ...bindings: unknown[]): SqlCursor;
}

/** One configurable block per capability (security.md: no unlimited anything). */
export const LIMITS = {
  bodyChars: 4000,
  refs: 8,
  refChars: 200,
  sendsPerSenderPerDay: 2000,
  unackedPerMailbox: 10_000,
  longPollMaxSeconds: 25,
  pageSize: 100,
  leaseMs: 60_000,
  socketsPerKind: 8,
  retentionAfterAckMs: 30 * 86_400_000,
  deadAfterActiveMs: 6 * 3_600_000,
  deadAfterDormantMs: 72 * 3_600_000,
  // Automated notices (board fan-outs, DLQ wrappers, events/probes) expire:
  // the mailbox sweep acks them unhandled past this age so they never pile up
  // to the unacked cap. Real messages keep full retention. Override with the
  // AUTO_NOTICE_TTL_MS env var (clamped to [1 minute, 7 days]).
  autoNoticeTtlMs: 6 * 3_600_000,
  // At most one summary DLQ notice per (mailbox, fallback) per window.
  dlqCoalesceMs: 3_600_000,
  // A fallback at >= 90% of the unacked cap counts as full: never add DLQ weight.
  dlqFullFraction: 0.9,
} as const;

export const KIND = /^[a-z][a-z0-9-]{1,31}$/;
export const CORRELATION = /^[A-Za-z0-9][A-Za-z0-9_.:-]{7,127}$/;
export const SHA256 = /^[a-f0-9]{64}$/;
/** Hub-internal senders; never registrable as agents. */
export const SYSTEM_KINDS = new Set(['mesh-hub', 'mesh-probe', 'board']);

export type {
  DlqAccumulator,
  EnvelopeClass,
  MailboxSelector,
  PeekRow,
} from './envelope-policy.ts';
export {
  BOARD_OFFER_EVENTS,
  classifyEnvelope,
  dlqFallbackFull,
  isDlqSummaryDue,
  matchesExcludes,
  nextDlqAccumulator,
  TIM_RELAY,
  toPeekRow,
} from './envelope-policy.ts';

/** Shallow RPC-serializable record (Durable Object stub types reject deep/unknown). */
export type Detail = Record<
  string,
  string | number | boolean | null | string[]
>;

export type Envelope = {
  id: string;
  from: string;
  to: string;
  correlationId: string;
  sha256: string;
  body: string;
  refs: string[];
  inReplyTo: string | null;
  sentAt: string | null;
  acceptedAt: number;
  kind: 'message' | 'probe' | 'event' | 'undeliverable';
};

export type Delivered = Envelope & {
  seq: number;
  deliveryCount: number;
  firstDeliveredAt: number | null;
  receivedAt: number | null;
  ackedAt: number | null;
  deadAt: number | null;
};

export class HubError extends Error {
  readonly status: number;
  readonly code: string;
  readonly retryable: boolean;
  constructor(status: number, code: string, retryable = false) {
    super(code);
    this.status = status;
    this.code = code;
    this.retryable = retryable;
  }
}

export async function sha256Hex(text: string): Promise<string> {
  const bytes = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(text)
  );
  return [...new Uint8Array(bytes)]
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

export type SendInput = {
  to: string;
  correlationId: string;
  sha256: string;
  body: string;
  refs?: unknown;
  inReplyTo?: unknown;
  sentAt?: unknown;
};

/** Validates a client send. Throws HubError with a fixed code; never echoes the body. */
export async function validateSend(input: unknown): Promise<SendInput> {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new HubError(400, 'invalid_json');
  const raw = input as Record<string, unknown>;
  const allowed = new Set([
    'to',
    'correlationId',
    'sha256',
    'body',
    'refs',
    'inReplyTo',
    'sentAt',
  ]);
  if (Object.keys(raw).some(key => !allowed.has(key)))
    throw new HubError(422, 'invalid_mesh_message');
  const { to, correlationId, sha256, body } = raw;
  if (typeof to !== 'string' || !(to === 'all' || KIND.test(to)))
    throw new HubError(422, 'invalid_recipient');
  if (typeof correlationId !== 'string' || !CORRELATION.test(correlationId))
    throw new HubError(422, 'invalid_mesh_message');
  if (
    typeof body !== 'string' ||
    !body.trim() ||
    body.length > LIMITS.bodyChars
  )
    throw new HubError(422, 'body_too_large');
  if (typeof sha256 !== 'string' || !SHA256.test(sha256))
    throw new HubError(422, 'invalid_mesh_message');
  if ((await sha256Hex(body)) !== sha256)
    throw new HubError(422, 'digest_mismatch');
  const refs = raw.refs ?? [];
  if (
    !Array.isArray(refs) ||
    refs.length > LIMITS.refs ||
    refs.some(ref => typeof ref !== 'string' || ref.length > LIMITS.refChars)
  )
    throw new HubError(422, 'invalid_mesh_message');
  const inReplyTo = raw.inReplyTo ?? null;
  if (
    inReplyTo !== null &&
    (typeof inReplyTo !== 'string' || inReplyTo.length > 200)
  )
    throw new HubError(422, 'invalid_mesh_message');
  const sentAt = raw.sentAt ?? null;
  if (sentAt !== null && (typeof sentAt !== 'string' || sentAt.length > 40))
    throw new HubError(422, 'invalid_mesh_message');
  return {
    to,
    correlationId,
    sha256,
    body,
    refs: refs as string[],
    inReplyTo,
    sentAt,
  };
}

export type { EnqueueResult } from './mailbox-store.ts';
export { MailboxStore } from './mailbox-store.ts';

export function percentile(
  values: readonly number[],
  p: number
): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)
  );
  return sorted[index] ?? null;
}

/** Wire projection: quoted data, never instructions. */
export function project(message: Delivered) {
  return {
    id: message.id,
    seq: message.seq,
    from: message.from,
    to: message.to,
    correlationId: message.correlationId,
    sha256: message.sha256,
    body: message.body,
    refs: message.refs,
    inReplyTo: message.inReplyTo,
    sentAt: message.sentAt,
    acceptedAt: new Date(message.acceptedAt).toISOString(),
    kind: message.kind,
    deliveryCount: message.deliveryCount,
    received: message.receivedAt !== null,
    handled: message.ackedAt !== null,
    dead: message.deadAt !== null,
    dataNotInstructions: true as const,
  };
}
