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

function request(body: unknown, authorization = 'Bearer test-cron-secret') {
  return new Request('https://jov.ie/api/internal/ovie/summer-shadow', {
    method: 'POST',
    headers: {
      authorization,
      'content-type': 'application/json',
      'x-forwarded-host': 'jov.ie',
    },
    body: JSON.stringify(body),
  });
}

const validEvent = {
  eventId: 'evt_ovie_origin_0001',
  message: 'Observe the production source binding only.',
  evidence: [],
};

describe('POST /api/internal/ovie/summer-shadow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('VERCEL_ENV', 'production');
    mocks.verifyCronRequest.mockReturnValue(null);
    mocks.getVercelOidcToken.mockResolvedValue('test-vercel-oidc-token');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('authenticates before parsing or obtaining a signed token', async () => {
    mocks.verifyCronRequest.mockReturnValue(
      Response.json({ error: 'Unauthorized' }, { status: 401 })
    );
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);

    const response = await POST(
      new Request('https://jov.ie/api/internal/ovie/summer-shadow', {
        method: 'POST',
        body: '{not-json',
      })
    );

    expect(response.status).toBe(401);
    expect(mocks.getVercelOidcToken).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('forwards a strict event with the production Function OIDC token', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      Response.json(
        {
          ok: true,
          eventId: validEvent.eventId,
          sessionId: 'ses_shadow',
          authority: { dispatchAuthority: 'none', allowedMutations: [] },
        },
        { status: 202 }
      )
    );
    vi.stubGlobal('fetch', fetch);

    const response = await POST(request(validEvent));
    const body = await response.json();

    expect(response.status).toBe(202);
    expect(body).toMatchObject({
      ok: true,
      eve: {
        eventId: validEvent.eventId,
        sessionId: 'ses_shadow',
        authority: { dispatchAuthority: 'none', allowedMutations: [] },
      },
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    const call = fetch.mock.calls[0];
    expect(call).toBeDefined();
    const [url, init] = call as Parameters<typeof globalThis.fetch>;
    expect(String(url)).toBe(
      'https://jovie-eve-shadow-staging.vercel.app/ovie/v1/summer-shadow/events'
    );
    expect(init).toMatchObject({
      method: 'POST',
      headers: {
        authorization: 'Bearer test-vercel-oidc-token',
        'content-type': 'application/json',
      },
    });
    expect(JSON.parse(String(init?.body))).toMatchObject({
      schema: 'jovie.ovie-summer-shadow.event/v1',
      eventId: validEvent.eventId,
      message: validEvent.message,
      evidence: [],
    });
  });

  it('propagates Eve replay rejection without a second successful dispatch', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({ ok: false, code: 'replay_rejected' }, { status: 409 })
      )
    );

    const response = await POST(request(validEvent));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      code: 'replay_rejected',
      eve: { code: 'replay_rejected' },
    });
  });

  it('fails closed outside production or without a Function token', async () => {
    vi.stubEnv('VERCEL_ENV', 'preview');
    expect((await POST(request(validEvent))).status).toBe(503);

    vi.stubEnv('VERCEL_ENV', 'production');
    mocks.getVercelOidcToken.mockRejectedValue(new Error('missing token'));
    const response = await POST(request(validEvent));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      code: 'signed_origin_unavailable',
    });
  });

  it.each([
    ['invalid JSON', '{not-json', 400, 'invalid_json'],
    [
      'invalid event',
      JSON.stringify({ ...validEvent, unexpected: true }),
      422,
      'invalid_event',
    ],
    ['oversized body', 'x'.repeat(32 * 1024 + 1), 413, 'body_too_large'],
  ])('rejects %s before obtaining a Function token', async (_name, body, status, code) => {
    const response = await POST(
      new Request('https://jov.ie/api/internal/ovie/summer-shadow', {
        method: 'POST',
        headers: { authorization: 'Bearer test-cron-secret' },
        body,
      })
    );

    expect(response.status).toBe(status);
    await expect(response.json()).resolves.toMatchObject({ code });
    expect(mocks.getVercelOidcToken).not.toHaveBeenCalled();
  });
});
