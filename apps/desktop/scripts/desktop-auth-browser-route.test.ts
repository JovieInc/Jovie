import { describe, expect, test, vi } from 'vitest';
import {
  clearDesktopBrowserAuthRouteState,
  type DesktopAuthIntent,
  emptyDesktopBrowserAuthRouteState,
  rememberDesktopBrowserAuthRoutePkce,
  resolveDesktopBrowserAuthRoute,
  setDesktopAuthRecoveryNavigationPending,
} from '../src/desktop-auth-browser-route';
import type { PendingDesktopAuthPkce } from '../src/desktop-auth-security';

const APP_ORIGIN = 'https://jov.ie';
const NOW = 1_000_000;

function pkce(sequence: number): PendingDesktopAuthPkce {
  return {
    codeVerifier: `verifier-${sequence}`,
    codeChallenge: `challenge-${sequence}`,
    flowNonce: `flow_nonce_${sequence}_123456`,
    createdAt: NOW,
  };
}

function centralUrl(
  pending: PendingDesktopAuthPkce,
  intent: DesktopAuthIntent = 'sign_in',
  returnTo = '/app'
): string {
  const url = new URL('/auth/start', APP_ORIGIN);
  url.searchParams.set('client', 'electron');
  url.searchParams.set('intent', intent);
  url.searchParams.set('return_to', returnTo);
  url.searchParams.set('code_challenge', pending.codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('desktop_flow', pending.flowNonce);
  return `${url.pathname}${url.search}`;
}

function resolver(
  state = emptyDesktopBrowserAuthRouteState(),
  createCentralRoute = vi.fn((intent: DesktopAuthIntent, returnTo: string) => {
    const pendingPkce = pkce(2);
    return { authUrl: centralUrl(pendingPkce, intent, returnTo), pendingPkce };
  })
) {
  return {
    resolve(urlString: string) {
      return resolveDesktopBrowserAuthRoute({
        state,
        urlString,
        appOrigin: APP_ORIGIN,
        authStartPath: '/auth/start',
        flowParam: 'desktop_flow',
        returnParam: 'desktop_return',
        parseUrl(value) {
          try {
            return new URL(value, APP_ORIGIN);
          } catch {
            return null;
          }
        },
        isDesktopAuthPath: pathname =>
          pathname === '/signin' || pathname === '/signup',
        sanitizeReturnRoute: value => (value?.startsWith('/') ? value : null),
        matchesPathPrefix: (pathname, prefix) =>
          pathname === prefix || pathname.startsWith(`${prefix}/`),
        createCentralRoute,
        now: NOW,
      });
    },
    createCentralRoute,
  };
}

describe('desktop browser auth route state', () => {
  test('reuses the exact live pending PKCE route without regeneration', () => {
    const pendingPkce = pkce(1);
    const state = rememberDesktopBrowserAuthRoutePkce(
      emptyDesktopBrowserAuthRouteState(),
      pendingPkce
    );
    const subject = resolver(state);

    const result = subject.resolve(centralUrl(pendingPkce));

    expect(result).toMatchObject({
      ok: true,
      authUrl: centralUrl(pendingPkce),
      created: false,
    });
    expect(subject.createCentralRoute).not.toHaveBeenCalled();
  });

  test('regenerates a mismatched route once and binds its cache to the new PKCE flow', () => {
    const staleRoute = centralUrl(pkce(1));
    const subject = resolver();
    const first = subject.resolve(staleRoute);
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const second = resolver(first.state, subject.createCentralRoute).resolve(
      staleRoute
    );

    expect(first.created).toBe(true);
    expect(second).toMatchObject({
      ok: true,
      authUrl: first.authUrl,
      created: false,
    });
    expect(first.state.cache).toMatchObject({
      authUrl: first.authUrl,
      flowNonce: pkce(2).flowNonce,
      codeChallenge: pkce(2).codeChallenge,
    });
    expect(subject.createCentralRoute).toHaveBeenCalledTimes(1);
  });

  test('rejects stale renderer actions while a fresh recovery route is loading', () => {
    const freshPkce = pkce(2);
    const recoveryState = setDesktopAuthRecoveryNavigationPending(
      rememberDesktopBrowserAuthRoutePkce(
        emptyDesktopBrowserAuthRouteState(),
        freshPkce
      ),
      true
    );
    const subject = resolver(recoveryState);

    expect(subject.resolve(centralUrl(pkce(1)))).toEqual({
      ok: false,
      reason: 'auth-recovery-pending',
      state: recoveryState,
      created: false,
    });
    expect(subject.createCentralRoute).not.toHaveBeenCalled();
  });

  test('regenerates after expiry or cancellation and then reuses one bound route', () => {
    const expiredPkce = { ...pkce(1), createdAt: NOW - 10 * 60 * 1000 - 1 };
    const expiredState = rememberDesktopBrowserAuthRoutePkce(
      emptyDesktopBrowserAuthRouteState(),
      expiredPkce
    );
    const createCentralRoute = vi.fn(
      (intent: DesktopAuthIntent, returnTo: string) => {
        const pendingPkce = pkce(createCentralRoute.mock.calls.length + 1);
        return {
          authUrl: centralUrl(pendingPkce, intent, returnTo),
          pendingPkce,
        };
      }
    );
    const staleRoute = centralUrl(expiredPkce);

    const afterExpiry = resolver(expiredState, createCentralRoute).resolve(
      staleRoute
    );
    expect(afterExpiry.ok).toBe(true);
    if (!afterExpiry.ok) return;
    const afterReuse = resolver(afterExpiry.state, createCentralRoute).resolve(
      staleRoute
    );
    expect(afterReuse.ok && afterReuse.authUrl).toBe(afterExpiry.authUrl);

    const afterCancel = resolver(
      clearDesktopBrowserAuthRouteState(),
      createCentralRoute
    ).resolve('/signin?desktop_return=%2Fapp');
    expect(afterCancel.ok).toBe(true);
    expect(createCentralRoute).toHaveBeenCalledTimes(2);
  });

  test('rejects untrusted routes without creating PKCE state', () => {
    const subject = resolver();

    expect(subject.resolve('https://example.com/signin')).toMatchObject({
      ok: false,
      reason: 'invalid-auth-url',
    });
    expect(subject.createCentralRoute).not.toHaveBeenCalled();
  });
});
