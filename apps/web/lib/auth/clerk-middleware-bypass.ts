import { APP_ROUTES } from '@/constants/routes';

export interface ClerkBypassPathInfo {
  isAuthCallbackPath: boolean;
  isAuthPath: boolean;
  isProtectedPath: boolean;
}

interface ClerkCookieLike {
  name: string;
  value: string;
}

const CLERK_REQUIRED_EXACT_PATHS = [
  APP_ROUTES.DASHBOARD,
  '/monitoring',
] as const;

const CLERK_REQUIRED_PREFIXES = [
  `${APP_ROUTES.DASHBOARD}/`,
  '/api/',
  '/trpc',
  '/monitoring/',
] as const;

function isClerkRequiredPath(pathname: string, pathInfo: ClerkBypassPathInfo) {
  if (
    pathInfo.isProtectedPath ||
    pathInfo.isAuthPath ||
    pathInfo.isAuthCallbackPath
  ) {
    return true;
  }

  // Keep this Clerk-specific subset aligned with categorizePath() in proxy.ts.
  // Duplicating the minimal matcher here avoids coupling this utility to proxy.
  return (
    CLERK_REQUIRED_EXACT_PATHS.includes(
      pathname as (typeof CLERK_REQUIRED_EXACT_PATHS)[number]
    ) || CLERK_REQUIRED_PREFIXES.some(prefix => pathname.startsWith(prefix))
  );
}

function hasActiveClerkCookie(cookie: ClerkCookieLike) {
  if (cookie.name === '__session') {
    return cookie.value.trim().length > 0;
  }

  if (cookie.name === '__client_uat') {
    const value = cookie.value.trim();
    return value.length > 0 && value !== '0';
  }

  return false;
}

export function shouldBypassClerkForRequest(options: {
  cookies: Iterable<ClerkCookieLike>;
  pathInfo: ClerkBypassPathInfo;
  pathname: string;
}) {
  if (isClerkRequiredPath(options.pathname, options.pathInfo)) {
    return false;
  }

  for (const cookie of options.cookies) {
    if (hasActiveClerkCookie(cookie)) {
      return false;
    }
  }

  return true;
}
