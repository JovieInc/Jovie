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
 * Redirects signed-in visitors away from auth entry surfaces before sign-in
 * or sign-up flows can mount and fail with duplicate error banners.
 *
 * Uses the session-activity cookie for an immediate post-hydration redirect,
 * then confirms with `useAuthSafe()` once the Better Auth session loads.
 * BFCache restores re-run the same decision so a session that appears after
 * browsing or back-forward restore cannot leave a blank auth card.
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
    const redirectSignedInVisitor = () => {
      const cookieSignedIn =
        typeof document !== 'undefined' &&
        hasClientAuthSession(document.cookie);
      const sessionSignedIn = isLoaded && isSignedIn;

      if (!cookieSignedIn && !sessionSignedIn) {
        setIsRedirecting(false);
        return;
      }

      // A leftover Clerk/Better Auth cookie is not proof of a session.
      // Hiding the form here left signed-out /signup blank-black after
      // browsing (cookie present, useSession still pending) with no
      // navigation (JOV-6450). Keep the auth UI until the session confirms.
      if (cookieSignedIn && !isLoaded) {
        setIsRedirecting(false);
        return;
      }

      if (sessionSignedIn) {
        setIsRedirecting(true);
        router.replace(getClientAuthenticatedAuthEntryRedirect(searchParams));
        return;
      }

      setIsRedirecting(false);
    };

    redirectSignedInVisitor();

    const restoreAfterBfCache = (event: PageTransitionEvent) => {
      if (event.persisted) {
        redirectSignedInVisitor();
      }
    };

    globalThis.addEventListener('pageshow', restoreAfterBfCache);
    return () => {
      globalThis.removeEventListener('pageshow', restoreAfterBfCache);
    };
  }, [isLoaded, isSignedIn, router, searchParams]);

  if (isRedirecting) {
    return null;
  }

  return children;
}
