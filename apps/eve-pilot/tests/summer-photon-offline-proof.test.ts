import { describe, expect, it, vi } from 'vitest';
import {
  createSummerPhotonOfflineProofHandler,
  type SummerPhotonProofRecord,
  spectrumSignature,
} from '../agent/lib/summer-photon-offline-proof';

const NOW = new Date('2026-09-02T05:00:00.000Z');
const TIMESTAMP = String(Math.floor(NOW.getTime() / 1000));
const SECRET = 'synthetic-test-signing-key-not-for-runtime';
const SENDER = 'synthetic-founder-only';
const THREAD = 'synthetic-thread-only';
const LINE = 'synthetic-summer-line';

function event(overrides: Record<string, unknown> = {}) {
  return {
    event: 'messages',
    message: {
      content: { text: 'SUMMER_OFFLINE_HEALTH', type: 'text' },
      direction: 'inbound',
      id: 'msg_synthetic_0001',
      platform: 'imessage',
      sender: { id: SENDER },
      space: { id: THREAD, phone: LINE },
      timestamp: NOW.toISOString(),
      ...overrides,
    },
  };
}

function signedRequest(body = event(), signatureSecret = SECRET) {
  const rawBody = JSON.stringify(body);
  return new Request('https://offline.invalid/eve/v1/photon', {
    method: 'POST',
    body: rawBody,
    headers: {
      'content-type': 'application/json',
      'x-spectrum-signature': spectrumSignature(
        rawBody,
        TIMESTAMP,
        signatureSecret
      ),
      'x-spectrum-timestamp': TIMESTAMP,
    },
  });
}

function harness() {
  const records = new Map<string, SummerPhotonProofRecord>();
  const persistImmutable = vi.fn(
    async (pathname: string, record: SummerPhotonProofRecord) => {
      if (records.has(pathname)) return 'exists' as const;
      records.set(pathname, record);
      return 'created' as const;
    }
  );
  const writeTestSink = vi.fn(async () => ({
    sinkReceiptId: 'sink_synthetic_0001',
  }));
  const dependencies = {
    allowedLineIds: new Set([LINE]),
    allowedSenderIds: new Set([SENDER]),
    allowedThreadIds: new Set([THREAD]),
    now: () => NOW,
    persistImmutable,
    signingSecret: SECRET,
    writeTestSink,
  };
  return { dependencies, persistImmutable, records, writeTestSink };
}

describe('offline Summer Photon proof', () => {
  it('accepts an authentic founder-only fixture into Summer and a zero-outbound sink', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new Error('network forbidden'));
    const proof = harness();
    const response = await createSummerPhotonOfflineProofHandler(
      proof.dependencies
    )(signedRequest());
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(202);
    expect(body).toMatchObject({
      code: 'offline_proof_completed',
      identity: 'summer',
      outbound: {
        mode: 'offline-test-sink',
        networkReachable: false,
        recipientReachable: false,
        threadReachable: false,
      },
      sinkReceiptId: 'sink_synthetic_0001',
    });
    expect(proof.writeTestSink).toHaveBeenCalledWith(
      expect.objectContaining({
        correlationId: expect.stringMatching(/^summer-photon:[a-f0-9]{64}$/u),
        identity: expect.objectContaining({
          pack: expect.objectContaining({ id: 'summer' }),
          instructions: expect.stringContaining(
            "Summer, Jovie's company operations identity"
          ),
        }),
        message: 'SUMMER_OFFLINE_HEALTH',
      })
    );
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it.each([
    ['missing', undefined],
    ['invalid', 'v0=00'],
  ])('refuses %s signatures before persistence', async (_name, signature) => {
    const proof = harness();
    const request = signedRequest();
    if (signature === undefined) {
      request.headers.delete('x-spectrum-signature');
    } else {
      request.headers.set('x-spectrum-signature', signature);
    }
    const response = await createSummerPhotonOfflineProofHandler(
      proof.dependencies
    )(request);

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      code: 'signature_refused',
    });
    expect(proof.persistImmutable).not.toHaveBeenCalled();
    expect(proof.writeTestSink).not.toHaveBeenCalled();
  });

  it('refuses a stale authentic signature', async () => {
    const proof = harness();
    const rawBody = JSON.stringify(event());
    const staleTimestamp = String(Number(TIMESTAMP) - 301);
    const response = await createSummerPhotonOfflineProofHandler(
      proof.dependencies
    )(
      new Request('https://offline.invalid/eve/v1/photon', {
        method: 'POST',
        body: rawBody,
        headers: {
          'x-spectrum-signature': spectrumSignature(
            rawBody,
            staleTimestamp,
            SECRET
          ),
          'x-spectrum-timestamp': staleTimestamp,
        },
      })
    );

    expect(response.status).toBe(401);
    expect(proof.persistImmutable).not.toHaveBeenCalled();
  });

  it.each([
    ['sender', { sender: { id: 'synthetic-other-sender' } }],
    ['thread', { space: { id: 'synthetic-other-thread', phone: LINE } }],
    ['line', { space: { id: THREAD, phone: 'synthetic-other-line' } }],
  ])('refuses every non-allowlisted %s', async (_name, overrides) => {
    const proof = harness();
    const response = await createSummerPhotonOfflineProofHandler(
      proof.dependencies
    )(signedRequest(event(overrides)));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      code: 'identity_or_thread_refused',
    });
    expect(proof.persistImmutable).not.toHaveBeenCalled();
    expect(proof.writeTestSink).not.toHaveBeenCalled();
  });

  it('persists privacy-safe correlation and terminal receipts without raw conversation data', async () => {
    const proof = harness();
    const response = await createSummerPhotonOfflineProofHandler(
      proof.dependencies
    )(signedRequest());

    expect(response.status).toBe(202);
    expect(proof.persistImmutable).toHaveBeenCalledTimes(2);
    const serialized = JSON.stringify([...proof.records.values()]);
    for (const rawValue of [SENDER, THREAD, LINE, 'SUMMER_OFFLINE_HEALTH']) {
      expect(serialized).not.toContain(rawValue);
    }
    expect(serialized).toContain('spectrum-hmac-v0');
    expect(serialized).toContain('isolated_summer_sink_completed');
  });

  it('rejects the same event after a handler restart before a second sink write', async () => {
    const proof = harness();
    const first = createSummerPhotonOfflineProofHandler(proof.dependencies);
    const restarted = createSummerPhotonOfflineProofHandler(proof.dependencies);

    expect((await first(signedRequest())).status).toBe(202);
    const replay = await restarted(signedRequest());

    expect(replay.status).toBe(409);
    await expect(replay.json()).resolves.toMatchObject({
      code: 'replay_refused',
      correlationId: expect.stringMatching(/^summer-photon:[a-f0-9]{64}$/u),
    });
    expect(proof.writeTestSink).toHaveBeenCalledTimes(1);
  });

  it('fails closed on persistence and sink uncertainty', async () => {
    const receiptFailure = harness();
    receiptFailure.persistImmutable.mockRejectedValueOnce(
      new Error('store unavailable')
    );
    const receiptResponse = await createSummerPhotonOfflineProofHandler(
      receiptFailure.dependencies
    )(signedRequest());
    expect(receiptResponse.status).toBe(503);
    expect(receiptFailure.writeTestSink).not.toHaveBeenCalled();

    const sinkFailure = harness();
    sinkFailure.writeTestSink.mockRejectedValueOnce(
      new Error('sink unavailable')
    );
    const sinkResponse = await createSummerPhotonOfflineProofHandler(
      sinkFailure.dependencies
    )(signedRequest());
    expect(sinkResponse.status).toBe(503);
    await expect(sinkResponse.json()).resolves.toMatchObject({
      code: 'isolated_sink_failed',
    });
  });
});
