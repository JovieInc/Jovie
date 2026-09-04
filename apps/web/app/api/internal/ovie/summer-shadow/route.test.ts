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

import { GET, POST } from './route';

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
  conversationId: 'conv_ovie_origin_0001',
  turn: 1,
  dailySlot: 1,
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
      conversationId: validEvent.conversationId,
      turn: 1,
      dailySlot: 1,
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

  it('propagates an exhausted hard budget without dispatch authority', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json(
          { ok: false, code: 'session_budget_rejected' },
          { status: 429 }
        )
      )
    );

    const response = await POST(request(validEvent));

    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      code: 'budget_rejected',
      eve: { code: 'session_budget_rejected' },
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

  it('proxies a signed, read-only durable stream from an exact cursor', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(
      async () =>
        new Response(
          `${JSON.stringify({ type: 'session.waiting', meta: { id: 'evt_1' } })}\n`,
          {
            headers: { 'content-type': 'application/x-ndjson' },
          }
        )
    );
    vi.stubGlobal('fetch', fetch);

    const response = await GET(
      new Request(
        'https://jov.ie/api/internal/ovie/summer-shadow?sessionId=ses_shadow_1&conversationId=conv_shadow_1&startIndex=7',
        {
          headers: {
            authorization: 'Bearer test-cron-secret',
            'x-forwarded-host': 'jov.ie',
          },
        }
      )
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/x-ndjson');
    await expect(response.text()).resolves.toContain('session.waiting');
    expect(fetch).toHaveBeenCalledTimes(1);
    const streamCall = fetch.mock.calls[0];
    expect(streamCall).toBeDefined();
    const [streamUrl, streamInit] = streamCall as Parameters<
      typeof globalThis.fetch
    >;
    expect(String(streamUrl)).toBe(
      'https://jovie-eve-shadow-staging.vercel.app/ovie/v1/summer-shadow/sessions/ses_shadow_1/stream?conversationId=conv_shadow_1&startIndex=7'
    );
    expect(streamInit).toMatchObject({
      headers: { authorization: 'Bearer test-vercel-oidc-token' },
    });
  });

  it('forwards a bounded commercial snapshot without asserting its facts are verified', async () => {
    const commercialSnapshot = {
      schema: 'jovie.summer-commercial.snapshot/v1',
      sources: [],
      candidates: [],
      activeCommercialId: null,
      recurringMrrCents: null,
      collectedCashCents: null,
      committedOperatingCostCents: null,
      employerCompensationCostCents: null,
      availableCashAfterObligationsCents: null,
      recordedFounderMinutesPerDay: null,
    };
    const fetch = vi.fn(async () =>
      Response.json({ ok: true }, { status: 202 })
    );
    vi.stubGlobal('fetch', fetch);
    expect(
      (await POST(request({ ...validEvent, commercialSnapshot }))).status
    ).toBe(202);
    const body = JSON.parse(
      String(
        (
          fetch.mock.calls[0] as unknown as Parameters<typeof globalThis.fetch>
        )[1]?.body
      )
    );
    expect(body.commercialSnapshot).toEqual(commercialSnapshot);
    expect(
      (
        await POST(
          request({ ...validEvent, commercialSnapshot: { schema: 'other' } })
        )
      ).status
    ).toBe(422);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('proxies authenticated commercial receipt readback as JSON', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      Response.json({ consumption: 'UNKNOWN' })
    );
    vi.stubGlobal('fetch', fetch);
    const response = await GET(
      new Request(
        'https://jov.ie/api/internal/ovie/summer-shadow?eventId=event-0001'
      )
    );
    expect(response.headers.get('content-type')).toBe('application/json');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({ consumption: 'UNKNOWN' });
    expect(String(fetch.mock.calls[0]?.[0])).toBe(
      'https://jovie-eve-shadow-staging.vercel.app/ovie/v1/summer-shadow/commercial/event-0001'
    );
    expect(
      (
        await GET(
          new Request(
            'https://jov.ie/api/internal/ovie/summer-shadow?eventId=..'
          )
        )
      ).status
    ).toBe(400);
    mocks.verifyCronRequest.mockReturnValue(
      new Response(null, { status: 401 })
    );
    expect(
      (
        await GET(
          new Request(
            'https://jov.ie/api/internal/ovie/summer-shadow?eventId=event-0001'
          )
        )
      ).status
    ).toBe(401);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each([404, 503])('preserves commercial proof status %s', async status => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ code: 'upstream' }, { status }))
    );
    const response = await GET(
      new Request(
        'https://jov.ie/api/internal/ovie/summer-shadow?eventId=event-0001'
      )
    );
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({
      ok: false,
      code:
        status === 404
          ? 'commercial_receipt_not_found'
          : 'commercial_proof_unavailable',
    });
  });

  it('preserves strict Eve commercial validation rejection', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({ code: 'invalid_event' }, { status: 422 })
      )
    );
    const response = await POST(
      request({
        ...validEvent,
        commercialSnapshot: {
          schema: 'jovie.summer-commercial.snapshot/v1',
          candidates: 'invalid',
        },
      })
    );
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({
      ok: false,
      code: 'invalid_commercial_snapshot',
    });
  });

  it('rejects malformed stream requests before obtaining an OIDC token', async () => {
    const response = await GET(
      new Request(
        'https://jov.ie/api/internal/ovie/summer-shadow?sessionId=not-a-session&startIndex=-1',
        { headers: { authorization: 'Bearer test-cron-secret' } }
      )
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: 'invalid_stream_request',
    });
    expect(mocks.getVercelOidcToken).not.toHaveBeenCalled();
  });
});
