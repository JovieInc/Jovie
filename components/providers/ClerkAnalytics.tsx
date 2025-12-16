'use client';

import { useAuth, useUser } from '@clerk/nextjs';
import { useEffect } from 'react';
import { identify } from '@/lib/analytics';

/**
 * Stub component to support Clerk analytics in the client.
 * Extend this to integrate Clerk analytics events as needed.
 */
export function ClerkAnalytics() {
  const { isLoaded, isSignedIn, userId } = useAuth();
  const { user } = useUser();

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
