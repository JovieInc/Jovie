'use client';

import { useEffect } from 'react';
import { useAuthSafe, useUserSafe } from '@/hooks/useClerkSafe';
import { identify } from '@/lib/analytics';

/**
 * Stub component to support Clerk analytics in the client.
 * Extend this to integrate Clerk analytics events as needed.
 */
export function ClerkAnalytics() {
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
