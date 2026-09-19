import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type { SummerBottleneckStore } from './summer-bottleneck-loop';
import { createVercelBlobBottleneckStore } from './vercel-blob-bottleneck-runtime';

export const SUMMER_LIVENESS_HEARTBEAT_SCHEMA =
  'jovie.eve.summer-liveness-heartbeat/v1' as const;
export const SUMMER_LIVENESS_HEARTBEAT_CADENCE = '*/15 * * * *' as const;
export const SUMMER_LIVENESS_HEARTBEAT_CADENCE_MS = 15 * 60 * 1000;
export const SUMMER_LIVENESS_SILENCE_MS =
  2 * SUMMER_LIVENESS_HEARTBEAT_CADENCE_MS;
export const SUMMER_LIVENESS_EVENT_PREFIX = 'summer-bottleneck/events/';
export const SUMMER_LIVENESS_RECEIPT_PREFIX =
  'summer-liveness-heartbeat/receipts/';
export const SUMMER_LIVENESS_EVENT_DRIVEN_RERANK_TRIGGERS = [
  'land',
  'ci',
  'signal',
  'founder',
  'gsc',
  'intake',
] as const;
export const SUPERSEDED_CODEX_EMPTY_TURN =
  '01a05f69-5b89-7db0-81fe-96fe21aae443' as const;

export type SummerLivenessDecision =
  | 'healthy-noop'
  | 'delivery-silent'
  | 'delivery-failing';

export type SummerLivenessEventDeliveryStatus =
  | 'healthy'
  | 'silent'
  | 'failing';

export type SummerLivenessEventDelivery = {
  readonly status: SummerLivenessEventDeliveryStatus;
  readonly ingressReadable: boolean;
  readonly lastInboundEventAt: string | null;
  readonly lastInboundEventId: string | null;
  readonly observedEventCount: number;
  readonly lastFailureReason: string | null;
  readonly expectedDeliveryBy: string | null;
};

export type SummerLivenessBacklogRerankLock = {
  readonly invoked: false;
  readonly mode: 'event-driven-only';
  readonly allowedTriggers: typeof SUMMER_LIVENESS_EVENT_DRIVEN_RERANK_TRIGGERS;
};

export type SummerLivenessHeartbeatRecord = Readonly<Record<string, unknown>>;

export type SummerLivenessHeartbeatDependencies = {
  readonly now: () => Date;
  readonly store: SummerBottleneckStore;
  readonly receiptSigningKey: string;
  readonly receiptSigningKeyId: string;
  readonly observeExpectedDelivery?: () => Promise<{
    readonly expectedDeliveryBy: string | null;
  }>;
};

const KEY_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{2,63}$/u;
const EVENT_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{7,127}$/u;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => `${JSON.stringify(key)}:${canonical(child)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function digest(value: unknown): string {
  return createHash('sha256').update(canonical(value)).digest('hex');
}

export function livenessTickId(now: Date): string {
  const bucket = new Date(now.getTime());
  const minutes = bucket.getUTCMinutes();
  bucket.setUTCMinutes(Math.floor(minutes / 15) * 15, 0, 0);
  return `summer-liveness:${bucket.toISOString()}`;
}

export function livenessReceiptPath(tickId: string): string {
  return `${SUMMER_LIVENESS_RECEIPT_PREFIX}${tickId.replace(/:/g, '-')}.json`;
}

export const EVENT_DRIVEN_RERANK_LOCK: SummerLivenessBacklogRerankLock = {
  invoked: false,
  mode: 'event-driven-only',
  allowedTriggers: SUMMER_LIVENESS_EVENT_DRIVEN_RERANK_TRIGGERS,
};

function identificationFor(
  decision: SummerLivenessDecision,
  delivery: SummerLivenessEventDelivery
): string {
  if (decision === 'healthy-noop') {
    return 'Eve-owned 15m liveness heartbeat: event delivery healthy; signed no-op, nothing to do.';
  }
  if (decision === 'delivery-silent') {
    return `Eve-owned 15m liveness heartbeat: event delivery silent since ${
      delivery.lastInboundEventAt ?? 'never'
    }; expected by ${delivery.expectedDeliveryBy ?? 'unknown'}.`;
  }
  return `Eve-owned 15m liveness heartbeat: event delivery failing (${
    delivery.lastFailureReason ?? 'unspecified-ingress-failure'
  }).`;
}

export function isEmptyLivenessTurn(value: unknown): boolean {
  if (!isRecord(value)) return true;
  const identification = value.identification;
  if (typeof identification !== 'string' || identification.trim() === '') {
    return true;
  }
  if (value.schema !== SUMMER_LIVENESS_HEARTBEAT_SCHEMA) return true;
  if (value.terminal !== true) return true;
  if (
    value.decision !== 'healthy-noop' &&
    value.decision !== 'delivery-silent' &&
    value.decision !== 'delivery-failing'
  ) {
    return true;
  }
  return false;
}

function signedReceipt(
  receipt: SummerLivenessHeartbeatRecord,
  signingKey: string,
  signingKeyId: string,
  receiptPath: string
): SummerLivenessHeartbeatRecord {
  if (!signingKey || !KEY_ID.test(signingKeyId)) {
    throw new Error('liveness receipt signing authority is unavailable');
  }
  const {
    signature: _existingSignature,
    receiptPath: _existingPath,
    signatureKeyId: _existingKeyId,
    ...body
  } = receipt;
  const unsigned = { ...body, receiptPath, signatureKeyId: signingKeyId };
  const signature = createHmac('sha256', signingKey)
    .update(
      `${SUMMER_LIVENESS_HEARTBEAT_SCHEMA}\0${receiptPath}\0${canonical(
        unsigned
      )}`
    )
    .digest('hex');
  return { ...unsigned, signature: `v1=${signature}` };
}

export function verifySummerLivenessReceipt(
  input: SummerLivenessHeartbeatRecord,
  signingKey: string,
  expectedPath = input.receiptPath
): boolean {
  if (!signingKey || isEmptyLivenessTurn(input)) return false;
  const signature = input.signature;
  if (typeof signature !== 'string' || !/^v1=[0-9a-f]{64}$/u.test(signature)) {
    return false;
  }
  const keyId = input.signatureKeyId;
  if (typeof keyId !== 'string' || !KEY_ID.test(keyId)) return false;
  if (
    typeof input.receiptPath !== 'string' ||
    typeof expectedPath !== 'string' ||
    input.receiptPath !== expectedPath
  ) {
    return false;
  }
  const { signature: _removed, ...unsigned } = input;
  const expected = signedReceipt(
    unsigned,
    signingKey,
    keyId,
    expectedPath
  ).signature;
  if (typeof expected !== 'string') return false;
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

function decide(
  delivery: SummerLivenessEventDelivery,
  now: Date
): SummerLivenessDecision {
  if (!delivery.ingressReadable || delivery.lastFailureReason) {
    return 'delivery-failing';
  }
  const expectedBy = Date.parse(delivery.expectedDeliveryBy ?? '');
  if (Number.isFinite(expectedBy) && expectedBy <= now.getTime()) {
    const lastEvent = Date.parse(delivery.lastInboundEventAt ?? '');
    if (!Number.isFinite(lastEvent) || lastEvent < expectedBy) {
      return 'delivery-silent';
    }
  }
  return 'healthy-noop';
}

function statusFor(
  decision: SummerLivenessDecision
): SummerLivenessEventDeliveryStatus {
  if (decision === 'healthy-noop') return 'healthy';
  if (decision === 'delivery-silent') return 'silent';
  return 'failing';
}

async function observeEventDelivery(
  dependencies: SummerLivenessHeartbeatDependencies
): Promise<SummerLivenessEventDelivery> {
  const expected =
    (await dependencies.observeExpectedDelivery?.()) ?? {
      expectedDeliveryBy: null,
    };
  try {
    const page = await dependencies.store.list(SUMMER_LIVENESS_EVENT_PREFIX, {
      limit: 25,
    });
    let lastInboundEventAt: string | null = null;
    let lastInboundEventId: string | null = null;
    let lastEventMs = Number.NEGATIVE_INFINITY;
    for (const entry of page.entries) {
      const event = entry.record;
      const snapshot = isRecord(event.snapshot) ? event.snapshot : event;
      const observedAt =
        typeof snapshot.observedAt === 'string' ? snapshot.observedAt : null;
      const eventId =
        typeof snapshot.eventId === 'string'
          ? snapshot.eventId
          : typeof event.eventId === 'string'
            ? event.eventId
            : null;
      const observedMs = observedAt ? Date.parse(observedAt) : Number.NaN;
      if (
        !observedAt ||
        !eventId ||
        !EVENT_ID.test(eventId) ||
        !Number.isFinite(observedMs)
      ) {
        continue;
      }
      if (observedMs >= lastEventMs) {
        lastEventMs = observedMs;
        lastInboundEventAt = observedAt;
        lastInboundEventId = eventId;
      }
    }
    return {
      status: 'healthy',
      ingressReadable: true,
      lastInboundEventAt,
      lastInboundEventId,
      observedEventCount: page.scanned,
      lastFailureReason: null,
      expectedDeliveryBy: expected.expectedDeliveryBy,
    };
  } catch (error) {
    return {
      status: 'failing',
      ingressReadable: false,
      lastInboundEventAt: null,
      lastInboundEventId: null,
      observedEventCount: 0,
      lastFailureReason:
        error instanceof Error ? error.message : 'event-ingress-unreadable',
      expectedDeliveryBy: expected.expectedDeliveryBy,
    };
  }
}

function buildReceipt(input: {
  readonly now: Date;
  readonly tickId: string;
  readonly receiptPath: string;
  readonly decision: SummerLivenessDecision;
  readonly delivery: SummerLivenessEventDelivery;
}): SummerLivenessHeartbeatRecord {
  const delivery = {
    ...input.delivery,
    status: statusFor(input.decision),
  };
  return {
    schema: SUMMER_LIVENESS_HEARTBEAT_SCHEMA,
    tickId: input.tickId,
    observedAt: input.now.toISOString(),
    owner: 'Eve',
    principal: 'Summer',
    trigger: 'eve-schedule',
    cadence: SUMMER_LIVENESS_HEARTBEAT_CADENCE,
    decision: input.decision,
    terminal: true,
    identification: identificationFor(input.decision, delivery),
    eventDelivery: delivery,
    backlogRerank: EVENT_DRIVEN_RERANK_LOCK,
    supersedes: {
      path: 'codex-five-minute-heartbeat',
      reason: 'empty-completed-turns-fail-closed',
      emptyTurnId: SUPERSEDED_CODEX_EMPTY_TURN,
    },
    issue: 'JOV-5853',
    receiptPath: input.receiptPath,
  };
}

async function persistReceipt(
  dependencies: SummerLivenessHeartbeatDependencies,
  receipt: SummerLivenessHeartbeatRecord
): Promise<SummerLivenessHeartbeatRecord> {
  const receiptPath = String(receipt.receiptPath);
  const result = await dependencies.store.create(receiptPath, receipt);
  if (result === 'created') return receipt;
  const existing = await dependencies.store.read(receiptPath);
  if (!existing || digest(existing) !== digest(receipt)) {
    throw new Error('liveness terminal receipt conflict');
  }
  return existing;
}

export function assertNonEmptyLivenessReceipt(
  value: unknown
): asserts value is SummerLivenessHeartbeatRecord {
  if (isEmptyLivenessTurn(value)) {
    throw new Error(
      'empty completed liveness turn fails closed; Codex 5m empty turns do not count'
    );
  }
}

export async function runSummerLivenessHeartbeat(
  dependencies: SummerLivenessHeartbeatDependencies
): Promise<SummerLivenessHeartbeatRecord> {
  const now = dependencies.now();
  const tickId = livenessTickId(now);
  const receiptPath = livenessReceiptPath(tickId);
  try {
    const observed = await observeEventDelivery(dependencies);
    const decision = decide(observed, now);
    const unsigned = buildReceipt({
      now,
      tickId,
      receiptPath,
      decision,
      delivery: observed,
    });
    const signed = signedReceipt(
      unsigned,
      dependencies.receiptSigningKey,
      dependencies.receiptSigningKeyId,
      receiptPath
    );
    assertNonEmptyLivenessReceipt(signed);
    if (!verifySummerLivenessReceipt(signed, dependencies.receiptSigningKey)) {
      throw new Error('signed liveness receipt failed verification');
    }
    const persisted = await persistReceipt(dependencies, signed);
    assertNonEmptyLivenessReceipt(persisted);
    return persisted;
  } catch (error) {
    const failing = buildReceipt({
      now,
      tickId,
      receiptPath,
      decision: 'delivery-failing',
      delivery: {
        status: 'failing',
        ingressReadable: false,
        lastInboundEventAt: null,
        lastInboundEventId: null,
        observedEventCount: 0,
        lastFailureReason:
          error instanceof Error ? error.message : 'liveness-heartbeat-failed',
        expectedDeliveryBy: null,
      },
    });
    try {
      const signed = signedReceipt(
        failing,
        dependencies.receiptSigningKey,
        dependencies.receiptSigningKeyId,
        receiptPath
      );
      assertNonEmptyLivenessReceipt(signed);
      return signed;
    } catch {
      assertNonEmptyLivenessReceipt(failing);
      return failing;
    }
  }
}

export function summerLivenessHeartbeatFromEnvironment(
  environment: Readonly<Record<string, string | undefined>> = process.env,
  store: SummerBottleneckStore = createVercelBlobBottleneckStore()
): SummerLivenessHeartbeatDependencies {
  return {
    store,
    now: () => new Date(),
    receiptSigningKey:
      environment.SUMMER_BOTTLENECK_RECEIPT_SIGNING_KEY?.trim() ?? '',
    receiptSigningKeyId:
      environment.SUMMER_BOTTLENECK_RECEIPT_SIGNING_KEY_ID?.trim() ??
      'eve-liveness-receipts',
  };
}
