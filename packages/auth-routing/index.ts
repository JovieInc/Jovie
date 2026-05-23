export const AUTH_CLIENTS = ['web', 'ios', 'electron'] as const;
export type AuthClient = (typeof AUTH_CLIENTS)[number];

export const AUTH_INTENTS = [
  'sign_in',
  'sign_up',
  'session_recovery',
  'account_link',
] as const;
export type AuthIntent = (typeof AUTH_INTENTS)[number];

export const AUTH_ANALYTICS_EVENTS = [
  'auth_started',
  'auth_provider_opened',
  'auth_callback_received',
  'auth_exchange_succeeded',
  'auth_exchange_failed',
  'auth_returned_to_client',
  'auth_wrong_surface_prevented',
] as const;
export type AuthAnalyticsEventName = (typeof AUTH_ANALYTICS_EVENTS)[number];

export type NativeAuthClient = Exclude<AuthClient, 'web'>;
export type NavigationDisposition =
  | 'internal'
  | 'external'
  | 'auth'
  | 'blocked';

export const AUTH_STATE_PARAM = 'auth_state';
export const AUTH_CALLBACK_PATH = '/auth/callback';

export interface AuthStartUrlInput {
  readonly baseUrl: string;
  readonly client: AuthClient;
  readonly intent: AuthIntent;
  readonly returnTo: string;
  readonly codeChallenge?: string | null;
}

export interface AuthStateRecord {
  readonly client: AuthClient;
  readonly intent: AuthIntent;
  readonly returnTo: string;
  readonly state: string;
  readonly codeChallenge: string | null;
  readonly createdAt: number;
  readonly expiresAt: number;
  readonly consumedAt?: number | null;
}

export interface NativeExchangeCodeRecord {
  readonly code: string;
  readonly client: NativeAuthClient;
  readonly state: string;
  readonly userId: string;
  readonly returnTo: string;
  readonly codeChallenge: string | null;
  readonly createdAt: number;
  readonly expiresAt: number;
  readonly consumedAt?: number | null;
}

export interface NavigationOptions {
  readonly appUrl: string;
  readonly docsUrl?: string;
}

export interface AuthAnalyticsEventPayload {
  readonly client: AuthClient;
  readonly intent: AuthIntent;
  readonly result?: string;
  readonly reason?: string;
  readonly returnTo?: string | null;
  readonly state?: string | null;
}

const AUTH_STATE_TTL_MS = 10 * 60 * 1000;
const NATIVE_EXCHANGE_TTL_MS = 60 * 1000;
const IOS_AUTH_COMPLETE_URL = 'ie.jov.jovie://auth/complete';
const ELECTRON_AUTH_COMPLETE_URL = 'jovie://auth/complete';
const IOS_UNIVERSAL_AUTH_COMPLETE_PATH = '/auth/ios/complete';
const DEFAULT_DOCS_URL = 'https://docs.jov.ie';

const RETURN_BLOCKED_PREFIXES = [
  '/api',
  '/__clerk',
  '/clerk',
  '/signin',
  '/signup',
  '/sign-in',
  '/sign-up',
  '/sso-callback',
  '/auth',
  '/auth-return',
  '/mobile-auth-return',
  '/desktop-auth',
] as const;

const CLIENT_RETURN_PREFIXES = {
  web: ['/app', '/start', '/waitlist', '/onboarding', '/billing'],
  ios: ['/app'],
  electron: ['/app', '/start', '/onboarding', '/billing'],
} as const satisfies Record<AuthClient, readonly string[]>;

const NATIVE_EXTERNAL_PREFIXES = [
  '/about',
  '/ai',
  '/alternatives',
  '/artist-notifications',
  '/artist-profile',
  '/artist-profiles',
  '/blog',
  '/brand',
  '/changelog',
  '/compare',
  '/demo',
  '/demovideo',
  '/docs',
  '/download',
  '/investors',
  '/launch',
  '/legal',
  '/new',
  '/pay',
  '/pricing',
  '/renders',
  '/support',
] as const;

const PUBLIC_PROFILE_RESERVED_ROOT_SEGMENTS = new Set([
  '.well-known',
  '_next',
  'account',
  'actions',
  'admin',
  'api',
  'app',
  'artist-selection',
  'auth',
  'auth-return',
  'billing',
  'clerk',
  'desktop-auth',
  'favicon.ico',
  'go',
  'hud',
  'hud-tv',
  'investor-portal',
  'llms-full.txt',
  'llms.txt',
  'mobile-auth-return',
  'og',
  'onboarding',
  'out',
  'r',
  's',
  'share',
  'signin',
  'sign-in',
  'signup',
  'sign-up',
  'sso-callback',
  'unavailable',
  'waitlist',
  '__clerk',
  ...NATIVE_EXTERNAL_PREFIXES.map(prefix => prefix.slice(1)),
]);

const USERNAME_SEGMENT_PATTERN = /^[a-zA-Z][a-zA-Z0-9._-]{1,28}[a-zA-Z0-9]$/;
const PUBLIC_PATH_SEGMENT_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,62}$/;

export function isAuthClient(value: unknown): value is AuthClient {
  return (
    typeof value === 'string' && AUTH_CLIENTS.includes(value as AuthClient)
  );
}

export function isAuthIntent(value: unknown): value is AuthIntent {
  return (
    typeof value === 'string' && AUTH_INTENTS.includes(value as AuthIntent)
  );
}

function matchesPathPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

function parseUrl(urlString: string, baseUrl?: string): URL | null {
  if (urlString.startsWith('//')) return null;

  try {
    return baseUrl ? new URL(urlString, baseUrl) : new URL(urlString);
  } catch {
    return null;
  }
}

function hasSafePathname(pathname: string): boolean {
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return false;
  }

  return !decoded.includes('\\') && !decoded.startsWith('//');
}

function normalizeRelativePath(
  route: string | null | undefined
): string | null {
  if (!route) return null;
  if (!route.startsWith('/') || route.startsWith('//')) return null;

  let decoded: string;
  try {
    decoded = decodeURIComponent(route);
  } catch {
    return null;
  }

  if (decoded.includes('\\') || decoded.startsWith('//')) return null;

  const parsed = parseUrl(route, 'https://jov.ie');
  if (!parsed) return null;

  const normalized = `${parsed.pathname}${parsed.search}`;
  if (normalized === '/') return null;
  if (!hasSafePathname(parsed.pathname)) return null;

  if (
    RETURN_BLOCKED_PREFIXES.some(prefix =>
      matchesPathPrefix(parsed.pathname, prefix)
    )
  ) {
    return null;
  }

  return normalized;
}

export function sanitizeReturnTo(
  client: AuthClient,
  route: string | null | undefined
): string | null {
  const normalized = normalizeRelativePath(route);
  if (!normalized) return null;

  const parsed = parseUrl(normalized, 'https://jov.ie');
  if (!parsed) return null;

  const allowedPrefixes = CLIENT_RETURN_PREFIXES[client];
  if (
    !allowedPrefixes.some(prefix => matchesPathPrefix(parsed.pathname, prefix))
  ) {
    return null;
  }

  return normalized;
}

export function buildAuthStartUrl(input: AuthStartUrlInput): string {
  const sanitizedReturnTo = sanitizeReturnTo(input.client, input.returnTo);
  if (!sanitizedReturnTo) {
    throw new Error('Invalid return_to for auth start URL');
  }

  const url = new URL('/auth/start', input.baseUrl);
  url.searchParams.set('client', input.client);
  url.searchParams.set('intent', input.intent);
  url.searchParams.set('return_to', sanitizedReturnTo);

  if (input.codeChallenge) {
    url.searchParams.set('code_challenge', input.codeChallenge);
    url.searchParams.set('code_challenge_method', 'S256');
  }

  return url.toString();
}

export function buildAuthCallbackPath(state: string): string {
  const url = new URL(AUTH_CALLBACK_PATH, 'https://jov.ie');
  url.searchParams.set('state', state);
  return `${url.pathname}${url.search}`;
}

export function createAuthStateRecord(input: {
  readonly client: AuthClient;
  readonly intent: AuthIntent;
  readonly returnTo: string;
  readonly state: string;
  readonly codeChallenge?: string | null;
  readonly now: number;
}): AuthStateRecord {
  const returnTo = sanitizeReturnTo(input.client, input.returnTo);
  if (!returnTo) {
    throw new Error('Invalid return_to for auth state');
  }

  return {
    client: input.client,
    intent: input.intent,
    returnTo,
    state: input.state,
    codeChallenge: input.codeChallenge ?? null,
    createdAt: input.now,
    expiresAt: input.now + AUTH_STATE_TTL_MS,
    consumedAt: null,
  };
}

function buildUrlWithCodeAndState(
  baseUrl: string,
  input: {
    readonly code: string;
    readonly state: string;
  }
): string {
  const url = new URL(baseUrl);
  url.searchParams.set('code', input.code);
  url.searchParams.set('state', input.state);
  return url.toString();
}

export function buildIosAuthCompleteUrl(input: {
  readonly code: string;
  readonly state: string;
}): string {
  return buildUrlWithCodeAndState(IOS_AUTH_COMPLETE_URL, input);
}

export function buildIosUniversalAuthCompleteUrl(input: {
  readonly origin: string;
  readonly code: string;
  readonly state: string;
}): string {
  return buildUrlWithCodeAndState(
    new URL(IOS_UNIVERSAL_AUTH_COMPLETE_PATH, input.origin).toString(),
    input
  );
}

export function buildElectronAuthCompleteUrl(input: {
  readonly code: string;
  readonly state: string;
}): string {
  return buildUrlWithCodeAndState(ELECTRON_AUTH_COMPLETE_URL, input);
}

export function resolveAuthCallback(input: {
  readonly stateRecord: AuthStateRecord;
  readonly exchangeCode?: string;
  readonly requestedClient?: AuthClient | null;
}): {
  readonly client: AuthClient;
  readonly redirectUrl: string;
} {
  const { stateRecord } = input;

  if (input.requestedClient && input.requestedClient !== stateRecord.client) {
    throw new Error('Auth wrong surface prevented');
  }

  if (stateRecord.client === 'web') {
    return {
      client: 'web',
      redirectUrl: stateRecord.returnTo,
    };
  }

  if (!input.exchangeCode) {
    throw new Error('Native auth callback requires an exchange code');
  }

  if (stateRecord.client === 'ios') {
    return {
      client: 'ios',
      redirectUrl: buildIosAuthCompleteUrl({
        code: input.exchangeCode,
        state: stateRecord.state,
      }),
    };
  }

  return {
    client: 'electron',
    redirectUrl: buildElectronAuthCompleteUrl({
      code: input.exchangeCode,
      state: stateRecord.state,
    }),
  };
}

export function buildNativeExchangeCodeRecord(input: {
  readonly code: string;
  readonly client: NativeAuthClient;
  readonly state: string;
  readonly userId: string;
  readonly returnTo: string;
  readonly codeChallenge?: string | null;
  readonly now: number;
}): NativeExchangeCodeRecord {
  const returnTo = sanitizeReturnTo(input.client, input.returnTo);
  if (!returnTo) {
    throw new Error('Invalid return_to for native exchange code');
  }

  return {
    code: input.code,
    client: input.client,
    state: input.state,
    userId: input.userId,
    returnTo,
    codeChallenge: input.codeChallenge ?? null,
    createdAt: input.now,
    expiresAt: input.now + NATIVE_EXCHANGE_TTL_MS,
    consumedAt: null,
  };
}

export type NativeExchangeFailureReason =
  | 'missing'
  | 'wrong_code'
  | 'wrong_client'
  | 'wrong_state'
  | 'wrong_verifier'
  | 'expired'
  | 'replayed';

export type NativeExchangeValidationResult =
  | {
      readonly ok: true;
      readonly userId: string;
      readonly returnTo: string;
    }
  | {
      readonly ok: false;
      readonly reason: NativeExchangeFailureReason;
    };

export function validateNativeExchange(input: {
  readonly record: NativeExchangeCodeRecord | null | undefined;
  readonly client: NativeAuthClient;
  readonly code: string;
  readonly state: string;
  readonly codeVerifier?: string | null;
  readonly now: number;
  readonly createCodeChallenge: (verifier: string) => string;
}): NativeExchangeValidationResult {
  if (!input.record) return { ok: false, reason: 'missing' };
  if (input.record.code !== input.code)
    return { ok: false, reason: 'wrong_code' };
  if (input.record.client !== input.client) {
    return { ok: false, reason: 'wrong_client' };
  }
  if (input.record.state !== input.state) {
    return { ok: false, reason: 'wrong_state' };
  }
  if (input.record.consumedAt) return { ok: false, reason: 'replayed' };
  if (input.now > input.record.expiresAt)
    return { ok: false, reason: 'expired' };

  if (input.record.codeChallenge) {
    if (!input.codeVerifier) return { ok: false, reason: 'wrong_verifier' };
    const challenge = input.createCodeChallenge(input.codeVerifier);
    if (challenge !== input.record.codeChallenge) {
      return { ok: false, reason: 'wrong_verifier' };
    }
  }

  return {
    ok: true,
    userId: input.record.userId,
    returnTo: input.record.returnTo,
  };
}

function isAppOriginUrl(parsed: URL, options: NavigationOptions): boolean {
  const appOrigin = parseUrl(options.appUrl)?.origin;
  if (!appOrigin) return false;
  if (parsed.origin !== appOrigin) return false;

  return parsed.protocol === 'https:' || parsed.protocol === 'http:';
}

function isAllowedDocsUrl(parsed: URL, options: NavigationOptions): boolean {
  const docsOrigin = parseUrl(options.docsUrl ?? DEFAULT_DOCS_URL)?.origin;
  return parsed.protocol === 'https:' && parsed.origin === docsOrigin;
}

function isAllowedPublicProfilePath(pathname: string): boolean {
  const segments = pathname.split('/').filter(Boolean);
  if (segments.length === 0 || segments.length > 4) return false;

  const [username, ...childSegments] = segments;
  const normalizedUsername = username?.toLowerCase();
  if (
    !username ||
    !normalizedUsername ||
    PUBLIC_PROFILE_RESERVED_ROOT_SEGMENTS.has(normalizedUsername)
  ) {
    return false;
  }

  if (!USERNAME_SEGMENT_PATTERN.test(username)) return false;
  return childSegments.every(segment =>
    PUBLIC_PATH_SEGMENT_PATTERN.test(segment)
  );
}

function isNativeExternalPath(pathname: string): boolean {
  if (!hasSafePathname(pathname)) return false;
  if (pathname === '/') return true;

  if (
    NATIVE_EXTERNAL_PREFIXES.some(prefix => matchesPathPrefix(pathname, prefix))
  ) {
    return true;
  }

  return isAllowedPublicProfilePath(pathname);
}

export function classifyNavigation(
  client: AuthClient,
  urlString: string,
  options: NavigationOptions
): NavigationDisposition {
  const parsed = parseUrl(urlString, options.appUrl);
  if (!parsed) return 'blocked';

  if (parsed.protocol === 'mailto:') return 'external';
  if (isAllowedDocsUrl(parsed, options)) return 'external';
  if (!isAppOriginUrl(parsed, options)) return 'blocked';
  if (!hasSafePathname(parsed.pathname)) return 'blocked';

  if (matchesPathPrefix(parsed.pathname, '/auth')) return 'auth';

  if (
    CLIENT_RETURN_PREFIXES[client].some(prefix =>
      matchesPathPrefix(parsed.pathname, prefix)
    )
  ) {
    return 'internal';
  }

  if (client !== 'web' && isNativeExternalPath(parsed.pathname)) {
    return 'external';
  }

  return client === 'web' ? 'internal' : 'blocked';
}

function sanitizeAnalyticsReturnPath(
  route: string | null | undefined
): string | undefined {
  if (!route) return undefined;

  const parsed = parseUrl(route, 'https://jov.ie');
  if (!parsed || !hasSafePathname(parsed.pathname)) return undefined;

  return parsed.pathname;
}

export function createAuthAnalyticsEvent(
  event: AuthAnalyticsEventName,
  payload: AuthAnalyticsEventPayload
): {
  readonly event: AuthAnalyticsEventName;
  readonly client: AuthClient;
  readonly intent: AuthIntent;
  readonly result?: string;
  readonly reason?: string;
  readonly returnPath?: string;
} {
  return {
    event,
    client: payload.client,
    intent: payload.intent,
    result: payload.result,
    reason: payload.reason,
    returnPath: sanitizeAnalyticsReturnPath(payload.returnTo),
  };
}
