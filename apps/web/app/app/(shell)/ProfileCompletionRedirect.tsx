'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useDashboardData } from '@/app/app/(shell)/dashboard/DashboardDataContext';

function isBlank(value: string | null | undefined): boolean {
  return !value?.trim();
}

/**
 * Client-side safety net for onboarding redirects.
 *
 * If server-side onboarding checks fail due to network/cache timing,
 * this guard ensures authenticated users without a usable profile
 * (missing handle or display name) are sent to onboarding.
 */
export function ProfileCompletionRedirect() {
  const { selectedProfile } = useDashboardData();
  const router = useRouter();

  useEffect(() => {
    if (!selectedProfile) {
      router.replace('/onboarding');
      return;
    }

    if (
      isBlank(selectedProfile.username) ||
      isBlank(selectedProfile.displayName)
    ) {
      router.replace('/onboarding');
    }
  }, [router, selectedProfile]);

  return null;
}
