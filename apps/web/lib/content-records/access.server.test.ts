import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  secret: 'x'.repeat(40) as string | undefined,
  adminError: null as Response | null,
  userId: 'u1' as string | null,
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/env-server', () => ({
  env: new Proxy(
    {},
    {
      get: (_target, key) =>
        key === 'CONTENT_PUBLISH_SECRET' ? state.secret : undefined,
    }
  ),
}));
vi.mock('@/lib/admin/middleware', () => ({
  requireAdmin: vi.fn(async () => state.adminError),
}));
vi.mock('@/lib/auth/cached', () => ({
  getCachedAuth: vi.fn(async () => ({ userId: state.userId })),
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
    const token = access.signPreviewToken('v1');
    expect(token).toBeTruthy();
    expect(access.verifyPreviewToken('v1', token)).toBe(true);
    expect(access.verifyPreviewToken('v2', token)).toBe(false);
    expect(access.verifyPreviewToken('v1', `${token}x`)).toBe(false);
    expect(access.verifyPreviewToken('v1', null)).toBe(false);
    state.secret = undefined;
    expect(access.signPreviewToken('v1')).toBeNull();
    expect(access.verifyPreviewToken('v1', token)).toBe(false);
  });
});
