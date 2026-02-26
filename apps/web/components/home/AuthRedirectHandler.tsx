'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { LogoLoader } from '@/components/atoms/LogoLoader';
import { APP_ROUTES } from '@/constants/routes';

const CLERK_ACTIVITY_COOKIE = '__client_uat';

const hasActiveClerkSession = (cookieValue: string) => {
  const cookies = cookieValue.split(';');
  const clientUat = cookies.find(cookie =>
    cookie.trim().startsWith(`${CLERK_ACTIVITY_COOKIE}=`)
  );

  if (!clientUat) {
    return false;
  }

  const value = clientUat.split('=')[1]?.trim();
  return Boolean(value && value !== '0');
};

/**
 * Non-blocking redirect handler for authenticated users on the homepage.
 *
 * Reads Clerk's `__client_uat` cookie (a non-httpOnly cookie set by Clerk JS
 * containing a Unix timestamp of last user activity). When the value is > 0,
 * the user has an active session and we redirect to the dashboard.
 *
 * This runs in a useEffect after hydration so the static homepage renders
 * instantly for all visitors. Authenticated users get an immediate in-place
 * loading shell while the client-side redirect resolves.
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

  return (
    <div className='fixed inset-0 z-50 flex items-center justify-center bg-background/95 backdrop-blur-sm'>
      <LogoLoader aria-label='Redirecting to your dashboard' variant='mono' />
      <span className='sr-only'>Redirecting to your dashboard</span>
    </div>
  );
}

export { hasActiveClerkSession };
