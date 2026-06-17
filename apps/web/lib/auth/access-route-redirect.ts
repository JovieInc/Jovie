import { APP_ROUTES } from '@/constants/routes';
import {
  CanonicalUserState,
  getRedirectForState,
} from './canonical-user-state';
import { sanitizeRedirectUrl } from './constants';

function isWaitlistInviteRedirect(redirectUrl: string | null): boolean {
  return (
    redirectUrl === '/waitlist/invite' ||
    redirectUrl?.startsWith('/waitlist/invite?') === true
  );
}

/**
 * Whether an authenticated user may enter the /app shell.
 * Onboarding-in-progress and fully active users both belong here.
 */
export function canAccessAppShell(state: CanonicalUserState): boolean {
  return (
    state === CanonicalUserState.ACTIVE ||
    state === CanonicalUserState.NEEDS_ONBOARDING
  );
}

/**
 * Redirect destination for an authenticated visitor to an auth entry route
 * (/signin, /signup). Mirrors proxy.ts auth-page handling so server routes and
 * middleware stay aligned.
 */
export function getAuthenticatedAuthRouteRedirect(
  state: CanonicalUserState,
  options?: { readonly redirectUrl?: string | null }
): string {
  const sanitizedRedirect = sanitizeRedirectUrl(options?.redirectUrl ?? null);

  if (sanitizedRedirect && isWaitlistInviteRedirect(sanitizedRedirect)) {
    return sanitizedRedirect;
  }

  const stateRedirect = getRedirectForState(state);
  if (stateRedirect) {
    return stateRedirect;
  }

  return sanitizedRedirect ?? APP_ROUTES.DASHBOARD;
}

/**
 * Redirect destination for /start based on canonical access state.
 * Anonymous visitors and onboarding-eligible users may remain on /start.
 */
export function getStartRouteRedirect(
  state: CanonicalUserState
): string | null {
  switch (state) {
    case CanonicalUserState.UNAUTHENTICATED:
    case CanonicalUserState.NEEDS_DB_USER:
    case CanonicalUserState.NEEDS_ONBOARDING:
      return null;
    case CanonicalUserState.ACTIVE:
      return APP_ROUTES.DASHBOARD;
    case CanonicalUserState.BANNED:
      return APP_ROUTES.UNAVAILABLE;
    case CanonicalUserState.USER_CREATION_FAILED:
      return '/error/user-creation-failed';
    case CanonicalUserState.NEEDS_WAITLIST_SUBMISSION:
    case CanonicalUserState.WAITLIST_PENDING:
      return APP_ROUTES.WAITLIST;
    default:
      return null;
  }
}
