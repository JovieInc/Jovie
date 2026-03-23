interface ClerkBypassPathInfo {
  isAuthCallbackPath: boolean;
  isAuthPath: boolean;
  isProtectedPath: boolean;
}

interface ClerkCookieLike {
  name: string;
  value: string;
}

function isClerkRequiredPath(
  pathname: string,
  pathInfo: ClerkBypassPathInfo
) {
  if (pathInfo.isProtectedPath || pathInfo.isAuthPath || pathInfo.isAuthCallbackPath) {
    return true;
  }

  return (
    pathname === '/app' ||
    pathname.startsWith('/app/') ||
    pathname.startsWith('/api/') ||
    pathname.startsWith('/trpc') ||
    pathname === '/clerk' ||
    pathname.startsWith('/clerk/') ||
    pathname === '/monitoring' ||
    pathname.startsWith('/monitoring/')
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
