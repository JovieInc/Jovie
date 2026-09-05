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

import fixtures from '@/lib/ovie/fixtures/summer-product-paths-v1.json';
import { summerProductPathsSchema } from '@/lib/ovie/summer-product-paths';
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

function fixtureProjection(
  changes: (typeof fixtures.cases)[number]['changes']
) {
  const value = structuredClone(fixtures.base);
  for (const change of changes) {
    let target = value as unknown as Record<string, unknown>;
    for (const key of change.path.slice(0, -1)) {
      target = target[key] as Record<string, unknown>;
    }
    const key = change.path.at(-1);
    if (!key) throw new Error('Empty compatibility fixture path');
    target[key] = change.value;
  }
  return value;
}

describe('POST /api/internal/ovie/summer-bottleneck', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW));
    vi.stubEnv('VERCEL_ENV', 'production');
    vi.stubEnv(
      'OVIE_SUMMER_EVE_DEPLOYMENT_ORIGIN',
      'https://jovie-eve-shadow-abc123-jovie.vercel.app'
    );
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

  it.each([
    undefined,
    '',
    'https://evil.test',
    'http://jovie-eve-shadow-abc123-jovie.vercel.app',
    'https://jovie-eve-shadow-abc123-jovie.vercel.app.evil.test',
    `https://${['user', 'secret'].join(':')}@jovie-eve-shadow-abc123-jovie.vercel.app`,
    'https://jovie-eve-shadow-abc123-jovie.vercel.app/path',
    'https://jovie-eve-shadow-abc123-jovie.vercel.app?token=secret',
    'https://jovie-eve-shadow-abc123-jovie.vercel.app#fragment',
    'https://jovie-eve-shadow.vercel.app',
  ])('fails closed for missing or malicious destination %#', async origin => {
    vi.stubEnv('OVIE_SUMMER_EVE_DEPLOYMENT_ORIGIN', origin);
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const response = await POST(request(validSnapshot()));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      ok: false,
      code: 'eve_destination_unavailable',
    });
    expect(fetch).not.toHaveBeenCalled();
    expect(mocks.getVercelOidcToken).not.toHaveBeenCalled();
  });

  it.each([
    302, 307, 308,
  ])('rejects an upstream %i redirect without retry or second destination', async status => {
    const fetch = vi.fn(
      async () =>
        new Response(null, {
          status,
          headers: { location: 'https://evil.test/collect' },
        })
    );
    vi.stubGlobal('fetch', fetch);
    expect((await POST(request(validSnapshot()))).status).toBe(502);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(
      expect.any(URL),
      expect.objectContaining({ redirect: 'error' })
    );
  });

  it('does not retry a rejected redirect or uncertain submission', async () => {
    const fetch = vi.fn(async () => {
      throw new TypeError('fetch failed; private redirect detail');
    });
    vi.stubGlobal('fetch', fetch);
    const response = await POST(request(validSnapshot()));
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain('private redirect detail');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('rejects an oversized product path collection before submission', async () => {
    const productPaths = structuredClone(fixtures.base);
    productPaths.paths = Array.from({ length: 17 }, (_, index) => ({
      ...fixtures.base.paths[0],
      id: `path-${index}`,
    }));
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    expect(
      (
        await POST(
          request({
            ...validSnapshot(),
            signals: { ...validSnapshot().signals, productPaths },
          })
        )
      ).status
    ).toBe(422);
    expect(fetch).not.toHaveBeenCalled();
    expect(mocks.getVercelOidcToken).not.toHaveBeenCalled();
  });

  it.each(
    fixtures.cases
  )('preserves the private receiver compatibility fixture: $name', async fixture => {
    const productPaths = fixtureProjection(fixture.changes);
    expect(summerProductPathsSchema.safeParse(productPaths).success).toBe(
      fixture.valid
    );
    const input = {
      ...validSnapshot(),
      signals: { ...validSnapshot().signals, productPaths },
    };
    const fetch = vi.fn(async () =>
      Response.json(
        { ok: true, receipt: { eventId: input.eventId, decision: 'accepted' } },
        { status: 202 }
      )
    );
    vi.stubGlobal('fetch', fetch);
    const response = await POST(request(input));
    expect(response.status).toBe(fixture.valid ? 202 : 422);
    if (!fixture.valid) {
      expect(fetch).not.toHaveBeenCalled();
      expect(mocks.getVercelOidcToken).not.toHaveBeenCalled();
      return;
    }
    expect(fetch).toHaveBeenCalledTimes(1);
    const call = fetch.mock.calls[0] as unknown as Parameters<
      typeof globalThis.fetch
    >;
    const delivered = JSON.parse(String(call[1]?.body));
    expect(delivered.signals.productPaths).toEqual(productPaths);
    expect(
      nodeVerify(
        null,
        Buffer.from(
          `jovie.eve.summer-bottleneck-snapshot/v1\0${canonical(input)}`
        ),
        PRODUCER_PUBLIC_KEY,
        Buffer.from(delivered.producerAttestation.signature, 'base64url')
      )
    ).toBe(true);
  });

  it('rejects a product source revision outside the signed snapshot source', async () => {
    const productPaths = fixtureProjection([
      { path: ['sourceRevision'], value: 'd'.repeat(40) },
    ]);
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const response = await POST(
      request({
        ...validSnapshot(),
        signals: { ...validSnapshot().signals, productPaths },
      })
    );
    expect(response.status).toBe(422);
    expect(fetch).not.toHaveBeenCalled();
    expect(mocks.getVercelOidcToken).not.toHaveBeenCalled();
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
        {
          ok: true,
          receipt: { eventId: validSnapshot().eventId, decision: 'accepted' },
        },
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
      'https://jovie-eve-shadow-abc123-jovie.vercel.app/ovie/v1/summer-bottleneck/events'
    );
    expect(init).toMatchObject({
      method: 'POST',
      redirect: 'error',
      headers: {
        authorization: 'Bearer test-vercel-oidc-token',
        'x-vercel-trusted-oidc-idp-token': 'test-vercel-oidc-token',
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
    [
      'unsafe counter',
      {
        ...validSnapshot(),
        signals: {
          ...validSnapshot().signals,
          queue: {
            ...validSnapshot().signals.queue,
            queuedPrs: Number.MAX_SAFE_INTEGER + 1,
          },
        },
      },
    ],
    [
      'duplicate CI class',
      {
        ...validSnapshot(),
        signals: {
          ...validSnapshot().signals,
          ciAudit: {
            ...validSnapshot().signals.ciAudit,
            classes: validSnapshot().signals.ciAudit.classes.map(item => ({
              ...item,
              id: 'merge-group-flake-baseline-ratchet',
            })),
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

    mocks.getVercelOidcToken.mockResolvedValueOnce('');
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

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ ok: false }))
    );
    expect((await POST(request(validSnapshot()))).status).toBe(502);

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('x'.repeat(65 * 1024)))
    );
    expect((await POST(request(validSnapshot()))).status).toBe(502);

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(new Error('down')))
    );
    expect((await POST(request(validSnapshot()))).status).toBe(503);
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
