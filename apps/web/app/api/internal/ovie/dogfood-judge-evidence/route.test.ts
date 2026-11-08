import { NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { verifyCronRequestMock, upsertMock, envMock } = vi.hoisted(() => ({
  verifyCronRequestMock: vi.fn(),
  upsertMock: vi.fn(),
  envMock: { DOGFOOD_JUDGE_SIGNING_KEY: 'signing-key' as string | undefined },
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/cron/auth', () => ({
  verifyCronRequest: verifyCronRequestMock,
}));
vi.mock('@/lib/env-server', () => ({ env: envMock }));
vi.mock('@/lib/agent-os/dogfood-judge-runtime-store', () => ({
  getDogfoodJudgeLedger: () => ({ replace: upsertMock }),
}));
vi.mock('@/lib/utils/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn() },
}));

import { signDogfoodJudgeDigest } from '@/lib/agent-os/dogfood-judge-ledger';
import { POST } from './route';

const SHA = 'a'.repeat(40);
const DIGEST = 'c'.repeat(64);

function record(overrides: Record<string, unknown> = {}) {
  return {
    verdict: 'pass',
    sourceSha: SHA,
    fingerprint: 'fp',
    judgedAt: '2026-10-29T10:00:00.000Z',
    runId: 'run-1',
    nothingWrong: true,
    reasons: [],
    steps: 4,
    failingSteps: [],
    digest: DIGEST,
    signature: {
      alg: 'hmac-sha256',
      keyId: 'k1',
      value: signDogfoodJudgeDigest('signing-key', DIGEST),
    },
    ...overrides,
  };
}

function body(
  surfaceOverrides: Record<string, unknown> = {},
  top: Record<string, unknown> = {}
) {
  return {
    ledger: {
      schema: 'jovie.dogfood-judge-ledger/v1',
      currentFingerprint: 'fp',
      requiredSurfaces: ['outbound-review-cards'],
      publishedAt: '2026-10-29T10:00:00.000Z',
      surfaces: { 'outbound-review-cards': record(surfaceOverrides) },
      ...top,
    },
  };
}

function post(payload: unknown) {
  return POST(
    new Request('https://jov.ie/api/internal/ovie/dogfood-judge-evidence', {
      method: 'POST',
      headers: { authorization: 'Bearer secret' },
      body: typeof payload === 'string' ? payload : JSON.stringify(payload),
    })
  );
}

describe('POST /api/internal/ovie/dogfood-judge-evidence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    envMock.DOGFOOD_JUDGE_SIGNING_KEY = 'signing-key';
    verifyCronRequestMock.mockReturnValue(null);
    upsertMock.mockResolvedValue({ written: true });
  });

  it('returns the auth failure without parsing', async () => {
    verifyCronRequestMock.mockReturnValue(
      NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    );
    expect((await post(body())).status).toBe(401);
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it('stores a signed pass with signatureVerified and counts it', async () => {
    const response = await post(body());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: true,
      surfaces: 1,
      passes: 1,
    });
    const stored = upsertMock.mock.calls[0][0];
    expect(stored.surfaces['outbound-review-cards'].signatureVerified).toBe(
      true
    );
  });

  it('stores a fail without needing a signature and never marks it verified', async () => {
    const response = await post(
      body({ verdict: 'fail', nothingWrong: false, signature: null })
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ passes: 0 });
    expect(
      upsertMock.mock.calls[0][0].surfaces['outbound-review-cards']
        .signatureVerified
    ).toBe(false);
  });

  it.each([
    ['malformed json', '{nope', 400],
    ['unknown field', { ...body(), extra: 1 }, 400],
    ['bad digest', body({ digest: 'short' }), 400],
    ['wrong schema', body({}, { schema: 'other' }), 400],
    ['pass without signoff', body({ nothingWrong: false }), 422],
    ['pass without a sha', body({ sourceSha: null }), 422],
  ])('rejects %s', async (_label, payload, status) => {
    expect((await post(payload)).status).toBe(status);
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it('rejects oversized bodies', async () => {
    expect(
      (await post(JSON.stringify({ pad: 'x'.repeat(70_000) }))).status
    ).toBe(413);
  });

  it('rejects a pass with a bad or missing signature, or no server key', async () => {
    expect(
      (
        await post(
          body({ signature: { alg: 'hmac-sha256', value: 'e'.repeat(64) } })
        )
      ).status
    ).toBe(422);
    expect((await post(body({ signature: null }))).status).toBe(422);
    envMock.DOGFOOD_JUDGE_SIGNING_KEY = undefined;
    expect((await post(body())).status).toBe(401);
    expect(upsertMock).not.toHaveBeenCalled();
  });
});
