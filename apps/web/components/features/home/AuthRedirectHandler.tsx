'use client';

// @coverage-via apps/web/tests/unit/home/AuthRedirectHandler.test.tsx
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { APP_ROUTES } from '@/constants/routes';
import { hasActiveAuthSession } from '@/lib/auth/auth-session-cookies';

/**
 * Non-blocking redirect handler for authenticated users on legacy launch
 * surfaces. The public homepage intentionally does not mount this handler:
 * `/` is an explicit destination after logout, from the logo, and from
 * browser history.
 *
 * Reads Better Auth session cookies (and leftover `__client_uat` during the
 * one-release cleanup). When a session cookie is present, redirect to the
 * dashboard.
 *
 * This runs in a useEffect after hydration so the static homepage renders
 * instantly for all visitors. Authenticated users see a subtle fade overlay
 * while the client-side redirect resolves — no spinner, no layout shift.
 */
export function AuthRedirectHandler() {
  const router = useRouter();
  const [isRedirecting, setIsRedirecting] = useState(
    () =>
      typeof document !== 'undefined' && hasActiveAuthSession(document.cookie)
  );

  useEffect(() => {
    const isAuthenticated = hasActiveAuthSession(document.cookie);

    if (!isAuthenticated) {
      setIsRedirecting(false);
      return;
    }

    setIsRedirecting(true);
    router.replace(APP_ROUTES.DASHBOARD);
  }, [router]);

  if (!isRedirecting) {
    return null;
  }

  // Subtle full-screen fade — no spinner, no logo, no layout shift.
  // The redirect resolves within milliseconds; this just prevents a flash
  // of marketing content for authenticated users.
  return (
    <div
      className='fixed inset-0 z-50 bg-base'
      aria-hidden='true'
      data-testid='auth-redirect-overlay'
    />
  );
}

export {
  hasActiveAuthSession,
  hasActiveClerkSession,
} from '@/lib/auth/auth-session-cookies';
