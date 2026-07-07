'use client';

import { useEffect } from 'react';
import { useAuthSafe, useUserSafe } from '@/hooks/useJovieAuth';
import { identify } from '@/lib/analytics';

/**
 * Identifies the signed-in user to the analytics layer (Clerk → Better Auth
 * migration, client-flip commit ⑦). Replaces the Clerk-era `ClerkAnalytics`
 * stub; the contract is identical — subscribe to the auth session and call
 * `identify()` with the user's stable id + traits.
 */
export function JovieAnalytics() {
  const { isLoaded, isSignedIn, userId } = useAuthSafe();
  const { user } = useUserSafe();

  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn) return;
    if (!userId) return;

    const email = user?.primaryEmailAddress?.emailAddress;
    const username = user?.username;
    const fullName = user?.fullName;

    identify(userId, {
      email: email ?? undefined,
      username: username ?? undefined,
      full_name: fullName ?? undefined,
    });
  }, [isLoaded, isSignedIn, userId, user]);

  return null;
}
