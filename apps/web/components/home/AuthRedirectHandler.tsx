'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { APP_ROUTES } from '@/constants/routes';

/**
 * Non-blocking redirect handler for authenticated users on the homepage.
 *
 * Reads Clerk's `__client_uat` cookie (a non-httpOnly cookie set by Clerk JS
 * containing a Unix timestamp of last user activity). When the value is > 0,
 * the user has an active session and we redirect to the dashboard.
 *
 * This runs in a useEffect after hydration so the static homepage renders
 * instantly for all visitors. Authenticated users then get a client-side
 * redirect — "slow redirect, fast homepage" by design.
 */
export function AuthRedirectHandler() {
  const router = useRouter();

  useEffect(() => {
    const cookies = document.cookie.split(';');
    const clientUat = cookies.find(c => c.trim().startsWith('__client_uat='));

    if (clientUat) {
      const value = clientUat.split('=')[1]?.trim();
      if (value && value !== '0') {
        router.replace(APP_ROUTES.DASHBOARD);
      }
    }
  }, [router]);

  return null;
}
