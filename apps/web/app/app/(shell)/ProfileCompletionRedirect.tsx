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
  const { selectedProfile, dashboardLoadError } = useDashboardData();
  const router = useRouter();

  useEffect(() => {
    // Don't redirect when profile is null due to a data loading error —
    // the null selectedProfile reflects a transient failure, not a missing
    // profile. Redirecting here would loop: /app → /onboarding → /app.
    if (dashboardLoadError) {
      return;
    }

    if (!selectedProfile) {
      router.replace('/onboarding');
      return;
    }

    if (
      isBlank(selectedProfile.username) ||
      isBlank(selectedProfile.displayName) ||
      isBlank(selectedProfile.avatarUrl)
    ) {
      router.replace('/onboarding');
    }
  }, [router, selectedProfile, dashboardLoadError]);

  return null;
}
