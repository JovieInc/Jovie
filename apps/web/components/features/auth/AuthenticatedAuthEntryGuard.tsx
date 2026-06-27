'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { type ReactNode, useEffect, useState } from 'react';
import { useAuthSafe } from '@/hooks/useClerkSafe';
import { getClientAuthenticatedAuthEntryRedirect } from '@/lib/auth/access-route-redirect';
import { hasClientAuthSession } from '@/lib/auth/auth-session-cookies';

interface AuthenticatedAuthEntryGuardProps {
  readonly children: ReactNode;
}

/**
 * Redirects signed-in visitors away from auth entry surfaces before Clerk
 * sign-in/sign-up flows can mount and fail with duplicate error banners.
 *
 * Uses the Clerk activity cookie for an immediate pre-hydration redirect, then
 * confirms with `useAuthSafe()` once Clerk loads.
 */
export function AuthenticatedAuthEntryGuard({
  children,
}: AuthenticatedAuthEntryGuardProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isLoaded, isSignedIn } = useAuthSafe();
  const [isRedirecting, setIsRedirecting] = useState(
    () =>
      typeof document !== 'undefined' && hasClientAuthSession(document.cookie)
  );

  useEffect(() => {
    const cookieSignedIn =
      typeof document !== 'undefined' && hasClientAuthSession(document.cookie);
    const clerkSignedIn = isLoaded && isSignedIn;

    if (!cookieSignedIn && !clerkSignedIn) {
      setIsRedirecting(false);
      return;
    }

    if (cookieSignedIn && !isLoaded) {
      setIsRedirecting(true);
      return;
    }

    if (clerkSignedIn) {
      setIsRedirecting(true);
      router.replace(getClientAuthenticatedAuthEntryRedirect(searchParams));
      return;
    }

    setIsRedirecting(false);
  }, [isLoaded, isSignedIn, router, searchParams]);

  if (isRedirecting) {
    return null;
  }

  return children;
}
