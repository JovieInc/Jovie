import { APP_ROUTES } from '@/constants/routes';
import { sanitizeRedirectUrl } from './constants';

function isAppShellPath(pathname: string): boolean {
  return pathname === APP_ROUTES.DASHBOARD || pathname.startsWith('/app/');
}

function resolveRequestedAppPath(nextUrlHeader: string | null): string | null {
  const directPath = sanitizeRedirectUrl(nextUrlHeader);

  if (directPath && isAppShellPath(new URL(directPath, 'https://n').pathname)) {
    return directPath;
  }

  if (!nextUrlHeader) {
    return null;
  }

  try {
    const parsedUrl = new URL(nextUrlHeader);
    if (!isAppShellPath(parsedUrl.pathname)) {
      return null;
    }

    return sanitizeRedirectUrl(parsedUrl.pathname + parsedUrl.search);
  } catch {
    return null;
  }
}

function isElectronAppShellRequest(nextUrlHeader: string | null): boolean {
  const requestedPath = resolveRequestedAppPath(nextUrlHeader);
  if (!requestedPath) return false;

  try {
    return (
      new URL(requestedPath, 'https://n').searchParams.get('runtime') ===
      'electron'
    );
  } catch {
    return false;
  }
}

export function buildAppShellSignInUrl(
  nextUrlHeader: string | null,
  options: { readonly origin?: string | null } = {}
): string {
  const redirectTarget =
    resolveRequestedAppPath(nextUrlHeader) ?? APP_ROUTES.DASHBOARD;

  const signInParams = new URLSearchParams({
    redirect_url: redirectTarget,
  });

  const signInPath = `${APP_ROUTES.SIGNIN}?${signInParams.toString()}`;
  if (!options.origin || !isElectronAppShellRequest(nextUrlHeader)) {
    return signInPath;
  }

  return new URL(signInPath, options.origin).toString();
}
