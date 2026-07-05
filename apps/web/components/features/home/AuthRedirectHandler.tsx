'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { APP_ROUTES } from '@/constants/routes';
import { hasActiveClerkSession } from '@/lib/auth/auth-session-cookies';

/**
 * Non-blocking redirect handler for authenticated users on the homepage.
 *
 * Reads Clerk's `__client_uat` cookie (a non-httpOnly cookie set by Clerk JS
 * containing a Unix timestamp of last user activity). When the value is > 0,
 * the user has an active session and we redirect to the dashboard.
 *
 * This runs in a useEffect after hydration so the static homepage renders
 * instantly for all visitors. Authenticated users see a subtle fade overlay
 * while the client-side redirect resolves — no spinner, no layout shift.
 */
export function AuthRedirectHandler() {
  const router = useRouter();
  const [isRedirecting, setIsRedirecting] = useState(
    () =>
      typeof document !== 'undefined' && hasActiveClerkSession(document.cookie)
  );

  useEffect(() => {
    const isAuthenticated = hasActiveClerkSession(document.cookie);

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

export { hasActiveClerkSession } from '@/lib/auth/auth-session-cookies';
