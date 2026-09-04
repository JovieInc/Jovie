import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import {
  assertEvePilotFactoryLock,
  bindEvePilotIdentity,
} from '../select-identity';

const MAX_BODY_BYTES = 16 * 1024;
const MAX_SIGNATURE_AGE_SECONDS = 5 * 60;
const MAX_EVENT_AGE_MS = MAX_SIGNATURE_AGE_SECONDS * 1000;
const MAX_EVENT_CLOCK_SKEW_MS = 60 * 1000;

const spectrumEventSchema = z
  .object({
    event: z.literal('messages'),
    message: z
      .object({
        content: z
          .object({
            text: z.string().trim().min(1).max(4000),
            type: z.literal('text'),
          })
          .strict(),
        direction: z.literal('inbound'),
        id: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{7,127}$/u),
        platform: z.literal('imessage'),
        sender: z.object({ id: z.string().trim().min(1).max(256) }).strict(),
        space: z
          .object({
            id: z.string().trim().min(1).max(256),
            phone: z.string().trim().min(1).max(64),
          })
          .strict(),
        timestamp: z.string().datetime({ offset: true }),
      })
      .strict(),
  })
  .strict();

type SpectrumEvent = z.infer<typeof spectrumEventSchema>;
export type SummerPhotonProofRecord = Readonly<Record<string, unknown>>;

export type SummerPhotonProofDependencies = {
  readonly allowedLineIds: ReadonlySet<string>;
  readonly allowedSenderIds: ReadonlySet<string>;
  readonly allowedThreadIds: ReadonlySet<string>;
  readonly idempotencyKey: string;
  readonly idempotencyKeyId: string;
  readonly now: () => Date;
  readonly persistImmutable: (
    pathname: string,
    record: SummerPhotonProofRecord
  ) => Promise<'created' | 'exists'>;
  readonly readRecord: (
    pathname: string
  ) => Promise<SummerPhotonProofRecord | null>;
  readonly privacyKey: string;
  readonly privacyKeyId: string;
  readonly signingSecret: string;
};

function response(status: number, code: string, extra = {}) {
  return Response.json(
    { ok: status === 202, code, ...extra },
    { status, headers: { 'cache-control': 'no-store' } }
  );
}

function privateDigest(
  domain: 'event' | 'line' | 'sender' | 'sink' | 'thread',
  value: string,
  key: string
): string {
  return createHmac('sha256', key)
    .update(`summer-photon-proof:${domain}\0${value}`)
    .digest('hex');
}

function sameRecord(
  left: SummerPhotonProofRecord | null,
  right: SummerPhotonProofRecord
): boolean {
  return left !== null && JSON.stringify(left) === JSON.stringify(right);
}

async function readBoundedBody(request: Request): Promise<string> {
  const length = Number(request.headers.get('content-length'));
  if (Number.isFinite(length) && length > MAX_BODY_BYTES) {
    throw new Error('body_too_large');
  }
  if (!request.body) return '';
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let byteLength = 0;
  let body = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    byteLength += value.byteLength;
    if (byteLength > MAX_BODY_BYTES) {
      await reader.cancel();
      throw new Error('body_too_large');
    }
    body += decoder.decode(value, { stream: true });
  }
  return body + decoder.decode();
}

export function spectrumSignature(
  rawBody: string,
  timestamp: string,
  secret: string
): string {
  return `v0=${createHmac('sha256', secret)
    .update(`v0:${timestamp}:${rawBody}`)
    .digest('hex')}`;
}

export function verifySpectrumSignature(input: {
  readonly nowSeconds: number;
  readonly rawBody: string;
  readonly secret: string;
  readonly signature: string | null;
  readonly timestamp: string | null;
}): boolean {
  if (
    !Number.isFinite(input.nowSeconds) ||
    !input.signature ||
    !input.timestamp ||
    !input.secret
  )
    return false;
  const timestamp = Number(input.timestamp);
  if (
    !Number.isFinite(timestamp) ||
    Math.abs(input.nowSeconds - timestamp) > MAX_SIGNATURE_AGE_SECONDS
  ) {
    return false;
  }
  const expected = Buffer.from(
    spectrumSignature(input.rawBody, input.timestamp, input.secret)
  );
  const actual = Buffer.from(input.signature);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function admitted(
  event: SpectrumEvent,
  dependencies: SummerPhotonProofDependencies
): boolean {
  return (
    dependencies.allowedSenderIds.size === 1 &&
    dependencies.allowedThreadIds.size === 1 &&
    dependencies.allowedLineIds.size === 1 &&
    dependencies.allowedSenderIds.has(event.message.sender.id) &&
    dependencies.allowedThreadIds.has(event.message.space.id) &&
    dependencies.allowedLineIds.has(event.message.space.phone)
  );
}

export function createSummerPhotonOfflineProofHandler(
  dependencies: SummerPhotonProofDependencies
): (request: Request) => Promise<Response> {
  return async request => {
    let rawBody: string;
    try {
      rawBody = await readBoundedBody(request);
    } catch {
      return response(413, 'body_too_large');
    }

    const now = dependencies.now();
    if (
      !Number.isFinite(now.getTime()) ||
      dependencies.idempotencyKey.length < 32 ||
      dependencies.privacyKey.length < 32 ||
      dependencies.idempotencyKey === dependencies.privacyKey ||
      dependencies.idempotencyKey === dependencies.signingSecret ||
      dependencies.privacyKey === dependencies.signingSecret ||
      !/^[A-Za-z0-9][A-Za-z0-9._-]{2,63}$/u.test(
        dependencies.idempotencyKeyId
      ) ||
      !/^[A-Za-z0-9][A-Za-z0-9._-]{2,63}$/u.test(dependencies.privacyKeyId)
    ) {
      return response(503, 'proof_configuration_invalid');
    }
    if (
      !verifySpectrumSignature({
        nowSeconds: Math.floor(now.getTime() / 1000),
        rawBody,
        secret: dependencies.signingSecret,
        signature: request.headers.get('x-spectrum-signature'),
        timestamp: request.headers.get('x-spectrum-timestamp'),
      })
    ) {
      return response(401, 'signature_refused');
    }

    let input: unknown;
    try {
      input = JSON.parse(rawBody);
    } catch {
      return response(400, 'invalid_json');
    }
    const parsed = spectrumEventSchema.safeParse(input);
    if (!parsed.success) return response(422, 'invalid_event');
    const eventAgeMs =
      now.getTime() - Date.parse(parsed.data.message.timestamp);
    if (
      eventAgeMs > MAX_EVENT_AGE_MS ||
      eventAgeMs < -MAX_EVENT_CLOCK_SKEW_MS
    ) {
      return response(422, 'event_outside_freshness_window');
    }
    if (!admitted(parsed.data, dependencies)) {
      return response(403, 'identity_or_thread_refused');
    }

    const event = parsed.data.message;
    const correlationKey = privateDigest(
      'event',
      [event.id, event.sender.id, event.space.id, event.space.phone].join('\0'),
      dependencies.idempotencyKey
    );
    const correlationId = `summer-photon:${correlationKey}`;
    const receiptPath = `summer-photon-proof/receipts/${correlationKey}.json`;
    const terminalPath = `summer-photon-proof/terminal/${correlationKey}.json`;
    const privacySafeSource = {
      eventDigest: privateDigest(
        'event',
        `${event.id}\0${event.timestamp}`,
        dependencies.privacyKey
      ),
      idempotencyKeyId: dependencies.idempotencyKeyId,
      lineDigest: privateDigest(
        'line',
        event.space.phone,
        dependencies.privacyKey
      ),
      senderDigest: privateDigest(
        'sender',
        event.sender.id,
        dependencies.privacyKey
      ),
      threadDigest: privateDigest(
        'thread',
        event.space.id,
        dependencies.privacyKey
      ),
      privacyKeyId: dependencies.privacyKeyId,
      verifiedBy: 'spectrum-hmac-v0',
    };
    const authority = {
      allowedLineCount: 1,
      allowedSenderCount: 1,
      allowedThreadCount: 1,
      dispatchAuthority: 'none',
      founderOnly: true,
    };
    const outbound = {
      mode: 'offline-test-sink',
      networkReachable: false,
      recipientReachable: false,
      threadReachable: false,
    };

    const initial = {
      schema: 'jovie.eve.summer-photon-proof.receipt/v1',
      acceptedAt: event.timestamp,
      authority,
      correlationId,
      outbound,
      source: privacySafeSource,
      verdict: 'accepted_for_isolated_summer_sink',
    } satisfies SummerPhotonProofRecord;
    const identity = bindEvePilotIdentity('summer');
    assertEvePilotFactoryLock(identity);
    const sinkReceiptId = `sink_${privateDigest(
      'sink',
      correlationId,
      dependencies.privacyKey
    ).slice(0, 32)}`;
    const terminal = {
      schema: 'jovie.eve.summer-photon-proof.terminal/v1',
      authority,
      correlationId,
      identity: 'summer',
      outbound,
      sinkReceiptId,
      source: privacySafeSource,
      terminalAt: event.timestamp,
      verdict: 'isolated_summer_sink_completed',
    } satisfies SummerPhotonProofRecord;

    let initialWrite: 'created' | 'exists';
    try {
      initialWrite = await dependencies.persistImmutable(receiptPath, initial);
    } catch {
      return response(503, 'receipt_persistence_failed');
    }
    if (initialWrite === 'exists') {
      try {
        if (!sameRecord(await dependencies.readRecord(receiptPath), initial)) {
          return response(409, 'replay_refused', { correlationId });
        }
      } catch {
        return response(503, 'receipt_read_failed', { correlationId });
      }
    }
    try {
      const terminalWrite = await dependencies.persistImmutable(
        terminalPath,
        terminal
      );
      if (terminalWrite === 'exists') {
        let existingTerminal: SummerPhotonProofRecord | null;
        try {
          existingTerminal = await dependencies.readRecord(terminalPath);
        } catch {
          return response(503, 'terminal_read_failed', { correlationId });
        }
        if (!sameRecord(existingTerminal, terminal)) {
          return response(409, 'terminal_receipt_conflict', { correlationId });
        }
        return response(202, 'offline_proof_reconciled', {
          correlationId,
          identity: 'summer',
          outbound,
          receiptPath,
          sinkReceiptId,
          terminalPath,
        });
      }
    } catch {
      return response(503, 'terminal_persistence_failed', { correlationId });
    }

    return response(
      202,
      initialWrite === 'created'
        ? 'offline_proof_completed'
        : 'offline_proof_reconciled',
      {
        correlationId,
        identity: 'summer',
        outbound,
        receiptPath,
        sinkReceiptId,
        terminalPath,
      }
    );
  };
}
