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
  // The initial render must be identical on the server and client. Reading
  // `document.cookie` from a lazy initializer made an existing session render
  // `null` during browser hydration while the server had rendered the auth
  // form, which triggers React hydration error #418 on `/signin`.
  //
  // Cookie-based fast redirect remains useful, but it belongs in the effect
  // after hydration. The server-side auth route already handles the normal
  // authenticated request path before this client guard mounts.
  const [isRedirecting, setIsRedirecting] = useState(false);

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
