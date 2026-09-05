import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getAppUser: vi.fn(),
  isAdmin: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/auth/better-auth', () => ({
  auth: { api: { getSession: mocks.getSession } },
}));
vi.mock('@/lib/auth/app-user', () => ({
  getAppUserByBetterAuthId: mocks.getAppUser,
}));
vi.mock('@/lib/admin/roles', () => ({ isAdmin: mocks.isAdmin }));
vi.mock('@/lib/security/content-security-policy', () => ({
  buildContentSecurityPolicy: ({
    nonce,
    isDev,
  }: {
    nonce: string;
    isDev: boolean;
  }) => `script-src 'nonce-${nonce}'${isDev ? " 'unsafe-eval'" : ''}`,
}));

import { proxy } from './proxy';

function request(
  path: string,
  method = 'GET',
  headers: Record<string, string> = {}
) {
  return new NextRequest(`https://ovie.example.test${path}`, {
    method,
    headers,
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getSession.mockResolvedValue(null);
  mocks.getAppUser.mockResolvedValue({ id: 'app-admin-id' });
  mocks.isAdmin.mockResolvedValue(false);
  vi.stubEnv('NODE_ENV', 'production');
});
afterEach(() => vi.unstubAllEnvs());

const protectedRequests = [
  ['/api/admin/feature-flags', 'GET', {}],
  ['/api/admin/feature-flags', 'POST', {}],
  ['/app/ov/people', 'POST', { 'next-action': 'action-id' }],
  ['/signin', 'POST', { 'next-action': 'action-id' }],
  ['/api/auth/get-session', 'POST', { 'next-action': 'action-id' }],
] as const;

describe('private Ovie request gate', () => {
  it.each(
    protectedRequests
  )('denies anonymous %s %s before reaching handlers', async (path, method, headers) => {
    const response = await proxy(request(path, method, headers));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Authentication required' });
    expect(response.headers.get('Cache-Control')).toContain('no-store');
    expect(response.headers.get('x-middleware-next')).toBeNull();
    expect(mocks.getAppUser).not.toHaveBeenCalled();
  });

  it.each(
    protectedRequests
  )('denies a signed-in nonadmin %s %s', async (path, method, headers) => {
    mocks.getSession.mockResolvedValue({ user: { id: 'ba-user-id' } });
    const response = await proxy(request(path, method, headers));
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'Ovie access required' });
    expect(response.headers.get('x-middleware-next')).toBeNull();
    expect(mocks.isAdmin).toHaveBeenCalledWith('app-admin-id');
  });

  it.each([
    ...protectedRequests,
    ['/app/ov/ops', 'GET', {}] as const,
  ])('passes authorized admin %s %s to existing handler authorization', async (path, method, headers) => {
    mocks.getSession.mockResolvedValue({ user: { id: 'ba-user-id' } });
    mocks.isAdmin.mockResolvedValue(true);
    const incoming = request(path, method, headers);
    const response = await proxy(incoming);
    expect(response.headers.get('x-middleware-next')).toBe('1');
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(mocks.getSession).toHaveBeenCalledWith({
      headers: incoming.headers,
      query: { disableCookieCache: true },
    });
    expect(mocks.getAppUser).toHaveBeenCalledWith('ba-user-id');
  });

  it.each([
    'GET',
    'HEAD',
  ])('redirects anonymous page %s to same-origin signin preserving the deep link', async method => {
    const response = await proxy(
      request(
        '/app/ov/people?view=creators&redirect_url=https://attacker.test',
        method,
        { 'x-forwarded-host': 'attacker.test' }
      )
    );
    const destination = new URL(response.headers.get('location')!);
    expect(destination.origin).toBe('https://ovie.example.test');
    expect(destination.pathname).toBe('/signin');
    expect(destination.searchParams.get('redirect_url')).toBe(
      '/app/ov/people?view=creators&redirect_url=https://attacker.test'
    );
    expect(response.headers.get('Cache-Control')).toContain('no-store');
  });

  it('returns a private forbidden page for a nonadmin', async () => {
    mocks.getSession.mockResolvedValue({ user: { id: 'ba-user-id' } });
    const response = await proxy(request('/hud'));
    expect(response.status).toBe(403);
    expect(await response.text()).toContain('Ovie access required');
    expect(response.headers.get('location')).toBeNull();
    expect(response.headers.get('Cache-Control')).toContain('no-store');
  });

  it('denies an authenticated identity with no linked app user', async () => {
    mocks.getSession.mockResolvedValue({ user: { id: 'unlinked-id' } });
    mocks.getAppUser.mockResolvedValue(null);
    expect((await proxy(request('/api/admin/roles'))).status).toBe(403);
    expect(mocks.isAdmin).not.toHaveBeenCalled();
  });

  it.each([
    'getSession',
    'getAppUser',
    'isAdmin',
  ] as const)('fails closed with sanitized 503 if %s throws', async dependency => {
    mocks.getSession.mockResolvedValue({ user: { id: 'ba-user-id' } });
    mocks[dependency].mockRejectedValue(
      new Error('secret=database-password token=private-token')
    );
    const response = await proxy(request('/api/admin/roles'));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: 'Ovie authentication unavailable',
    });
    expect(response.headers.get('Cache-Control')).toContain('no-store');
    expect(response.headers.get('x-middleware-next')).toBeNull();
  });

  it('overwrites forged routing and nonce headers with the actual authorized request', async () => {
    mocks.getSession.mockResolvedValue({ user: { id: 'ba-user-id' } });
    mocks.isAdmin.mockResolvedValue(true);
    const response = await proxy(
      request('/app/ov/people', 'GET', {
        'x-ovie-pathname': '/app/ov/ops',
        'x-nonce': 'attacker-nonce',
        'content-security-policy': 'script-src *',
      })
    );
    expect(response.headers.get('x-middleware-request-x-ovie-pathname')).toBe(
      '/app/ov/people'
    );
    const nonce = response.headers.get('x-middleware-request-x-nonce');
    expect(nonce).toBeTruthy();
    expect(nonce).not.toBe('attacker-nonce');
    expect(response.headers.get('Content-Security-Policy')).toBe(
      `script-src 'nonce-${nonce}'`
    );
    expect(
      response.headers.get('x-middleware-request-content-security-policy')
    ).toBe(response.headers.get('Content-Security-Policy'));
  });

  it.each([
    ['/signin', 'GET'],
    ['/signin', 'HEAD'],
    ['/api/auth/get-session', 'GET'],
    ['/api/auth/sign-in/email', 'POST'],
    ['/api/auth/callback/google', 'GET'],
    ['/api/auth/sign-in/email', 'OPTIONS'],
    ['/_next/static/chunks/app.js', 'GET'],
    ['/_next/image', 'GET'],
    ['/favicon.ico', 'GET'],
  ])('allows public entry %s %s while auth is unavailable', async (path, method) => {
    mocks.getSession.mockRejectedValue(new Error('auth down'));
    const response = await proxy(request(path, method));
    expect(response.headers.get('x-middleware-next')).toBe('1');
    expect(mocks.getSession).not.toHaveBeenCalled();
  });

  it.each([
    '/sign-in',
    '/signin/anything',
    '/api/authentication',
    '/api/auth',
    '/_next/data/private.json',
    '/_next/anything',
    '/favicon.ico/anything',
  ])('does not allow public-prefix lookalike %s', async path => {
    const response = await proxy(request(path));
    expect(response.headers.get('x-middleware-next')).toBeNull();
    expect(mocks.getSession).toHaveBeenCalledOnce();
  });

  it('sets the development CSP only in development', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    const response = await proxy(request('/signin'));
    expect(response.headers.get('Content-Security-Policy')).toContain(
      "'unsafe-eval'"
    );
  });
});
