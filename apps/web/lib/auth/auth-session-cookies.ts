import { TEST_USER_ID_COOKIE } from '@/lib/auth/test-mode-constants';

const LEGACY_CLERK_ACTIVITY_COOKIE = '__client_uat';
const BETTER_AUTH_COOKIE_PREFIXES = [
  'better-auth.',
  '__Secure-better-auth.',
  '__Host-better-auth.',
] as const;

function cookieName(entry: string): string {
  return entry.trim().split('=')[0] ?? '';
}

function cookieValue(entry: string): string {
  const separator = entry.indexOf('=');
  return separator === -1 ? '' : entry.slice(separator + 1).trim();
}

/** Remove the leftover Clerk activity marker after Better Auth sign-out. */
export function clearLegacyClerkSessionMarker(): void {
  if (typeof document === 'undefined') return;

  document.cookie = `${LEGACY_CLERK_ACTIVITY_COOKIE}=; Max-Age=0; Path=/; SameSite=Lax`;
}

export function hasBetterAuthSessionCookie(cookieHeader: string): boolean {
  return cookieHeader.split(';').some(entry => {
    const name = cookieName(entry);
    const value = cookieValue(entry);
    return (
      Boolean(value) &&
      BETTER_AUTH_COOKIE_PREFIXES.some(prefix => name.startsWith(prefix))
    );
  });
}

export function hasLegacyClerkActivityCookie(cookieHeader: string): boolean {
  const clientUat = cookieHeader
    .split(';')
    .find(cookie =>
      cookie.trim().startsWith(`${LEGACY_CLERK_ACTIVITY_COOKIE}=`)
    );

  if (!clientUat) {
    return false;
  }

  const value = cookieValue(clientUat);
  return Boolean(value && value !== '0');
}

/** @deprecated Use `hasActiveAuthSession`. */
export function hasActiveClerkSession(cookieHeader: string): boolean {
  return hasActiveAuthSession(cookieHeader);
}

export function hasActiveAuthSession(cookieHeader: string): boolean {
  return (
    hasBetterAuthSessionCookie(cookieHeader) ||
    hasLegacyClerkActivityCookie(cookieHeader)
  );
}

export function hasTestAuthSession(cookieValue: string): boolean {
  const cookies = cookieValue.split(';');
  return cookies.some(cookie =>
    cookie.trim().startsWith(`${TEST_USER_ID_COOKIE}=`)
  );
}

/**
 * Best-effort client-side session probe.
 * Covers Better Auth session cookies, leftover Clerk activity cookies,
 * and the dev/E2E test-auth bypass cookie.
 */
export function hasClientAuthSession(cookieValue: string): boolean {
  return hasActiveAuthSession(cookieValue) || hasTestAuthSession(cookieValue);
}
