/**
 * Which envelopes are automated notices versus direct mail, plus the DLQ
 * window and the admin peek selector. core.ts re-exports this surface.
 */
import { type Delivered, type Envelope, LIMITS } from './core.ts';

/** Marker that a message (or its quoted copy) came from or is bound for the founder. */
export const TIM_RELAY = 'TIM-RELAY';

/** The board fan-out events that are pure offers: the only board notices the
 * TTL may expire. Questions, answers and results are never automated. */
export const BOARD_OFFER_EVENTS = new Set([
  'task.open',
  'task.reopened',
  'merge.open',
]);

export type EnvelopeClass = 'automated' | 'direct';

/**
 * One classifier for every mailbox decision that must treat noise differently
 * from mail (TTL expiry, dead-lettering, DLQ). Automated = board fan-out OFFER
 * notices (kind 'message' from 'board' carrying an offer event) plus every
 * event/probe/undeliverable envelope. Direct = a real peer message (registered
 * agent or the 'tim' identity), board questions/answers/results and any other
 * human-directed ask — never expired merely because the sender is the board —
 * and anything carrying the TIM-RELAY marker in body or refs, which is
 * hard-protected: normal retention and dead-letter behavior, always.
 */
export function classifyEnvelope(
  envelope: Pick<Envelope, 'kind' | 'from' | 'body' | 'refs'>
): EnvelopeClass {
  if (
    envelope.body.includes(TIM_RELAY) ||
    envelope.refs.some(ref => ref.includes(TIM_RELAY))
  )
    return 'direct';
  if (envelope.kind === 'message') {
    if (envelope.from !== 'board') return 'direct';
    // Only fan-out offers are automated; questions, answers, results and
    // anything unparseable or unknown stay direct (ambiguous = protected).
    try {
      const parsed = JSON.parse(envelope.body) as {
        schema?: string;
        event?: string;
      };
      return parsed.schema === 'jovie.board/v1' &&
        typeof parsed.event === 'string' &&
        BOARD_OFFER_EVENTS.has(parsed.event)
        ? 'automated'
        : 'direct';
    } catch {
      return 'direct';
    }
  }
  return 'automated';
}

/** Coalescing state for summary DLQ notices: one per (mailbox, fallback) window. */
export type DlqAccumulator = {
  windowStart: number;
  count: number;
  firstSeq: number;
  lastSeq: number;
};

/** Fold one dead message into the coalescing window; a lapsed window restarts. */
export function nextDlqAccumulator(
  acc: DlqAccumulator | null,
  seq: number,
  now: number,
  windowMs: number
): DlqAccumulator {
  if (!acc || now - acc.windowStart >= windowMs)
    return { windowStart: now, count: 1, firstSeq: seq, lastSeq: seq };
  return { ...acc, count: acc.count + 1, lastSeq: seq };
}

/** The window's summary is due once the coalesce window has fully elapsed. */
export function isDlqSummaryDue(
  acc: DlqAccumulator | null,
  now: number,
  windowMs: number
): boolean {
  return acc !== null && acc.count > 0 && now - acc.windowStart >= windowMs;
}

/** A fallback at >= dlqFullFraction of the unacked cap is treated as full. */
export function dlqFallbackFull(unacked: number | null): boolean {
  return (
    unacked !== null &&
    unacked >= Math.ceil(LIMITS.dlqFullFraction * LIMITS.unackedPerMailbox)
  );
}

/** Shared, strictly read-only selection for admin peek and bulk-ack. */
export type MailboxSelector = {
  afterSeq: number;
  limit: number;
  olderThanMs: number | null;
  newerThanMs: number | null;
  msgKinds: string[];
  from: string[];
  unackedOnly: boolean;
  excludeBodyContains: string[];
  excludeRefsContains: string[];
  excludeFrom: string[];
};

/** Excludes are case-insensitive substrings over body / refs; excludeFrom is exact. */
export function matchesExcludes(
  message: Pick<Delivered, 'body' | 'refs' | 'from'>,
  selector: Pick<
    MailboxSelector,
    'excludeBodyContains' | 'excludeRefsContains' | 'excludeFrom'
  >
): boolean {
  const body = message.body.toLowerCase();
  const refs = message.refs.join('\n').toLowerCase();
  return (
    !selector.excludeBodyContains.some(term =>
      body.includes(term.toLowerCase())
    ) &&
    !selector.excludeRefsContains.some(term =>
      refs.includes(term.toLowerCase())
    ) &&
    !selector.excludeFrom.includes(message.from)
  );
}

const PREVIEW_CHARS = 120;

/** Admin peek metadata: never the full body, never a lease claim. */
export type PeekRow = {
  seq: number;
  id: string;
  from: string;
  kind: string;
  correlationId: string;
  sentAt: string | null;
  acceptedAt: string;
  acked: boolean;
  bodyLength: number;
  preview: string;
  refs: string[];
};

export function toPeekRow(message: Delivered): PeekRow {
  return {
    seq: message.seq,
    id: message.id,
    from: message.from,
    kind: message.kind,
    correlationId: message.correlationId,
    sentAt: message.sentAt,
    acceptedAt: new Date(message.acceptedAt).toISOString(),
    acked: message.ackedAt !== null,
    bodyLength: message.body.length,
    preview: message.body.slice(0, PREVIEW_CHARS),
    refs: message.refs,
  };
}
