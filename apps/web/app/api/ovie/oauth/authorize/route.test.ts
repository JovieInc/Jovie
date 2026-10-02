import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  auth: vi.fn(),
  role: vi.fn(),
  ent: vi.fn(),
  mfa: vi.fn(),
  privacy: vi.fn(),
}));
vi.mock('@/lib/db', () => ({ db: {} }));
vi.mock('@/lib/auth/cached', () => ({ getFreshAuth: m.auth }));
vi.mock('@/lib/admin/roles', () => ({ isAdmin: m.role }));
vi.mock('@/lib/admin/mfa', () => ({ hasRecentAdminMfaReverification: m.mfa }));
vi.mock('@/lib/entitlements/server', () => ({
  getCurrentUserEntitlements: m.ent,
}));
vi.mock('@/lib/ovie/privacy-lock/server', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/ovie/privacy-lock/server')>()),
  assertOviePrivacyUnlocked: m.privacy,
}));

import {
  ovieOAuthHandoffCookie,
  readOvieOAuthHandoff,
} from '@/lib/ovie/mcp/authorization-request';
import {
  getOvieOAuthIssuer,
  OvieOAuthIssuer,
  pkceS256,
} from '@/lib/ovie/mcp/oauth';
import { OviePrivacyLockError } from '@/lib/ovie/privacy-lock/server';
import { GET } from './route';

const origin = 'https://jov.ie';
const callback = 'https://chatgpt.com/connector/oauth/callback';
const verifier = 'a'.repeat(64);
const state = 'opaque+/=&日本語';
const founder = {
  isAuthenticated: true,
  isAdmin: false,
  userId: 'founder',
  email: 'founder@example.com',
};

function authorization() {
  const client = getOvieOAuthIssuer().registerClient({
    redirect_uris: [callback],
  });
  return new URLSearchParams({
    response_type: 'code',
    client_id: client.client_id,
    redirect_uri: callback,
    code_challenge: pkceS256(verifier),
    code_challenge_method: 'S256',
    state,
    scope: 'ovie:read ovie:write',
  });
}
function request(params = authorization()) {
  return new Request(`${origin}/api/ovie/oauth/authorize?${params}`);
}
function handoffOf(res: Awaited<ReturnType<typeof GET>>, location: string) {
  const nonce = new URL(location, origin).searchParams.get('handoff')!;
  const cookieName = ovieOAuthHandoffCookie(nonce)!;
  const cookieValue = res.cookies.get(cookieName)!.value;
  return { nonce, cookieName, cookieValue };
}
function assertPreserved(
  res: Awaited<ReturnType<typeof GET>>,
  location: string,
  params: URLSearchParams
) {
  const { nonce, cookieValue } = handoffOf(res, location);
  const saved = readOvieOAuthHandoff(nonce, cookieValue)!;
  expect([
    ...new URL(saved.authorizePath, origin).searchParams.entries(),
  ]).toEqual([...params.entries()]);
  expect(location).not.toContain('client_id');
  expect(location).not.toContain('code_challenge');
  expect(location).not.toContain('state=');
  expect(res.headers.get('set-cookie')).toContain('HttpOnly');
  expect(res.headers.get('set-cookie')).toContain('Secure');
  expect(res.headers.get('set-cookie')).toContain('SameSite=lax');
}
function resume(nonce: string, cookieName: string, cookieValue: string) {
  return new Request(`${origin}/api/ovie/oauth/authorize?handoff=${nonce}`, {
    headers: { cookie: `${cookieName}=${cookieValue}` },
  });
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  m.ent.mockResolvedValue(founder);
  m.role.mockResolvedValue(true);
  m.auth.mockResolvedValue({ userId: 'founder', sessionId: 'session-1' });
  m.mfa.mockResolvedValue(false);
  m.privacy.mockResolvedValue(undefined);
});

describe('Ovie OAuth authorization recovery', () => {
  it('rejects cross-browser/CSRF handoff without its matching cookie', async () => {
    const first = await GET(request());
    const location = first.headers.get('location')!;
    const nonce = new URL(location).searchParams.get('handoff')!;
    const issue = vi.spyOn(OvieOAuthIssuer.prototype, 'issueCode');
    m.mfa.mockResolvedValue(true);
    const forged = await GET(
      new Request(`${origin}/api/ovie/oauth/authorize?handoff=${nonce}`)
    );
    expect(forged.status).toBe(400);
    expect(issue).not.toHaveBeenCalled();
  });
  it('hands signed-out users to founder sign-in with the validated original request', async () => {
    m.ent.mockResolvedValue({
      isAuthenticated: false,
      isAdmin: false,
      userId: null,
    });
    const params = authorization();
    const issue = vi.spyOn(OvieOAuthIssuer.prototype, 'issueCode');
    const res = await GET(request(params));
    const login = new URL(res.headers.get('location')!);
    expect(login.pathname).toBe('/signin');
    assertPreserved(
      res,
      new URL(login.searchParams.get('redirect_url')!, origin).href,
      params
    );
    expect(m.auth).not.toHaveBeenCalled();
    expect(issue).not.toHaveBeenCalled();
  });

  it('recovers a wrong account through reset without issuing a code', async () => {
    m.role.mockResolvedValue(false);
    const params = authorization();
    const issue = vi.spyOn(OvieOAuthIssuer.prototype, 'issueCode');
    const res = await GET(request(params));
    const reset = new URL(res.headers.get('location')!);
    expect(reset.pathname).toBe('/api/auth/reset');
    assertPreserved(
      res,
      new URL(reset.searchParams.get('redirect_url')!, origin).href,
      params
    );
    expect(issue).not.toHaveBeenCalled();
  });

  it('recovers missing exact session proof without issuing authorization', async () => {
    const params = authorization();
    const issue = vi.spyOn(OvieOAuthIssuer.prototype, 'issueCode');
    const res = await GET(request(params));
    expect(res.status).toBe(307);
    const location = res.headers.get('location')!;
    expect(new URL(location).pathname).toBe('/ovie/connect');
    assertPreserved(res, location, params);
    expect(m.mfa).toHaveBeenCalledWith({
      userId: 'founder',
      sessionId: 'session-1',
    });
    expect(issue).not.toHaveBeenCalled();
    expect(res.headers.get('cache-control')).toBe('private, no-store');
    expect(res.headers.get('referrer-policy')).toBe('no-referrer');
  });

  it('rechecks fresh proof on every resume and rejects replay after proof expires', async () => {
    const params = authorization();
    const issue = vi.spyOn(OvieOAuthIssuer.prototype, 'issueCode');
    const first = await GET(request(params));
    const { nonce, cookieName, cookieValue } = handoffOf(
      first,
      first.headers.get('location')!
    );
    m.mfa.mockResolvedValue(true);
    m.auth.mockResolvedValue({
      userId: 'founder',
      sessionId: 'passkey-session',
    });
    const success = await GET(resume(nonce, cookieName, cookieValue));
    const target = new URL(success.headers.get('location')!);
    expect(`${target.origin}${target.pathname}`).toBe(callback);
    expect(target.searchParams.get('state')).toBe(state);
    expect(issue).toHaveBeenCalledOnce();
    expect(success.cookies.get(cookieName)?.value).toBe('');
    expect(m.ent).toHaveBeenCalledWith({ session: 'fresh' });
    expect(m.privacy).toHaveBeenCalledWith({
      userId: 'founder',
      sessionId: 'passkey-session',
    });
    const token = getOvieOAuthIssuer().exchangeToken({
      clientId: params.get('client_id')!,
      redirectUri: callback,
      code: target.searchParams.get('code')!,
      codeVerifier: verifier,
    });
    expect(token.scope).toBe('ovie:read ovie:write');
    m.mfa.mockResolvedValue(false);
    const replay = await GET(resume(nonce, cookieName, cookieValue));
    expect(new URL(replay.headers.get('location')!).pathname).toBe(
      '/ovie/connect'
    );
    expect(issue).toHaveBeenCalledOnce();
    expect((await GET(resume(nonce, cookieName, ''))).status).toBe(400);
  });

  it('denies a changed or revoked completing session even if entitlements look like a founder', async () => {
    m.auth.mockResolvedValue({ userId: null, sessionId: null });
    const issue = vi.spyOn(OvieOAuthIssuer.prototype, 'issueCode');
    expect((await GET(request())).status).toBe(401);
    expect(issue).not.toHaveBeenCalled();
  });

  it('preserves optional privacy gating after valid admin step-up', async () => {
    m.mfa.mockResolvedValue(true);
    m.privacy.mockRejectedValue(
      new OviePrivacyLockError('PRIVACY_UNLOCK_REQUIRED', 'Locked')
    );
    const issue = vi.spyOn(OvieOAuthIssuer.prototype, 'issueCode');
    const res = await GET(request());
    expect(new URL(res.headers.get('location')!).pathname).toBe(
      '/ovie/connect'
    );
    expect(issue).not.toHaveBeenCalled();
  });

  it('never exposes issuer errors or issues a code on a failed final mint', async () => {
    m.mfa.mockResolvedValue(true);
    vi.spyOn(OvieOAuthIssuer.prototype, 'issueCode').mockImplementation(() => {
      throw new Error('sensitive details');
    });
    const res = await GET(request());
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'access_denied' });
    expect(res.headers.has('location')).toBe(false);
  });

  it('fails closed on privacy store failure instead of creating a recovery loop', async () => {
    m.mfa.mockResolvedValue(true);
    m.privacy.mockRejectedValue(new Error('unavailable'));
    const issue = vi.spyOn(OvieOAuthIssuer.prototype, 'issueCode');
    const res = await GET(request());
    expect(res.status).toBe(503);
    expect(res.headers.has('location')).toBe(false);
    expect(issue).not.toHaveBeenCalled();
  });

  it.each([
    ['client_id', 'forged'],
    ['redirect_uri', 'https://attacker.example/callback'],
    ['redirect_uri', '//attacker.example/callback'],
    ['redirect_uri', 'https://chatgpt.com/other-callback'],
    ['response_type', 'token'],
    ['code_challenge_method', 'plain'],
    ['code_challenge', 'invalid'],
  ])(
    'rejects invalid %s before sign-in or any authorization',
    async (key, value) => {
      const params = authorization();
      params.set(key, value);
      const res = await GET(request(params));
      expect(res.status).toBe(400);
      expect(res.headers.has('location')).toBe(false);
      expect(m.ent).not.toHaveBeenCalled();
      expect(m.auth).not.toHaveBeenCalled();
    }
  );

  it('rejects duplicate OAuth parameters used to confuse the handoff', async () => {
    const params = authorization();
    params.append('redirect_uri', 'https://attacker.example/callback');
    expect((await GET(request(params))).status).toBe(400);
    expect(m.ent).not.toHaveBeenCalled();
  });
});
