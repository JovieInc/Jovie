import { generateKeyPairSync, verify } from 'node:crypto';
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
vi.mock('@/lib/utils/logger', () => ({ logger: { error: vi.fn() } }));

import { POST } from './route';

const SOURCE = 'b'.repeat(40);
const keys = generateKeyPairSync('ed25519');
const PRIVATE_KEY = keys.privateKey
  .export({ type: 'pkcs8', format: 'pem' })
  .toString();

function token(sub = 'owner:jovie:project:jovie:environment:production') {
  return `${Buffer.from('{}').toString('base64url')}.${Buffer.from(
    JSON.stringify({ sub })
  ).toString('base64url')}.signature`;
}

function input(overrides: Readonly<Record<string, unknown>> = {}) {
  return {
    audience: 'internal-summer-governance-canary',
    eventId: 'evt_summer_canary_0001',
    observedAt: new Date().toISOString(),
    sourceVersion: SOURCE,
    ...overrides,
  };
}

function request(body: unknown = input()) {
  return new Request('https://jov.ie/api/internal/ovie/summer-bottleneck', {
    method: 'POST',
    headers: {
      authorization: 'Bearer cron-secret',
      'content-type': 'application/json',
      'x-forwarded-host': 'jov.ie',
    },
    body: JSON.stringify(body),
  });
}

describe('POST /api/internal/ovie/summer-bottleneck', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('VERCEL_ENV', 'production');
    vi.stubEnv('VERCEL_GIT_COMMIT_SHA', SOURCE);
    vi.stubEnv('SUMMER_BOTTLENECK_PRODUCER_SIGNING_PRIVATE_KEY', PRIVATE_KEY);
    vi.stubEnv(
      'SUMMER_BOTTLENECK_PRODUCER_SIGNING_KEY_ID',
      'jovie-producer-2026-09-04'
    );
    mocks.verifyCronRequest.mockReturnValue(null);
    mocks.getVercelOidcToken.mockResolvedValue(token());
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('signs one source-bound event and targets only the immutable Eve deployment', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      Response.json(
        { ok: true, receipt: { decision: 'pending-symphony' } },
        { status: 202 }
      )
    );
    vi.stubGlobal('fetch', fetch);

    const response = await POST(request());
    expect(response.status).toBe(202);
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0] as Parameters<typeof fetch>;
    expect(String(url)).toBe(
      'https://jovie-eve-shadow-qj7qmxggt-jovie.vercel.app/ovie/v1/summer-bottleneck/events'
    );
    const body = JSON.parse(String(init?.body));
    expect(body).toMatchObject({
      eventId: 'evt_summer_canary_0001',
      sourceVersion: SOURCE,
      producerAttestation: {
        algorithm: 'Ed25519',
        keyId: 'jovie-producer-2026-09-04',
      },
      signals: {
        release: { mainSha: SOURCE, productionSha: null, unverifiedMerges: 1 },
      },
    });
    const { producerAttestation, ...unsigned } = body;
    const canonical = (value: unknown): string => {
      if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
      if (value !== null && typeof value === 'object') {
        return `{${Object.entries(value)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, child]) => `${JSON.stringify(key)}:${canonical(child)}`)
          .join(',')}}`;
      }
      return JSON.stringify(value);
    };
    expect(
      verify(
        null,
        Buffer.from(
          `jovie.eve.summer-bottleneck-snapshot/v1\0${canonical(unsigned)}`
        ),
        keys.publicKey,
        Buffer.from(producerAttestation.signature, 'base64url')
      )
    ).toBe(true);
  });

  it('authenticates before parsing, signing, or dispatching', async () => {
    mocks.verifyCronRequest.mockReturnValue(
      Response.json({ ok: false }, { status: 401 })
    );
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const response = await POST(
      new Request('https://jov.ie', { method: 'POST' })
    );
    expect(response.status).toBe(401);
    expect(mocks.getVercelOidcToken).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each<
    [
      string,
      {
        env?: Readonly<Record<string, string>>;
        body?: Readonly<Record<string, unknown>>;
      },
      number,
      string,
    ]
  >([
    [
      'preview origin',
      { env: { VERCEL_ENV: 'preview' } },
      503,
      'production_origin_required',
    ],
    [
      'wrong source',
      { body: input({ sourceVersion: 'a'.repeat(40) }) },
      409,
      'stale_or_wrong_source',
    ],
    [
      'stale event',
      { body: input({ observedAt: '2026-01-01T00:00:00.000Z' }) },
      409,
      'stale_or_wrong_source',
    ],
    [
      'missing signer',
      { env: { SUMMER_BOTTLENECK_PRODUCER_SIGNING_PRIVATE_KEY: '' } },
      503,
      'producer_signer_unavailable',
    ],
  ])('fails closed for %s', async (_name, setup, status, code) => {
    for (const [key, value] of Object.entries(setup.env ?? {}))
      vi.stubEnv(key, value);
    const response = await POST(request(setup.body ?? input()));
    expect(response.status).toBe(status);
    await expect(response.json()).resolves.toMatchObject({ code });
  });

  it('rejects the wrong OIDC subject and propagates immutable replay rejection', async () => {
    mocks.getVercelOidcToken.mockResolvedValue(
      token('owner:jovie:project:jovie:environment:preview')
    );
    expect((await POST(request())).status).toBe(503);

    mocks.getVercelOidcToken.mockResolvedValue(token());
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({ code: 'duplicate-replay-rejected' }, { status: 409 })
      )
    );
    const replay = await POST(request());
    expect(replay.status).toBe(409);
    await expect(replay.json()).resolves.toMatchObject({
      code: 'replay_rejected',
    });
  });
});
