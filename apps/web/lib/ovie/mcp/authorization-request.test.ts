import { afterEach, describe, expect, it, vi } from 'vitest';
import { categorizePath } from '@/lib/routing/proxy-routing';
import {
  createOvieOAuthHandoff,
  OVIE_OAUTH_HANDOFF_TTL_SECONDS,
  ovieOAuthHandoffCookie,
  ovieOAuthRecoveryPurpose,
  readOvieOAuthHandoff,
} from './authorization-request';
import {
  getOvieOAuthIssuer,
  ovieIssuerSecret,
  pkceS256,
  signPayload,
} from './oauth';

afterEach(() => vi.useRealTimers());
describe('Ovie OAuth recovery classification', () => {
  it('protects the recovery page with auth CSP and avoids profile rewrites', () => {
    expect(categorizePath('/ovie/connect')).toMatchObject({
      needsNonce: true,
      isAuthPath: true,
      publicProfileCandidate: null,
    });
  });
  it('binds each preserved request to a unique signed, expiring browser cookie', () => {
    vi.useFakeTimers();
    const clientId = getOvieOAuthIssuer().registerClient({
      redirect_uris: ['https://chatgpt.com/callback'],
    }).client_id;
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: 'https://chatgpt.com/callback',
      code_challenge: pkceS256('verifier'),
      code_challenge_method: 'S256',
      state: 'opaque',
    });
    const handoff = createOvieOAuthHandoff(params);
    expect(
      readOvieOAuthHandoff(handoff.nonce, handoff.cookieValue)?.state
    ).toBe('opaque');
    expect(createOvieOAuthHandoff(params).nonce).not.toBe(handoff.nonce);
    expect(readOvieOAuthHandoff(handoff.nonce)).toBeNull();
    expect(
      readOvieOAuthHandoff('a'.repeat(32), handoff.cookieValue)
    ).toBeNull();
    expect(
      readOvieOAuthHandoff(handoff.nonce, handoff.cookieValue + 'tampered')
    ).toBeNull();
    expect(
      readOvieOAuthHandoff(
        handoff.nonce,
        signPayload(ovieIssuerSecret(), {
          t: 'h',
          nonce: handoff.nonce,
          query: 'redirect_uri=https://attacker.example',
          expiresAt: Date.now() + 1000,
        })
      )
    ).toBeNull();
    expect(ovieOAuthHandoffCookie('../arbitrary')).toBeNull();
    vi.advanceTimersByTime(OVIE_OAUTH_HANDOFF_TTL_SECONDS * 1000);
    expect(readOvieOAuthHandoff(handoff.nonce, handoff.cookieValue)).toBeNull();
  });
  it.each([
    ['PASSKEY_STEP_UP_REQUIRED', 'admin'],
    ['PRIVACY_UNLOCK_REQUIRED', 'privacy'],
    ['FORBIDDEN', null],
    ['PRIVACY_STATE_CHANGED', null],
  ])('only recovers known denial %s', async (code, expected) => {
    const res = Response.json({ code }, { status: 403 });
    expect(await ovieOAuthRecoveryPurpose(res)).toBe(expected);
    expect((await res.json()).code).toBe(code);
  });
  it('does not treat a store outage as recoverable', async () => {
    expect(
      await ovieOAuthRecoveryPurpose(Response.json({}, { status: 503 }))
    ).toBeNull();
  });
});
