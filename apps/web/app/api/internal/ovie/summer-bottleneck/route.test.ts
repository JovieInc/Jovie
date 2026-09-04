import { generateKeyPairSync, verify as nodeVerify } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getVercelOidcToken: vi.fn(),
  verifyCronRequest: vi.fn(),
}));

vi.mock('@vercel/oidc', () => ({
  getVercelOidcToken: mocks.getVercelOidcToken,
}));

vi.mock('@/lib/cron/auth', () => ({
  verifyCronRequest: mocks.verifyCronRequest,
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: { error: vi.fn() },
}));

import { POST } from './route';

const NOW = '2026-09-04T20:00:00.000Z';
const SOURCE = 'a'.repeat(40);
const producerKeys = generateKeyPairSync('ed25519');
const PRODUCER_PRIVATE_KEY = producerKeys.privateKey
  .export({ format: 'pem', type: 'pkcs8' })
  .toString();
const PRODUCER_PUBLIC_KEY = producerKeys.publicKey
  .export({ format: 'pem', type: 'spki' })
  .toString();
const PRODUCER_KEY_ID = 'jovie-production-2026-09';

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

function validSnapshot(observedAt = NOW) {
  const source = (digit: string) => ({
    observedAt,
    sourceDigest: digit.repeat(64),
    sourceRevision: SOURCE,
  });
  return {
    schema: 'jovie.eve.summer-bottleneck-snapshot/v1',
    eventId: 'evt_producer_bridge_0001',
    observedAt,
    sourceVersion: SOURCE,
    signals: {
      closure: {
        schema: 'jovie.eve.summer-closure-projection/v1',
        sourceSchema: 'jovie-closure-health/v1',
        ...source('1'),
        status: 'healthy',
        blockedSince: null,
        openPullRequests: 1,
      },
      queue: {
        schema: 'jovie.eve.summer-queue-projection/v1',
        sourceSchema: 'github-merge-queue-entry/v1',
        ...source('2'),
        blockedSince: null,
        eligibleCleanPrs: 0,
        queuedPrs: 0,
      },
      release: {
        schema: 'jovie.eve.summer-release-projection/v1',
        sourceSchema: 'jovie-controller-snapshot/v1',
        ...source('3'),
        blockedSince: null,
        mainSha: SOURCE,
        productionSha: SOURCE,
        unverifiedMerges: 0,
      },
      runner: {
        schema: 'jovie.eve.summer-runner-projection/v1',
        sourceSchema: 'symphony-lease-guard-report/v1',
        ...source('4'),
        blockedSince: null,
        capacityAvailable: 1,
        queuedWork: 0,
      },
      ciAudit: {
        schema: 'jovie-ci-bottleneck-audit/v1',
        ...source('5'),
        classes: [
          'merge-group-flake-baseline-ratchet',
          'controller-cascade-coalescing',
          'auto-enroll-self-cancel-churn',
          'controller-check-run-pagination-cap',
          'obsolete-unaffected-native-lanes',
          'affected-only-unit-selection',
        ].map((id, index) => ({
          id,
          state: 'implemented',
          blockedSince: observedAt,
          impact: index + 1,
          owner: 'ci-owner',
          handle: `audit:${index}`,
        })),
      },
    },
  };
}

function request(body: unknown) {
  return new Request('https://jov.ie/api/internal/ovie/summer-bottleneck', {
    method: 'POST',
    headers: {
      authorization: 'Bearer test-cron-secret',
      'content-type': 'application/json',
      'x-forwarded-host': 'jov.ie',
    },
    body: JSON.stringify(body),
  });
}

describe('POST /api/internal/ovie/summer-bottleneck', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW));
    vi.stubEnv('VERCEL_ENV', 'production');
    vi.stubEnv(
      'SUMMER_BOTTLENECK_PRODUCER_SIGNING_PRIVATE_KEY',
      PRODUCER_PRIVATE_KEY
    );
    vi.stubEnv('SUMMER_BOTTLENECK_PRODUCER_SIGNING_KEY_ID', PRODUCER_KEY_ID);
    mocks.verifyCronRequest.mockReturnValue(null);
    mocks.getVercelOidcToken.mockResolvedValue('test-vercel-oidc-token');
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('authenticates before parsing, signing, token minting, or delivery', async () => {
    mocks.verifyCronRequest.mockReturnValue(
      Response.json({ error: 'Unauthorized' }, { status: 401 })
    );
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);

    const response = await POST(
      new Request('https://jov.ie/api/internal/ovie/summer-bottleneck', {
        method: 'POST',
        body: '{not-json',
      })
    );

    expect(response.status).toBe(401);
    expect(mocks.getVercelOidcToken).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('signs a strict snapshot that Eve accepts and sends it to the fixed target once', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      Response.json(
        { ok: true, receipt: { decision: 'accepted' } },
        { status: 202 }
      )
    );
    vi.stubGlobal('fetch', fetch);

    const response = await POST(request(validSnapshot()));

    expect(response.status).toBe(202);
    expect(fetch).toHaveBeenCalledTimes(1);
    const call = fetch.mock.calls[0];
    expect(call).toBeDefined();
    const [url, init] = call as Parameters<typeof globalThis.fetch>;
    expect(String(url)).toBe(
      'https://jovie-eve-shadow-staging.vercel.app/ovie/v1/summer-bottleneck/events'
    );
    expect(init).toMatchObject({
      method: 'POST',
      headers: {
        authorization: 'Bearer test-vercel-oidc-token',
        'content-type': 'application/json',
      },
    });
    const delivered = JSON.parse(String(init?.body));
    expect(delivered.producerAttestation).toMatchObject({
      algorithm: 'Ed25519',
      keyId: PRODUCER_KEY_ID,
    });
    expect(
      nodeVerify(
        null,
        Buffer.from(
          `jovie.eve.summer-bottleneck-snapshot/v1\0${canonical(
            validSnapshot()
          )}`
        ),
        PRODUCER_PUBLIC_KEY,
        Buffer.from(delivered.producerAttestation.signature, 'base64url')
      )
    ).toBe(true);
  });

  it.each([
    ['missing key', undefined, PRODUCER_KEY_ID],
    ['malformed key', 'not-a-private-key', PRODUCER_KEY_ID],
    [
      'wrong key type',
      generateKeyPairSync('ec', { namedCurve: 'P-256' })
        .privateKey.export({ format: 'pem', type: 'pkcs8' })
        .toString(),
      PRODUCER_KEY_ID,
    ],
    ['invalid key ID', PRODUCER_PRIVATE_KEY, 'x'],
  ])('fails closed for %s before minting a token', async (_name, key, keyId) => {
    vi.stubEnv('SUMMER_BOTTLENECK_PRODUCER_SIGNING_PRIVATE_KEY', key);
    vi.stubEnv('SUMMER_BOTTLENECK_PRODUCER_SIGNING_KEY_ID', keyId);
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);

    const response = await POST(request(validSnapshot()));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      code: 'producer_signing_unavailable',
    });
    expect(mocks.getVercelOidcToken).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    ['stale', '2026-09-04T19:44:59.999Z'],
    ['future', '2026-09-04T20:01:00.001Z'],
  ])('rejects a %s signal before signing', async (_name, observedAt) => {
    const response = await POST(request(validSnapshot(observedAt)));

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({
      code: 'stale_bottleneck_snapshot',
    });
    expect(mocks.getVercelOidcToken).not.toHaveBeenCalled();
  });

  it.each([
    ['caller attestation', { ...validSnapshot(), producerAttestation: {} }],
    [
      'caller destination',
      { ...validSnapshot(), destination: 'https://evil.test' },
    ],
    [
      'cross-bound revision',
      {
        ...validSnapshot(),
        signals: {
          ...validSnapshot().signals,
          queue: {
            ...validSnapshot().signals.queue,
            sourceRevision: 'b'.repeat(40),
          },
        },
      },
    ],
  ])('rejects %s before signing', async (_name, body) => {
    const response = await POST(request(body));

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({
      code: 'invalid_bottleneck_snapshot',
    });
    expect(mocks.getVercelOidcToken).not.toHaveBeenCalled();
  });

  it('maps replay without retrying or exposing Eve response details', async () => {
    const fetch = vi.fn(async () =>
      Response.json({ secret: 'do-not-reflect' }, { status: 409 })
    );
    vi.stubGlobal('fetch', fetch);

    const response = await POST(request(validSnapshot()));

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      code: 'replay_rejected',
    });
  });

  it('fails closed outside production and when OIDC or Eve is unavailable', async () => {
    vi.stubEnv('VERCEL_ENV', 'preview');
    expect((await POST(request(validSnapshot()))).status).toBe(503);

    vi.stubEnv('VERCEL_ENV', 'production');
    mocks.getVercelOidcToken.mockRejectedValueOnce(new Error('unavailable'));
    expect((await POST(request(validSnapshot()))).status).toBe(503);

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({}, { status: 500 }))
    );
    const rejected = await POST(request(validSnapshot()));
    expect(rejected.status).toBe(502);
    await expect(rejected.json()).resolves.toEqual({
      ok: false,
      code: 'eve_bottleneck_rejected',
    });
  });

  it.each([
    ['invalid JSON', '{not-json', 400, 'invalid_json'],
    ['oversized body', 'x'.repeat(64 * 1024 + 1), 413, 'body_too_large'],
  ])('rejects %s before signing', async (_name, body, status, code) => {
    const response = await POST(
      new Request('https://jov.ie/api/internal/ovie/summer-bottleneck', {
        method: 'POST',
        headers: { authorization: 'Bearer test-cron-secret' },
        body,
      })
    );

    expect(response.status).toBe(status);
    await expect(response.json()).resolves.toMatchObject({ code });
    expect(mocks.getVercelOidcToken).not.toHaveBeenCalled();
  });

  it('rejects a declared oversized body before reading its stream', async () => {
    const response = await POST(
      new Request('https://jov.ie/api/internal/ovie/summer-bottleneck', {
        method: 'POST',
        headers: { 'content-length': String(64 * 1024 + 1) },
        body: '{}',
      })
    );

    expect(response.status).toBe(413);
    expect(mocks.getVercelOidcToken).not.toHaveBeenCalled();
  });
});
