export type AppEnvironment = 'production' | 'staging' | 'local';

export type UrlDisposition = 'in-app' | 'external' | 'blocked';

export interface UrlDispositionOptions {
  readonly appUrl: string;
  readonly appEnv: AppEnvironment;
  readonly docsUrl?: string;
}

const DEFAULT_DOCS_URL = 'https://docs.jov.ie';

/** External auth provider origins that may be opened in the system browser. */
const AUTH_PROVIDER_ORIGINS = [
  'https://accounts.jov.ie',
  'https://*.clerk.accounts.dev',
] as const;

const IN_APP_ROUTE_PREFIXES = [
  '/account',
  '/app',
  '/artist-selection',
  '/billing',
  '/desktop-auth',
  '/onboarding',
  '/start',
] as const;

const AUTH_CALLBACK_ROUTE_PREFIXES = [
  '/auth/callback',
  '/auth/native-complete',
  '/app/auth/callback',
  '/signin/sso-callback',
  '/signup/sso-callback',
  '/sign-in/sso-callback',
  '/sign-up/sso-callback',
  '/sso-callback',
] as const;

const SAME_ORIGIN_EXTERNAL_ROUTE_PREFIXES = [
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
  ...SAME_ORIGIN_EXTERNAL_ROUTE_PREFIXES.map(prefix => prefix.slice(1)),
]);

const USERNAME_SEGMENT_PATTERN = /^[a-zA-Z][a-zA-Z0-9._-]{1,28}[a-zA-Z0-9]$/;
const PUBLIC_PATH_SEGMENT_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,62}$/;

export function parseUrl(urlString: string): URL | null {
  if (urlString.startsWith('//')) return null;

  try {
    return new URL(urlString);
  } catch {
    return null;
  }
}

export function matchesPathPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

function getOrigin(urlString: string): string | null {
  return parseUrl(urlString)?.origin ?? null;
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

function isAppOriginUrl(parsed: URL, options: UrlDispositionOptions): boolean {
  const appOrigin = getOrigin(options.appUrl);
  if (!appOrigin || parsed.origin !== appOrigin) return false;

  return (
    parsed.protocol === 'https:' ||
    (options.appEnv === 'local' && parsed.protocol === 'http:')
  );
}

function isAllowedDocsUrl(
  parsed: URL,
  options: UrlDispositionOptions
): boolean {
  const docsOrigin = getOrigin(options.docsUrl ?? DEFAULT_DOCS_URL);
  return (
    parsed.protocol === 'https:' &&
    parsed.origin === docsOrigin &&
    hasSafePathname(parsed.pathname)
  );
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

function isAllowedSameOriginExternalPath(pathname: string): boolean {
  if (!hasSafePathname(pathname)) return false;
  if (pathname === '/') return true;

  if (
    SAME_ORIGIN_EXTERNAL_ROUTE_PREFIXES.some(prefix =>
      matchesPathPrefix(pathname, prefix)
    )
  ) {
    return true;
  }

  return isAllowedPublicProfilePath(pathname);
}

export function isAllowedInAppUrl(
  parsed: URL,
  options: UrlDispositionOptions
): boolean {
  if (!isAppOriginUrl(parsed, options)) return false;
  if (!hasSafePathname(parsed.pathname)) return false;

  return (
    IN_APP_ROUTE_PREFIXES.some(prefix =>
      matchesPathPrefix(parsed.pathname, prefix)
    ) ||
    AUTH_CALLBACK_ROUTE_PREFIXES.some(prefix =>
      matchesPathPrefix(parsed.pathname, prefix)
    )
  );
}

export function isAllowedExternalUrl(
  parsed: URL,
  options: UrlDispositionOptions
): boolean {
  if (parsed.protocol === 'mailto:') return true;
  if (isAllowedDocsUrl(parsed, options)) return true;
  if (isAllowedAuthProviderUrl(parsed)) return true;

  return (
    isAppOriginUrl(parsed, options) &&
    isAllowedSameOriginExternalPath(parsed.pathname)
  );
}

function isAllowedAuthProviderUrl(parsed: URL): boolean {
  return AUTH_PROVIDER_ORIGINS.some(origin => {
    if (!origin.includes('*')) return parsed.origin === origin;
    // Wildcard matching: https://*.clerk.accounts.dev
    const base = origin.replace('*.', '.');
    return parsed.origin.endsWith(base) && parsed.protocol === 'https:';
  });
}

export function getUrlDisposition(
  urlString: string,
  options: UrlDispositionOptions
): UrlDisposition {
  const parsed = parseUrl(urlString);
  if (!parsed) return 'blocked';
  if (isAllowedInAppUrl(parsed, options)) return 'in-app';
  if (isAllowedExternalUrl(parsed, options)) return 'external';
  return 'blocked';
}
