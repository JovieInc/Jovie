import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ access: vi.fn(), cookie: vi.fn() }));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: m.cookie }) }));
vi.mock('next/navigation', () => ({
  redirect: (path: string) => {
    throw new Error(`redirect:${path}`);
  },
}));
vi.mock('@/lib/ovie/privacy-lock/access', () => ({
  requireOvieApiAccess: m.access,
}));
vi.mock('./OvieConnectVerification', () => ({
  OvieConnectVerification: () => null,
}));

import { createOvieOAuthHandoff } from '@/lib/ovie/mcp/authorization-request';
import { getOvieOAuthIssuer, pkceS256 } from '@/lib/ovie/mcp/oauth';
import Page from './page';

function handoff() {
  const clientId = getOvieOAuthIssuer().registerClient({
    redirect_uris: ['https://chatgpt.com/callback'],
  }).client_id;
  const value = createOvieOAuthHandoff(
    new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: 'https://chatgpt.com/callback',
      code_challenge: pkceS256('verifier'),
      code_challenge_method: 'S256',
      state: 'opaque',
    })
  );
  m.cookie.mockReturnValue({ value: value.cookieValue });
  return value;
}
beforeEach(() => {
  vi.clearAllMocks();
  m.access.mockResolvedValue(
    Response.json({ code: 'PASSKEY_STEP_UP_REQUIRED' }, { status: 403 })
  );
  m.cookie.mockReturnValue(undefined);
});
describe('Ovie recovery page server boundary', () => {
  it.each([
    ['PASSKEY_STEP_UP_REQUIRED', 'admin'],
    ['PRIVACY_UNLOCK_REQUIRED', 'privacy'],
  ])('only renders the server-required %s ceremony', async (code, purpose) => {
    const value = handoff();
    m.access.mockResolvedValue(Response.json({ code }, { status: 403 }));
    const element = await Page({
      searchParams: Promise.resolve({ handoff: value.nonce }),
    });
    expect(element.props).toMatchObject({
      purpose,
      authorizePath: value.authorizePath,
    });
    expect(m.access).toHaveBeenCalledWith({ privileged: true });
  });
  it('resumes existing valid proof through the authorizing route', async () => {
    const value = handoff();
    m.access.mockResolvedValue(null);
    await expect(
      Page({ searchParams: Promise.resolve({ handoff: value.nonce }) })
    ).rejects.toThrow(`redirect:${value.authorizePath}`);
  });
  it.each([
    ['UNAUTHORIZED', 401, '/signin'],
    ['FORBIDDEN', 403, '/api/auth/reset'],
  ])(
    'sends %s to founder recovery without rendering a ceremony',
    async (code, status, path) => {
      const value = handoff();
      m.access.mockResolvedValue(Response.json({ code }, { status }));
      await expect(
        Page({ searchParams: Promise.resolve({ handoff: value.nonce }) })
      ).rejects.toThrow(`redirect:${path}?redirect_url=`);
    }
  );
  it('fails closed when a foreign browser has no matching handoff cookie', async () => {
    const value = handoff();
    m.cookie.mockReturnValue(undefined);
    const element = await Page({
      searchParams: Promise.resolve({ handoff: value.nonce }),
    });
    expect(element.props.role).toBe('alert');
    expect(m.access).not.toHaveBeenCalled();
  });
  it.each([
    { handoff: ['a', 'b'] },
    { handoff: 'forged' },
    { redirect_url: '//attacker.example' },
  ])('rejects forged return context before checking auth', async params => {
    const element = await Page({ searchParams: Promise.resolve(params) });
    expect(element.props.role).toBe('alert');
    expect(m.access).not.toHaveBeenCalled();
  });
  it('shows bounded recovery on private-store outages', async () => {
    const value = handoff();
    m.access.mockResolvedValue(
      Response.json({ code: 'PRIVACY_UNAVAILABLE' }, { status: 503 })
    );
    const element = await Page({
      searchParams: Promise.resolve({ handoff: value.nonce }),
    });
    expect(element.props.role).toBe('alert');
  });
});
