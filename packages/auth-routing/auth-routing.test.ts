import { describe, expect, it } from 'vitest';
import {
  buildAuthStartUrl,
  buildElectronAuthCompleteUrl,
  buildIosAuthCompleteUrl,
  buildNativeExchangeCodeRecord,
  classifyNavigation,
  createAuthAnalyticsEvent,
  createAuthStateRecord,
  getElectronAuthCompleteProtocolForOrigin,
  resolveAuthCallback,
  sanitizeReturnTo,
  validateNativeExchange,
} from './index';

describe('auth routing boundary', () => {
  it('builds explicit client-bound auth start URLs', () => {
    expect(
      buildAuthStartUrl({
        baseUrl: 'https://jov.ie',
        client: 'ios',
        intent: 'sign_in',
        returnTo: '/app',
        codeChallenge: 'challenge',
      })
    ).toBe(
      'https://jov.ie/auth/start?client=ios&intent=sign_in&return_to=%2Fapp&code_challenge=challenge&code_challenge_method=S256'
    );
  });

  it('sanitizes return destinations per originating client', () => {
    expect(sanitizeReturnTo('ios', '/app/profile?mode=qr')).toBe(
      '/app/profile?mode=qr'
    );
    expect(sanitizeReturnTo('electron', '/app/settings')).toBe('/app/settings');
    expect(sanitizeReturnTo('web', '/start')).toBe('/start');

    expect(sanitizeReturnTo('ios', '/legal/privacy')).toBeNull();
    expect(sanitizeReturnTo('electron', '/blog')).toBeNull();
  });

  it.each([
    'https://evil.example/app',
    '//evil.example/app',
    '/%2f%2fevil.example/app',
    '/%5cevil.example/app',
    '/api/mobile/v1/me',
    '/__clerk/v1/client',
    '/clerk/v1/client',
    '/signin',
    '/signup',
    '/sso-callback',
    '/auth/callback',
    '/auth/start',
    '/mobile-auth-return',
    '/desktop-auth',
  ])('rejects unsafe return_to %s', value => {
    expect(sanitizeReturnTo('web', value)).toBeNull();
    expect(sanitizeReturnTo('ios', value)).toBeNull();
    expect(sanitizeReturnTo('electron', value)).toBeNull();
  });

  it('resolves callbacks only to the originating client surface', () => {
    const iosState = createAuthStateRecord({
      client: 'ios',
      intent: 'sign_in',
      returnTo: '/app',
      state: 'ios_state',
      codeChallenge: 'ios_challenge',
      now: 1_000,
    });
    const electronState = createAuthStateRecord({
      client: 'electron',
      intent: 'sign_in',
      returnTo: '/app/settings',
      state: 'electron_state',
      codeChallenge: 'desktop_challenge',
      now: 1_000,
    });
    const webState = createAuthStateRecord({
      client: 'web',
      intent: 'sign_in',
      returnTo: '/app',
      state: 'web_state',
      now: 1_000,
    });

    expect(
      resolveAuthCallback({
        stateRecord: iosState,
        exchangeCode: 'ios_code',
      })
    ).toEqual({
      client: 'ios',
      redirectUrl: 'ie.jov.jovie://auth/complete?code=ios_code&state=ios_state',
    });
    expect(
      resolveAuthCallback({
        stateRecord: electronState,
        exchangeCode: 'electron_code',
      })
    ).toEqual({
      client: 'electron',
      redirectUrl:
        'jovie://auth/complete?code=electron_code&state=electron_state',
    });
    expect(resolveAuthCallback({ stateRecord: webState })).toEqual({
      client: 'web',
      redirectUrl: '/app',
    });
  });

  it('rejects cross-client callback resolution', () => {
    const stateRecord = createAuthStateRecord({
      client: 'ios',
      intent: 'sign_in',
      returnTo: '/app',
      state: 'ios_state',
      codeChallenge: 'challenge',
      now: 1_000,
    });

    expect(() =>
      resolveAuthCallback({
        stateRecord,
        exchangeCode: 'code',
        requestedClient: 'electron',
      })
    ).toThrow(/wrong surface/i);
  });

  it('validates native exchange code once and against client, state, expiry, and verifier', () => {
    const exchangeRecord = buildNativeExchangeCodeRecord({
      code: 'code',
      client: 'ios',
      state: 'state',
      userId: 'user_123',
      returnTo: '/app',
      codeChallenge: 'known_challenge',
      now: 1_000,
    });

    expect(
      validateNativeExchange({
        record: exchangeRecord,
        client: 'ios',
        code: 'code',
        state: 'state',
        codeVerifier: 'known_verifier',
        now: 2_000,
        createCodeChallenge: () => 'known_challenge',
      })
    ).toEqual({
      ok: true,
      userId: 'user_123',
      returnTo: '/app',
      ott: null,
    });

    expect(
      validateNativeExchange({
        record: exchangeRecord,
        client: 'electron',
        code: 'code',
        state: 'state',
        codeVerifier: 'known_verifier',
        now: 2_000,
        createCodeChallenge: () => 'known_challenge',
      })
    ).toEqual({ ok: false, reason: 'wrong_client' });

    expect(
      validateNativeExchange({
        record: { ...exchangeRecord, consumedAt: 1_500 },
        client: 'ios',
        code: 'code',
        state: 'state',
        codeVerifier: 'known_verifier',
        now: 2_000,
        createCodeChallenge: () => 'known_challenge',
      })
    ).toEqual({ ok: false, reason: 'replayed' });

    expect(
      validateNativeExchange({
        record: exchangeRecord,
        client: 'ios',
        code: 'wrong_code',
        state: 'state',
        codeVerifier: 'known_verifier',
        now: 2_000,
        createCodeChallenge: () => 'known_challenge',
      })
    ).toEqual({ ok: false, reason: 'wrong_code' });

    expect(
      validateNativeExchange({
        record: exchangeRecord,
        client: 'ios',
        code: 'code',
        state: 'other_state',
        codeVerifier: 'known_verifier',
        now: 2_000,
        createCodeChallenge: () => 'known_challenge',
      })
    ).toEqual({ ok: false, reason: 'wrong_state' });

    expect(
      validateNativeExchange({
        record: exchangeRecord,
        client: 'ios',
        code: 'code',
        state: 'state',
        codeVerifier: 'wrong_verifier',
        now: 2_000,
        createCodeChallenge: () => 'wrong_challenge',
      })
    ).toEqual({ ok: false, reason: 'wrong_verifier' });

    expect(
      validateNativeExchange({
        record: exchangeRecord,
        client: 'ios',
        code: 'code',
        state: 'state',
        codeVerifier: 'known_verifier',
        now: exchangeRecord.expiresAt + 1,
        createCodeChallenge: () => 'known_challenge',
      })
    ).toEqual({ ok: false, reason: 'expired' });
  });

  it('classifies native navigation boundaries', () => {
    const options = { appUrl: 'https://jov.ie' };

    expect(
      classifyNavigation('ios', 'https://jov.ie/legal/privacy', options)
    ).toBe('external');
    expect(classifyNavigation('electron', 'https://jov.ie/tim', options)).toBe(
      'external'
    );
    expect(
      classifyNavigation('ios', 'https://jov.ie/app/settings', options)
    ).toBe('internal');
    expect(
      classifyNavigation('electron', 'https://jov.ie/auth/start', options)
    ).toBe('auth');
    expect(
      classifyNavigation('web', 'https://jov.ie/legal/privacy', options)
    ).toBe('internal');
  });

  it('uses separate native callback builders', () => {
    expect(buildIosAuthCompleteUrl({ code: 'c', state: 's' })).toBe(
      'ie.jov.jovie://auth/complete?code=c&state=s'
    );
    expect(buildElectronAuthCompleteUrl({ code: 'c', state: 's' })).toBe(
      'jovie://auth/complete?code=c&state=s'
    );
    expect(
      buildElectronAuthCompleteUrl({
        code: 'c',
        state: 's',
        desktopFlow: 'desktop_flow_nonce_12345',
      })
    ).toBe(
      'jovie://auth/complete?code=c&state=s&desktop_flow=desktop_flow_nonce_12345'
    );
    expect(
      buildElectronAuthCompleteUrl({
        code: 'c',
        state: 's',
        protocol: 'jovie-staging',
      })
    ).toBe('jovie-staging://auth/complete?code=c&state=s');
    expect(
      buildElectronAuthCompleteUrl({
        code: 'c',
        state: 's',
        protocol: 'jovie-local',
      })
    ).toBe('jovie-local://auth/complete?code=c&state=s');
  });

  it('derives the Electron callback protocol from the app origin', () => {
    expect(getElectronAuthCompleteProtocolForOrigin('https://jov.ie')).toBe(
      'jovie'
    );
    expect(
      getElectronAuthCompleteProtocolForOrigin('https://staging.jov.ie')
    ).toBe('jovie-staging');
    expect(
      getElectronAuthCompleteProtocolForOrigin('http://localhost:3112')
    ).toBe('jovie-local');
    expect(
      getElectronAuthCompleteProtocolForOrigin('http://127.0.0.1:3112')
    ).toBe('jovie-local');
    expect(
      getElectronAuthCompleteProtocolForOrigin('http://foo.localhost:3112')
    ).toBe('jovie-local');
    expect(getElectronAuthCompleteProtocolForOrigin('http://[::1]:3112')).toBe(
      'jovie-local'
    );
    expect(getElectronAuthCompleteProtocolForOrigin('not a url')).toBe('jovie');
  });

  it('creates analytics payloads without leaking return URLs or token values', () => {
    expect(
      createAuthAnalyticsEvent('auth_wrong_surface_prevented', {
        client: 'ios',
        intent: 'sign_in',
        result: 'blocked',
        reason: 'cross_client',
        returnTo: '/app/settings?token=secret',
        state: 'state_secret',
      })
    ).toEqual({
      event: 'auth_wrong_surface_prevented',
      client: 'ios',
      intent: 'sign_in',
      result: 'blocked',
      reason: 'cross_client',
      returnPath: '/app/settings',
    });
  });
});
