'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { type ReactNode, useEffect } from 'react';
import { useAuthSafe } from '@/hooks/useClerkSafe';
import { getClientAuthenticatedAuthEntryRedirect } from '@/lib/auth/access-route-redirect';

interface AuthenticatedAuthEntryGuardProps {
  readonly children: ReactNode;
}

/**
 * Redirects confirmed signed-in visitors away from auth entry surfaces.
 *
 * The auth form stays mounted until navigation commits. Hiding children on a
 * leftover activity cookie or a pending session fetch is what produced the
 * blank black /signup page after client navigation (JOV-6450).
 */
export function AuthenticatedAuthEntryGuard({
  children,
}: AuthenticatedAuthEntryGuardProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isLoaded, isSignedIn } = useAuthSafe();

  useEffect(() => {
    if (!isLoaded || !isSignedIn) {
      return;
    }

    router.replace(getClientAuthenticatedAuthEntryRedirect(searchParams));
  }, [isLoaded, isSignedIn, router, searchParams]);

  return children;
}
