import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  secret: 'x'.repeat(40) as string | undefined,
  adminError: null as Response | null,
  userId: 'u1' as string | null,
  founderId: 'u1' as string | undefined,
  actorUserId: undefined as string | undefined,
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/env-server', () => ({
  env: new Proxy(
    {},
    {
      get: (_target, key) =>
        key === 'CONTENT_PUBLISH_SECRET'
          ? state.secret
          : key === 'OVIE_SUMMER_FOUNDER_APP_USER_ID'
            ? state.founderId
            : undefined,
    }
  ),
}));
vi.mock('@/lib/admin/middleware', () => ({
  requireAdmin: vi.fn(async () => state.adminError),
}));
vi.mock('@/lib/auth/cached', () => ({
  getCachedAuth: vi.fn(async () => ({
    userId: state.userId,
    actorUserId: state.actorUserId,
  })),
}));

const access = await import('./access.server');

const request = (headers: Record<string, string>) =>
  new Request('https://jov.ie/api/content-records/marketing-page/home', {
    headers,
  });

describe('content record access', () => {
  beforeEach(() => {
    state.secret = 'x'.repeat(40);
    state.adminError = null;
    state.userId = 'u1';
    state.founderId = 'u1';
    state.actorUserId = undefined;
  });

  it('accepts the agent secret with a named actor', async () => {
    expect(
      await access.resolveContentWriter(
        request({
          authorization: `Bearer ${'x'.repeat(40)}`,
          'x-content-actor': 'summer',
        })
      )
    ).toEqual({ ok: true, actor: 'agent:summer' });
  });

  it('rejects a wrong secret, a missing secret, and an unnamed agent', async () => {
    const wrong = await access.resolveContentWriter(
      request({ authorization: 'Bearer nope', 'x-content-actor': 'summer' })
    );
    expect(wrong).toMatchObject({ ok: false, status: 401 });
    const unnamed = await access.resolveContentWriter(
      request({ authorization: `Bearer ${'x'.repeat(40)}` })
    );
    expect(unnamed).toMatchObject({ ok: false, status: 403 });
    state.secret = undefined;
    const unset = await access.resolveContentWriter(
      request({
        authorization: `Bearer ${'x'.repeat(40)}`,
        'x-content-actor': 'summer',
      })
    );
    expect(unset).toMatchObject({ ok: false, status: 401 });
  });

  it('falls back to a fresh admin session', async () => {
    expect(await access.resolveContentWriter(request({}))).toEqual({
      ok: true,
      actor: 'user:u1',
    });
    state.adminError = new Response(null, { status: 403 });
    expect(await access.resolveContentWriter(request({}))).toMatchObject({
      ok: false,
      status: 401,
    });
  });

  it('signs previews per version and rejects tampering', () => {
    const v1 = { reviewDigest: 'a'.repeat(64) };
    const v2 = { reviewDigest: 'b'.repeat(64) };
    const token = access.signPreviewToken(v1);
    expect(token).toBeTruthy();
    expect(access.verifyPreviewToken(v1, token)).toBe(true);
    expect(access.verifyPreviewToken(v2, token)).toBe(false);
    expect(access.verifyPreviewToken(v1, `${token}x`)).toBe(false);
    expect(access.verifyPreviewToken(v1, null)).toBe(false);
    state.secret = undefined;
    expect(access.signPreviewToken(v1)).toBeNull();
    expect(access.verifyPreviewToken(v1, token)).toBe(false);
  });

  it('requires the configured founder in a fresh same-origin browser session', async () => {
    expect(
      await access.resolveContentApprover(request({ origin: 'https://jov.ie' }))
    ).toEqual({ ok: true, actor: 'user:u1' });
    state.userId = 'other-admin';
    expect(
      await access.resolveContentApprover(request({ origin: 'https://jov.ie' }))
    ).toMatchObject({ ok: false, status: 403 });
    state.founderId = undefined;
    expect(
      await access.resolveContentApprover(request({ origin: 'https://jov.ie' }))
    ).toMatchObject({ ok: false, status: 503 });
  });

  it('rejects agent bearer, cross-origin, missing-origin and impersonated approvals', async () => {
    const invalidHeaders: Record<string, string>[] = [
      { origin: 'https://jov.ie', authorization: `Bearer ${'x'.repeat(40)}` },
      { origin: 'https://attacker.invalid' },
      {},
      { origin: 'https://jov.ie', 'sec-fetch-site': 'cross-site' },
    ];
    for (const headers of invalidHeaders) {
      expect(
        await access.resolveContentApprover(request(headers))
      ).toMatchObject({ ok: false, status: 403 });
    }
    state.actorUserId = 'u1';
    expect(
      await access.resolveContentApprover(request({ origin: 'https://jov.ie' }))
    ).toMatchObject({ ok: false, status: 403 });
  });
});
