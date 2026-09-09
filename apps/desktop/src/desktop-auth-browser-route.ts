import {
  isPendingDesktopAuthPkceExpired,
  type PendingDesktopAuthPkce,
} from './desktop-auth-security';

export type DesktopAuthIntent = 'sign_in' | 'sign_up';

export interface DesktopBrowserAuthRouteCache {
  readonly routeKey: string;
  readonly authUrl: string;
  readonly flowNonce: string;
  readonly codeChallenge: string;
}

export interface DesktopBrowserAuthRouteState {
  readonly pendingPkce: PendingDesktopAuthPkce | null;
  readonly cache: DesktopBrowserAuthRouteCache | null;
  readonly recoveryNavigationPending: boolean;
}

interface CreatedDesktopAuthRoute {
  readonly authUrl: string;
  readonly pendingPkce: PendingDesktopAuthPkce;
}

interface ResolveDesktopBrowserAuthRouteInput {
  readonly state: DesktopBrowserAuthRouteState;
  readonly urlString: string;
  readonly appOrigin: string;
  readonly authStartPath: string;
  readonly flowParam: string;
  readonly returnParam: string;
  readonly parseUrl: (value: string) => URL | null;
  readonly isDesktopAuthPath: (pathname: string) => boolean;
  readonly sanitizeReturnRoute: (value: string | null) => string | null;
  readonly matchesPathPrefix: (pathname: string, prefix: string) => boolean;
  readonly createCentralRoute: (
    intent: DesktopAuthIntent,
    returnTo: string
  ) => CreatedDesktopAuthRoute;
  readonly now?: number;
}

export type DesktopBrowserAuthRouteResolution =
  | {
      readonly ok: true;
      readonly authUrl: string;
      readonly state: DesktopBrowserAuthRouteState;
      readonly created: boolean;
    }
  | {
      readonly ok: false;
      readonly reason: 'auth-recovery-pending' | 'invalid-auth-url';
      readonly state: DesktopBrowserAuthRouteState;
      readonly created: false;
    };

export function emptyDesktopBrowserAuthRouteState(): DesktopBrowserAuthRouteState {
  return {
    pendingPkce: null,
    cache: null,
    recoveryNavigationPending: false,
  };
}

export function rememberDesktopBrowserAuthRoutePkce(
  state: DesktopBrowserAuthRouteState,
  pendingPkce: PendingDesktopAuthPkce
): DesktopBrowserAuthRouteState {
  return { ...state, pendingPkce, cache: null };
}

export function clearDesktopBrowserAuthRouteState(): DesktopBrowserAuthRouteState {
  return emptyDesktopBrowserAuthRouteState();
}

export function setDesktopAuthRecoveryNavigationPending(
  state: DesktopBrowserAuthRouteState,
  recoveryNavigationPending: boolean
): DesktopBrowserAuthRouteState {
  return { ...state, recoveryNavigationPending };
}

function isLivePendingFlow(
  state: DesktopBrowserAuthRouteState,
  now: number
): state is DesktopBrowserAuthRouteState & {
  readonly pendingPkce: PendingDesktopAuthPkce;
} {
  return Boolean(
    state.pendingPkce &&
      !isPendingDesktopAuthPkceExpired(state.pendingPkce, now)
  );
}

function cacheMatchesPendingFlow(
  state: DesktopBrowserAuthRouteState,
  routeKey: string,
  now: number
): boolean {
  return Boolean(
    state.cache?.routeKey === routeKey &&
      isLivePendingFlow(state, now) &&
      state.cache.flowNonce === state.pendingPkce.flowNonce &&
      state.cache.codeChallenge === state.pendingPkce.codeChallenge
  );
}

function createResolution(
  state: DesktopBrowserAuthRouteState,
  routeKey: string,
  created: CreatedDesktopAuthRoute
): DesktopBrowserAuthRouteResolution {
  return {
    ok: true,
    authUrl: created.authUrl,
    created: true,
    state: {
      pendingPkce: created.pendingPkce,
      recoveryNavigationPending: state.recoveryNavigationPending,
      cache: {
        routeKey,
        authUrl: created.authUrl,
        flowNonce: created.pendingPkce.flowNonce,
        codeChallenge: created.pendingPkce.codeChallenge,
      },
    },
  };
}

export function resolveDesktopBrowserAuthRoute(
  input: ResolveDesktopBrowserAuthRouteInput
): DesktopBrowserAuthRouteResolution {
  const { state } = input;
  if (state.recoveryNavigationPending) {
    return {
      ok: false,
      reason: 'auth-recovery-pending',
      state,
      created: false,
    };
  }

  const now = input.now ?? Date.now();
  const parsed = input.parseUrl(input.urlString);
  if (
    parsed?.origin === input.appOrigin &&
    parsed.pathname === input.authStartPath &&
    parsed.searchParams.get('client') === 'electron' &&
    parsed.searchParams.get('code_challenge_method') === 'S256' &&
    Boolean(parsed.searchParams.get('code_challenge'))
  ) {
    const intent = parsed.searchParams.get('intent');
    const returnTo = input.sanitizeReturnRoute(
      parsed.searchParams.get('return_to')
    );
    if ((intent !== 'sign_in' && intent !== 'sign_up') || !returnTo) {
      return {
        ok: false,
        reason: 'invalid-auth-url',
        state,
        created: false,
      };
    }

    if (
      isLivePendingFlow(state, now) &&
      parsed.searchParams.get(input.flowParam) ===
        state.pendingPkce.flowNonce &&
      parsed.searchParams.get('code_challenge') ===
        state.pendingPkce.codeChallenge
    ) {
      return {
        ok: true,
        authUrl: `${parsed.pathname}${parsed.search}`,
        state,
        created: false,
      };
    }

    const routeKey = `central:${parsed.pathname}${parsed.search}`;
    if (cacheMatchesPendingFlow(state, routeKey, now) && state.cache) {
      return {
        ok: true,
        authUrl: state.cache.authUrl,
        state,
        created: false,
      };
    }

    return createResolution(
      state,
      routeKey,
      input.createCentralRoute(intent, returnTo)
    );
  }

  if (
    !parsed ||
    parsed.origin !== input.appOrigin ||
    !input.isDesktopAuthPath(parsed.pathname)
  ) {
    return {
      ok: false,
      reason: 'invalid-auth-url',
      state,
      created: false,
    };
  }

  const returnTo =
    input.sanitizeReturnRoute(parsed.searchParams.get(input.returnParam)) ??
    input.sanitizeReturnRoute(parsed.searchParams.get('redirect_url')) ??
    (input.matchesPathPrefix(parsed.pathname, '/signup') ||
    input.matchesPathPrefix(parsed.pathname, '/sign-up')
      ? '/start'
      : '/app');
  const intent: DesktopAuthIntent =
    input.matchesPathPrefix(parsed.pathname, '/signup') ||
    input.matchesPathPrefix(parsed.pathname, '/sign-up')
      ? 'sign_up'
      : 'sign_in';
  const routeKey = `${intent}:${returnTo}`;
  if (cacheMatchesPendingFlow(state, routeKey, now) && state.cache) {
    return {
      ok: true,
      authUrl: state.cache.authUrl,
      state,
      created: false,
    };
  }

  return createResolution(
    state,
    routeKey,
    input.createCentralRoute(intent, returnTo)
  );
}
