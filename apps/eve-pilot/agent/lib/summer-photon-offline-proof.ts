import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import {
  assertEvePilotFactoryLock,
  bindEvePilotIdentity,
  type EvePilotBoundTurn,
} from '../select-identity';

const MAX_BODY_BYTES = 16 * 1024;
const MAX_SIGNATURE_AGE_SECONDS = 5 * 60;

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
  readonly now: () => Date;
  readonly persistImmutable: (
    pathname: string,
    record: SummerPhotonProofRecord
  ) => Promise<'created' | 'exists'>;
  readonly signingSecret: string;
  readonly writeTestSink: (input: {
    readonly correlationId: string;
    readonly identity: EvePilotBoundTurn;
    readonly message: string;
  }) => Promise<{ readonly sinkReceiptId: string }>;
};

function response(status: number, code: string, extra = {}) {
  return Response.json(
    { ok: status === 202, code, ...extra },
    { status, headers: { 'cache-control': 'no-store' } }
  );
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

async function readBoundedBody(request: Request): Promise<string> {
  const length = Number(request.headers.get('content-length'));
  if (Number.isFinite(length) && length > MAX_BODY_BYTES) {
    throw new Error('body_too_large');
  }
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.byteLength > MAX_BODY_BYTES) throw new Error('body_too_large');
  return new TextDecoder().decode(bytes);
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
  if (!input.signature || !input.timestamp || !input.secret) return false;
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
    if (!admitted(parsed.data, dependencies)) {
      return response(403, 'identity_or_thread_refused');
    }

    const event = parsed.data.message;
    const correlationKey = sha256(
      [event.id, event.sender.id, event.space.id, event.space.phone].join('\0')
    );
    const correlationId = `summer-photon:${correlationKey}`;
    const receiptPath = `summer-photon-proof/receipts/${correlationKey}.json`;
    const terminalPath = `summer-photon-proof/terminal/${correlationKey}.json`;
    const privacySafeSource = {
      eventDigest: sha256(event.id),
      lineDigest: sha256(event.space.phone),
      messageDigest: sha256(event.content.text),
      senderDigest: sha256(event.sender.id),
      threadDigest: sha256(event.space.id),
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
      acceptedAt: now.toISOString(),
      authority,
      correlationId,
      outbound,
      source: privacySafeSource,
      verdict: 'accepted_for_isolated_summer_sink',
    } satisfies SummerPhotonProofRecord;
    try {
      if (
        (await dependencies.persistImmutable(receiptPath, initial)) === 'exists'
      ) {
        return response(409, 'replay_refused', { correlationId });
      }
    } catch {
      return response(503, 'receipt_persistence_failed');
    }

    const identity = bindEvePilotIdentity('summer');
    assertEvePilotFactoryLock(identity);
    let sinkReceiptId: string;
    try {
      ({ sinkReceiptId } = await dependencies.writeTestSink({
        correlationId,
        identity,
        message: event.content.text,
      }));
    } catch {
      return response(503, 'isolated_sink_failed', { correlationId });
    }

    const terminal = {
      schema: 'jovie.eve.summer-photon-proof.terminal/v1',
      authority,
      correlationId,
      identity: 'summer',
      outbound,
      sinkReceiptId,
      source: privacySafeSource,
      terminalAt: dependencies.now().toISOString(),
      verdict: 'isolated_summer_sink_completed',
    } satisfies SummerPhotonProofRecord;
    try {
      if (
        (await dependencies.persistImmutable(terminalPath, terminal)) ===
        'exists'
      ) {
        return response(503, 'terminal_receipt_conflict', { correlationId });
      }
    } catch {
      return response(503, 'terminal_persistence_failed', { correlationId });
    }

    return response(202, 'offline_proof_completed', {
      correlationId,
      identity: 'summer',
      outbound,
      receiptPath,
      sinkReceiptId,
      terminalPath,
    });
  };
}
