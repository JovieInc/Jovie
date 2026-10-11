import { describe, expect, it } from 'vitest';
import {
  buildAuthStartUrl,
  buildDesktopAuthLoopbackUrl,
  buildElectronAuthCompleteUrl,
  buildIosAuthCompleteUrl,
  buildIosUniversalAuthCompleteUrl,
  buildNativeExchangeCodeRecord,
  buildNativeHandbackBouncePath,
  classifyNavigation,
  createAuthAnalyticsEvent,
  createAuthStateRecord,
  getElectronAuthCompleteProtocolForOrigin,
  isAllowlistedNativeHandbackUrl,
  isValidNativeAttempt,
  NATIVE_HANDBACK_BOUNCE_PATHS,
  parseDesktopLoopbackPortParam,
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
      classifyNavigation(
        'ios',
        'https://jov.ie/auth/ios/complete?code=c&state=s',
        options
      )
    ).toBe('auth');
    expect(
      classifyNavigation(
        'electron',
        'https://jov.ie/auth/native-return?code=c&state=s',
        options
      )
    ).toBe('auth');
    expect(
      classifyNavigation('ios', 'https://jov.ie/app/library', options)
    ).toBe('internal');
    expect(classifyNavigation('ios', 'https://jov.ie/pricing', options)).toBe(
      'external'
    );
    expect(
      classifyNavigation('ios', 'https://jov.ie/openapi.json', options)
    ).toBe('blocked');
    expect(
      classifyNavigation('electron', 'https://jov.ie/auth/start', options)
    ).toBe('auth');
    expect(
      classifyNavigation('web', 'https://jov.ie/legal/privacy', options)
    ).toBe('internal');
  });

  it('builds same-origin bounce paths instead of web app pages', () => {
    expect(
      buildNativeHandbackBouncePath({
        client: 'ios',
        code: 'ios_code',
        state: 'ios_state',
      })
    ).toBe(`${NATIVE_HANDBACK_BOUNCE_PATHS.ios}?code=ios_code&state=ios_state`);
    expect(
      buildNativeHandbackBouncePath({
        client: 'electron',
        code: 'electron_code',
        state: 'electron_state',
        desktopFlow: 'flow_nonce',
      })
    ).toBe(
      `${NATIVE_HANDBACK_BOUNCE_PATHS.electron}?code=electron_code&state=electron_state&desktop_flow=flow_nonce`
    );
    expect(
      buildNativeHandbackBouncePath({
        client: 'electron',
        code: 'electron_code',
        state: 'electron_state',
        desktopFlow: 'flow_nonce',
        returnCode: 'BCDFGHJK',
      })
    ).toBe(
      `${NATIVE_HANDBACK_BOUNCE_PATHS.electron}?code=electron_code&state=electron_state&desktop_flow=flow_nonce&return_code=BCDFGHJK`
    );
    // A return code is only meaningful with a desktop flow to redeem against,
    // and never leaks onto the iOS bounce.
    expect(
      buildNativeHandbackBouncePath({
        client: 'electron',
        code: 'electron_code',
        state: 'electron_state',
        returnCode: 'BCDFGHJK',
      })
    ).not.toContain('return_code');
    expect(
      buildNativeHandbackBouncePath({
        client: 'ios',
        code: 'ios_code',
        state: 'ios_state',
        desktopFlow: 'flow_nonce',
        returnCode: 'BCDFGHJK',
      })
    ).toBe(`${NATIVE_HANDBACK_BOUNCE_PATHS.ios}?code=ios_code&state=ios_state`);
  });

  it('threads the loopback listener port onto the electron bounce only', () => {
    expect(
      buildNativeHandbackBouncePath({
        client: 'electron',
        code: 'electron_code',
        state: 'electron_state',
        desktopFlow: 'flow_nonce',
        desktopLoopbackPort: 51234,
      })
    ).toBe(
      `${NATIVE_HANDBACK_BOUNCE_PATHS.electron}?code=electron_code&state=electron_state&desktop_flow=flow_nonce&loopback_port=51234`
    );
    // No flow to bind to, and never on the iOS bounce.
    expect(
      buildNativeHandbackBouncePath({
        client: 'electron',
        code: 'electron_code',
        state: 'electron_state',
        desktopLoopbackPort: 51234,
      })
    ).not.toContain('loopback_port');
    expect(
      buildNativeHandbackBouncePath({
        client: 'ios',
        code: 'ios_code',
        state: 'ios_state',
        desktopFlow: 'flow_nonce',
        desktopLoopbackPort: 51234,
      })
    ).toBe(`${NATIVE_HANDBACK_BOUNCE_PATHS.ios}?code=ios_code&state=ios_state`);
  });

  it('accepts only real TCP ports for the loopback listener', () => {
    expect(parseDesktopLoopbackPortParam('51234')).toBe(51234);
    expect(parseDesktopLoopbackPortParam('1')).toBe(1);
    expect(parseDesktopLoopbackPortParam('65535')).toBe(65535);
    for (const bad of [
      null,
      '',
      '0',
      '65536',
      '80.5',
      '-1',
      'abc',
      '51234;rm',
      ' 51234',
      '000000',
    ]) {
      expect(parseDesktopLoopbackPortParam(bad)).toBeNull();
    }
  });

  it('builds a 127.0.0.1 handback URL bound to code, state, and flow', () => {
    expect(
      buildDesktopAuthLoopbackUrl({
        port: 51234,
        code: 'electron_code',
        state: 'electron_state',
        desktopFlow: 'flow_nonce',
      })
    ).toBe(
      'http://127.0.0.1:51234/auth/complete?code=electron_code&state=electron_state&desktop_flow=flow_nonce'
    );
  });

  it('only lets Electron flows with a flow nonce record a loopback port', () => {
    const base = {
      intent: 'sign_in' as const,
      state: 'state_123',
      codeChallenge: 'challenge',
      desktopFlow: 'flow_nonce_abcdef123456',
      now: 1_000,
    };
    expect(
      createAuthStateRecord({
        ...base,
        client: 'electron',
        returnTo: '/app',
        desktopLoopbackPort: 51234,
      }).desktopLoopbackPort
    ).toBe(51234);
    expect(
      createAuthStateRecord({
        ...base,
        client: 'electron',
        returnTo: '/app',
        desktopFlow: null,
        desktopLoopbackPort: 51234,
      }).desktopLoopbackPort
    ).toBeUndefined();
    expect(
      createAuthStateRecord({
        ...base,
        client: 'ios',
        returnTo: '/app',
        desktopLoopbackPort: 51234,
      }).desktopLoopbackPort
    ).toBeUndefined();
    expect(
      createAuthStateRecord({
        ...base,
        client: 'electron',
        returnTo: '/app',
        desktopLoopbackPort: 70000,
      }).desktopLoopbackPort
    ).toBeUndefined();
  });

  it('only lets Electron flows with a flow nonce opt into return codes', () => {
    const base = {
      intent: 'sign_in' as const,
      state: 'state_123',
      codeChallenge: 'challenge',
      now: 1_000,
    };
    expect(
      createAuthStateRecord({
        ...base,
        client: 'electron',
        returnTo: '/app',
        desktopFlow: 'flow_nonce_abcdef123456',
        desktopReturnCode: true,
      }).desktopReturnCode
    ).toBe(true);
    expect(
      createAuthStateRecord({
        ...base,
        client: 'electron',
        returnTo: '/app',
        desktopReturnCode: true,
      }).desktopReturnCode
    ).toBe(false);
    expect(
      createAuthStateRecord({
        ...base,
        client: 'ios',
        returnTo: '/app',
        desktopFlow: 'flow_nonce_abcdef123456',
        desktopReturnCode: true,
      }).desktopReturnCode
    ).toBe(false);
  });

  it.each([
    'ie.jov.jovie://auth/complete?code=c&state=s',
    'jovie://auth/complete?code=c&state=s',
    'jovie-staging://auth/complete?code=c&state=s',
    'jovie-local://auth/complete?code=c&state=s',
    'https://jov.ie/auth/ios/complete?code=c&state=s',
    'https://staging.jov.ie/auth/native-return?code=c&state=s',
    'http://localhost:3112/auth/ios/complete?code=c&state=s',
  ])('allowlists native handback target %s', url => {
    expect(isAllowlistedNativeHandbackUrl(url)).toBe(true);
  });

  it.each([
    'https://jov.ie/app',
    'https://jov.ie/app/library',
    'https://jov.ie/tim',
    'https://jov.ie/signin',
    'https://evil.example/auth/ios/complete?code=c&state=s',
    'http://jov.ie/auth/ios/complete?code=c&state=s',
    'ie.jov.jovie://evil/complete',
    'jovie://settings',
  ])('rejects untrusted handback target %s', url => {
    expect(isAllowlistedNativeHandbackUrl(url)).toBe(false);
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
  it.each([
    null,
    '',
    'a'.repeat(42),
    'a'.repeat(44),
    '+'.repeat(43),
    ' '.repeat(43),
    `${'a'.repeat(43)}\n`,
  ])(
    'rejects malformed attempt %s without downgrading to legacy',
    nativeAttempt => {
      expect(isValidNativeAttempt('ios', nativeAttempt)).toBe(false);
    }
  );

  it('carries iOS correlation through every handback builder and preserves legacy omission', () => {
    const nativeAttempt = 'a'.repeat(43);
    const start = {
      baseUrl: 'https://jov.ie',
      client: 'ios' as const,
      intent: 'sign_in' as const,
      returnTo: '/app',
      nativeAttempt,
    };
    const stateRecord = createAuthStateRecord({
      ...start,
      state: 'state',
      now: 1,
    });
    const handback = { code: 'code', state: 'state', nativeAttempt };
    const urls = [
      buildAuthStartUrl(start),
      buildIosAuthCompleteUrl(handback),
      buildIosUniversalAuthCompleteUrl({
        ...handback,
        origin: 'https://jov.ie',
      }),
      buildNativeHandbackBouncePath({ ...handback, client: 'ios' }),
      resolveAuthCallback({ stateRecord, exchangeCode: 'code' }).redirectUrl,
    ];
    for (const url of urls) {
      expect(
        new URL(url, 'https://jov.ie').searchParams.getAll('native_attempt')
      ).toEqual([nativeAttempt]);
    }
    expect(
      createAuthStateRecord({
        ...start,
        nativeAttempt: undefined,
        state: 's',
        now: 1,
      })
    ).not.toHaveProperty('nativeAttempt');
    for (const client of ['web', 'electron'] as const) {
      expect(() => buildAuthStartUrl({ ...start, client })).toThrow(
        'Invalid native_attempt'
      );
    }
  });

  it.each([
    [undefined, 'a'.repeat(43)],
    ['a'.repeat(43), undefined],
    ['a'.repeat(43), 'b'.repeat(43)],
  ])(
    'rejects attempt mismatch %s / %s before PKCE',
    (storedAttempt, nativeAttempt) => {
      const record = buildNativeExchangeCodeRecord({
        code: 'code',
        client: 'ios',
        state: 'state',
        userId: 'user',
        returnTo: '/app',
        codeChallenge: 'challenge',
        nativeAttempt: storedAttempt,
        now: 1,
      });
      let challengeCalls = 0;
      const result = validateNativeExchange({
        record,
        client: 'ios',
        code: 'code',
        state: 'state',
        nativeAttempt,
        codeVerifier: 'v',
        now: 2,
        createCodeChallenge: () => {
          challengeCalls++;
          return 'challenge';
        },
      });
      expect(result).toEqual({ ok: false, reason: 'wrong_attempt' });
      expect(challengeCalls).toBe(0);
    }
  );
});
