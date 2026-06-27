import { TEST_USER_ID_COOKIE } from '@/lib/auth/test-mode-constants';

const CLERK_ACTIVITY_COOKIE = '__client_uat';

export function hasActiveClerkSession(cookieValue: string): boolean {
  const cookies = cookieValue.split(';');
  const clientUat = cookies.find(cookie =>
    cookie.trim().startsWith(`${CLERK_ACTIVITY_COOKIE}=`)
  );

  if (!clientUat) {
    return false;
  }

  const value = clientUat.split('=')[1]?.trim();
  return Boolean(value && value !== '0');
}

export function hasTestAuthSession(cookieValue: string): boolean {
  const cookies = cookieValue.split(';');
  return cookies.some(cookie =>
    cookie.trim().startsWith(`${TEST_USER_ID_COOKIE}=`)
  );
}

/**
 * Best-effort client-side session probe used before Clerk hydrates.
 * Covers Clerk's activity cookie and the dev/E2E test-auth bypass cookie.
 */
export function hasClientAuthSession(cookieValue: string): boolean {
  return hasActiveClerkSession(cookieValue) || hasTestAuthSession(cookieValue);
}
