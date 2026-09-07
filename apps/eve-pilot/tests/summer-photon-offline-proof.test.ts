import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  createSummerPhotonOfflineProofHandler,
  type SummerPhotonProofRecord,
  spectrumSignature,
} from '../agent/lib/summer-photon-offline-proof';

const NOW = new Date('2026-09-02T05:00:00.000Z');
const TIMESTAMP = String(Math.floor(NOW.getTime() / 1000));
const SECRET = 'synthetic-test-signing-key-not-for-runtime';
const PRIVACY_KEY = 'synthetic-private-digest-key-not-for-runtime';
const PRIVACY_KEY_ID = 'photon-privacy-2026-09';
const IDEMPOTENCY_KEY = 'synthetic-stable-idempotency-key-not-runtime';
const IDEMPOTENCY_KEY_ID = 'photon-idempotency-v1';
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
  return signedRawRequest(rawBody, signatureSecret);
}

function signedRawRequest(rawBody: string, signatureSecret = SECRET) {
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
  const dependencies = {
    allowedLineIds: new Set([LINE]),
    allowedSenderIds: new Set([SENDER]),
    allowedThreadIds: new Set([THREAD]),
    idempotencyKey: IDEMPOTENCY_KEY,
    idempotencyKeyId: IDEMPOTENCY_KEY_ID,
    now: () => NOW,
    persistImmutable,
    readRecord: vi.fn(
      async (pathname: string) => records.get(pathname) ?? null
    ),
    privacyKey: PRIVACY_KEY,
    privacyKeyId: PRIVACY_KEY_ID,
    signingSecret: SECRET,
  };
  return { dependencies, persistImmutable, records };
}

describe('offline Summer Photon proof', () => {
  it('contains no network, process, filesystem, or arbitrary sink capability', () => {
    const source = readFileSync(
      new URL('../agent/lib/summer-photon-offline-proof.ts', import.meta.url),
      'utf8'
    );
    expect(source).not.toMatch(
      /node:(?:http|https|net|tls|child_process|fs)|globalThis\.fetch|writeTestSink/u
    );
  });

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
      sinkReceiptId: expect.stringMatching(/^sink_[a-f0-9]{32}$/u),
    });
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

  it('fails closed when the injected clock or privacy authority is invalid', async () => {
    const badClock = harness();
    badClock.dependencies.now = () => new Date('invalid');
    const badClockResponse = await createSummerPhotonOfflineProofHandler(
      badClock.dependencies
    )(signedRequest());
    expect(badClockResponse.status).toBe(503);
    await expect(badClockResponse.json()).resolves.toMatchObject({
      code: 'proof_configuration_invalid',
    });

    const noPrivacyKey = harness();
    noPrivacyKey.dependencies.privacyKey = '';
    const noKeyResponse = await createSummerPhotonOfflineProofHandler(
      noPrivacyKey.dependencies
    )(signedRequest());
    expect(noKeyResponse.status).toBe(503);
    expect(noPrivacyKey.persistImmutable).not.toHaveBeenCalled();

    const reusedKey = harness();
    reusedKey.dependencies.privacyKey = SECRET;
    expect(
      (
        await createSummerPhotonOfflineProofHandler(reusedKey.dependencies)(
          signedRequest()
        )
      ).status
    ).toBe(503);

    const reusedIdempotencyKey = harness();
    reusedIdempotencyKey.dependencies.idempotencyKey = PRIVACY_KEY;
    expect(
      (
        await createSummerPhotonOfflineProofHandler(
          reusedIdempotencyKey.dependencies
        )(signedRequest())
      ).status
    ).toBe(503);
  });

  it.each([
    ['stale', '2026-09-02T04:54:59.000Z'],
    ['future', '2026-09-02T05:01:01.000Z'],
  ])('refuses a current signature carrying a %s embedded event timestamp', async (_name, timestamp) => {
    const proof = harness();
    const response = await createSummerPhotonOfflineProofHandler(
      proof.dependencies
    )(signedRequest(event({ timestamp })));

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({
      code: 'event_outside_freshness_window',
    });
    expect(proof.persistImmutable).not.toHaveBeenCalled();
  });

  it('rejects a validly signed malformed JSON body', async () => {
    const proof = harness();
    const response = await createSummerPhotonOfflineProofHandler(
      proof.dependencies
    )(signedRawRequest('{not-json'));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: 'invalid_json',
    });
    expect(proof.persistImmutable).not.toHaveBeenCalled();
  });

  it.each([
    'declared',
    'streamed',
  ])('rejects an oversized %s body before signature verification', async mode => {
    const proof = harness();
    const rawBody = 'x'.repeat(16 * 1024 + 1);
    const oversized = signedRawRequest(rawBody);
    if (mode === 'declared') {
      oversized.headers.set('content-length', String(rawBody.length));
    }

    const response = await createSummerPhotonOfflineProofHandler(
      proof.dependencies
    )(oversized);

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toMatchObject({
      code: 'body_too_large',
    });
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

  it('idempotently reconciles the same completed event after a handler restart', async () => {
    const proof = harness();
    const first = createSummerPhotonOfflineProofHandler(proof.dependencies);
    const restarted = createSummerPhotonOfflineProofHandler(proof.dependencies);

    expect((await first(signedRequest())).status).toBe(202);
    const replay = await restarted(signedRequest());

    expect(replay.status).toBe(202);
    await expect(replay.json()).resolves.toMatchObject({
      code: 'offline_proof_reconciled',
      correlationId: expect.stringMatching(/^summer-photon:[a-f0-9]{64}$/u),
    });
  });

  it('does not admit the same event again after privacy-key rotation', async () => {
    const proof = harness();
    expect(
      (
        await createSummerPhotonOfflineProofHandler(proof.dependencies)(
          signedRequest()
        )
      ).status
    ).toBe(202);
    const rotated = {
      ...proof.dependencies,
      privacyKey: 'rotated-private-digest-key-not-for-runtime',
      privacyKeyId: 'photon-privacy-2026-10',
    };

    const replay = await createSummerPhotonOfflineProofHandler(rotated)(
      signedRequest()
    );
    expect(replay.status).toBe(409);
    expect(proof.records.size).toBe(2);
  });

  it('fails closed on initial receipt persistence uncertainty', async () => {
    const receiptFailure = harness();
    receiptFailure.persistImmutable.mockRejectedValueOnce(
      new Error('store unavailable')
    );
    const receiptResponse = await createSummerPhotonOfflineProofHandler(
      receiptFailure.dependencies
    )(signedRequest());
    expect(receiptResponse.status).toBe(503);
  });

  it('fails closed when an existing terminal receipt does not match', async () => {
    const proof = harness();
    proof.persistImmutable
      .mockResolvedValueOnce('created')
      .mockResolvedValueOnce('exists');

    const response = await createSummerPhotonOfflineProofHandler(
      proof.dependencies
    )(signedRequest());

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      code: 'terminal_receipt_conflict',
    });
  });

  it('fails closed when an existing terminal receipt cannot be read', async () => {
    const proof = harness();
    proof.persistImmutable
      .mockResolvedValueOnce('created')
      .mockResolvedValueOnce('exists');
    proof.dependencies.readRecord.mockRejectedValueOnce(
      new Error('terminal unavailable')
    );

    const response = await createSummerPhotonOfflineProofHandler(
      proof.dependencies
    )(signedRequest());

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      code: 'terminal_read_failed',
    });
  });

  it('fails closed when terminal persistence is unavailable', async () => {
    const proof = harness();
    proof.persistImmutable
      .mockResolvedValueOnce('created')
      .mockRejectedValueOnce(new Error('terminal store unavailable'));

    const response = await createSummerPhotonOfflineProofHandler(
      proof.dependencies
    )(signedRequest());

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      code: 'terminal_persistence_failed',
    });
  });

  it('resumes terminalization only when the immutable claim matches', async () => {
    const proof = harness();
    const normalPersist = proof.persistImmutable.getMockImplementation();
    proof.persistImmutable
      .mockImplementationOnce(normalPersist!)
      .mockRejectedValueOnce(new Error('terminal store unavailable'));
    const first = await createSummerPhotonOfflineProofHandler(
      proof.dependencies
    )(signedRequest());
    expect(first.status).toBe(503);

    proof.persistImmutable.mockImplementation(normalPersist!);
    const reconciled = await createSummerPhotonOfflineProofHandler(
      proof.dependencies
    )(signedRequest());

    expect(reconciled.status).toBe(202);
    await expect(reconciled.json()).resolves.toMatchObject({
      code: 'offline_proof_reconciled',
    });
    expect(proof.records.size).toBe(2);
  });

  it('resumes terminalization after time advances within the freshness window', async () => {
    const proof = harness();
    const normalPersist = proof.persistImmutable.getMockImplementation();
    proof.persistImmutable
      .mockImplementationOnce(normalPersist!)
      .mockRejectedValueOnce(new Error('terminal store unavailable'));
    expect(
      (
        await createSummerPhotonOfflineProofHandler(proof.dependencies)(
          signedRequest()
        )
      ).status
    ).toBe(503);

    proof.persistImmutable.mockImplementation(normalPersist!);
    const reconciled = await createSummerPhotonOfflineProofHandler({
      ...proof.dependencies,
      now: () => new Date(NOW.getTime() + 30_000),
    })(signedRequest());

    expect(reconciled.status).toBe(202);
    await expect(reconciled.json()).resolves.toMatchObject({
      code: 'offline_proof_reconciled',
    });
  });

  it('rejects a replay when the stored claim differs', async () => {
    const proof = harness();
    proof.persistImmutable.mockResolvedValueOnce('exists');
    proof.dependencies.readRecord.mockResolvedValueOnce({
      schema: 'jovie.eve.summer-photon-proof.receipt/v1',
      verdict: 'different-claim',
    });

    const response = await createSummerPhotonOfflineProofHandler(
      proof.dependencies
    )(signedRequest());

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      code: 'replay_refused',
    });
    expect(proof.persistImmutable).toHaveBeenCalledTimes(1);
  });

  it('fails closed when an existing immutable claim cannot be read', async () => {
    const proof = harness();
    proof.persistImmutable.mockResolvedValueOnce('exists');
    proof.dependencies.readRecord.mockRejectedValueOnce(
      new Error('record unavailable')
    );

    const response = await createSummerPhotonOfflineProofHandler(
      proof.dependencies
    )(signedRequest());

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      code: 'receipt_read_failed',
    });
  });
});
