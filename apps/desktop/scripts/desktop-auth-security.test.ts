import { expect, test } from 'vitest';
import {
  bindPendingDesktopAuthCompletion,
  DESKTOP_AUTH_FLOW_PARAM,
  isPendingDesktopAuthPkceExpired,
  isValidDesktopAuthFlowNonce,
  isValidNativeAuthToken,
  parseAuthReturnDeepLink,
  type PendingDesktopAuthPkce,
} from '../src/desktop-auth-security.ts';
import {
  shouldGrantTrustedAudioPermission,
  shouldGrantTrustedAudioPermissionCheck,
} from '../src/desktop-permissions.ts';
import { evaluateTrustedOriginCspHeaders } from '../src/desktop-csp-watchdog.ts';
import { sanitizeWindowState } from '../src/window-state.ts';

const VALID_CODE = '00000000000040008000000000000001';
const VALID_STATE = '11111111111141111111111111111111';
const VALID_FLOW = 'desktop_flow_nonce_12345';

function parseTestUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function createPendingPkce(
  overrides: Partial<PendingDesktopAuthPkce> = {}
): PendingDesktopAuthPkce {
  return {
    codeVerifier: 'verifier',
    codeChallenge: 'challenge',
    flowNonce: VALID_FLOW,
    createdAt: Date.now(),
    ...overrides,
  };
}

test('native auth tokens reject bad charset and length', () => {
  expect(isValidNativeAuthToken(VALID_CODE)).toBe(true);
  expect(isValidNativeAuthToken('short')).toBe(false);
  expect(isValidNativeAuthToken(`${VALID_CODE}!`)).toBe(false);
  expect(isValidNativeAuthToken('g'.repeat(32))).toBe(false);
});

test('desktop auth flow nonce rejects malformed values', () => {
  expect(isValidDesktopAuthFlowNonce(VALID_FLOW)).toBe(true);
  expect(isValidDesktopAuthFlowNonce('short')).toBe(false);
  expect(isValidDesktopAuthFlowNonce('bad flow')).toBe(false);
});

test('parseAuthReturnDeepLink rejects malformed deep links', () => {
  const validUrl = `jovie://auth/complete?code=${VALID_CODE}&state=${VALID_STATE}&${DESKTOP_AUTH_FLOW_PARAM}=${VALID_FLOW}`;
  expect(
    parseAuthReturnDeepLink(
      validUrl,
      parseTestUrl,
      'jovie:',
      'auth',
      '/complete'
    )
  ).toEqual({
    code: VALID_CODE,
    state: VALID_STATE,
    flowNonce: VALID_FLOW,
  });

  expect(
    parseAuthReturnDeepLink(
      `jovie://auth/complete?code=bad&state=${VALID_STATE}&${DESKTOP_AUTH_FLOW_PARAM}=${VALID_FLOW}`,
      parseTestUrl,
      'jovie:',
      'auth',
      '/complete'
    )
  ).toBeNull();

  expect(
    parseAuthReturnDeepLink(
      `jovie://auth/complete?code=${VALID_CODE}&state=${VALID_STATE}`,
      parseTestUrl,
      'jovie:',
      'auth',
      '/complete'
    )
  ).toEqual({
    code: VALID_CODE,
    state: VALID_STATE,
    flowNonce: null,
  });
});

test('bindPendingDesktopAuthCompletion enforces pending flow, ttl, and nonce', () => {
  const completion = {
    code: VALID_CODE,
    state: VALID_STATE,
    flowNonce: VALID_FLOW,
  };

  expect(bindPendingDesktopAuthCompletion(null, completion)).toEqual({
    ok: false,
    reason: 'no-pending-flow',
  });

  expect(
    bindPendingDesktopAuthCompletion(
      createPendingPkce({ createdAt: Date.now() - 11 * 60 * 1000 }),
      completion
    )
  ).toEqual({
    ok: false,
    reason: 'pkce-expired',
  });

  expect(
    bindPendingDesktopAuthCompletion(
      createPendingPkce({ flowNonce: 'other_flow_nonce_1' }),
      completion
    )
  ).toEqual({
    ok: false,
    reason: 'flow-mismatch',
  });

  expect(
    bindPendingDesktopAuthCompletion(createPendingPkce(), {
      ...completion,
      flowNonce: null,
    })
  ).toEqual({
    ok: false,
    reason: 'flow-mismatch',
  });

  expect(
    bindPendingDesktopAuthCompletion(createPendingPkce(), completion)
  ).toEqual({
    ok: true,
    codeVerifier: 'verifier',
  });
});

test('pending desktop auth pkce expires after the configured ttl', () => {
  const pending = createPendingPkce({ createdAt: 1_000 });
  expect(isPendingDesktopAuthPkceExpired(pending, 1_000)).toBe(false);
  expect(isPendingDesktopAuthPkceExpired(pending, 1_000 + 10 * 60 * 1000)).toBe(
    false
  );
  expect(
    isPendingDesktopAuthPkceExpired(pending, 1_000 + 10 * 60 * 1000 + 1)
  ).toBe(true);
});

test('desktop permission matrix grants only trusted audio requests', () => {
  const appOrigin = 'https://jov.ie';
  const parseUrl = parseTestUrl;

  expect(
    shouldGrantTrustedAudioPermission({
      permission: 'media',
      details: { mediaTypes: ['audio'] },
      webContents: null,
      requestingOrigin: `${appOrigin}/app/chat`,
      parseUrl,
      appOrigin,
    })
  ).toBe(true);

  expect(
    shouldGrantTrustedAudioPermission({
      permission: 'media',
      details: { mediaTypes: ['audio', 'video'] },
      webContents: null,
      requestingOrigin: `${appOrigin}/app/chat`,
      parseUrl,
      appOrigin,
    })
  ).toBe(false);

  for (const permission of [
    'geolocation',
    'notifications',
    'midi',
    'pointerLock',
  ] as const) {
    expect(
      shouldGrantTrustedAudioPermission({
        permission,
        details: {},
        webContents: null,
        requestingOrigin: `${appOrigin}/app/chat`,
        parseUrl,
        appOrigin,
      })
    ).toBe(false);
  }

  expect(
    shouldGrantTrustedAudioPermissionCheck({
      permission: 'media',
      details: { mediaType: 'audio' },
      webContents: null,
      requestingOrigin: `${appOrigin}/app/chat`,
      parseUrl,
      appOrigin,
    })
  ).toBe(true);

  expect(
    shouldGrantTrustedAudioPermissionCheck({
      permission: 'geolocation',
      details: { mediaType: 'audio' },
      webContents: null,
      requestingOrigin: `${appOrigin}/app/chat`,
      parseUrl,
      appOrigin,
    })
  ).toBe(false);
});

test('csp watchdog classifies missing and weakened upstream policies', () => {
  const strongPolicy =
    "default-src 'self'; script-src 'self' 'nonce-abc'; object-src 'none'; base-uri 'self'";

  expect(
    evaluateTrustedOriginCspHeaders({
      responseHeaders: {
        'content-security-policy': strongPolicy,
      },
    })
  ).toBe('present');

  expect(
    evaluateTrustedOriginCspHeaders({
      responseHeaders: {},
    })
  ).toBe('missing');

  expect(
    evaluateTrustedOriginCspHeaders({
      responseHeaders: {
        'content-security-policy': "default-src *; script-src *; object-src *",
      },
    })
  ).toBe('weakened');
});

test('window state clamps to display bounds', () => {
  const display = { x: 0, y: 0, width: 1440, height: 900 };
  const events: string[] = [];

  expect(
    sanitizeWindowState(
      { x: -400, y: -200, width: 4000, height: 3000 },
      display,
      (event) => {
        events.push(event);
      }
    )
  ).toEqual({
    x: 0,
    y: 0,
    width: 1440,
    height: 900,
  });
  expect(events).toEqual(['window-state-clamped']);
});