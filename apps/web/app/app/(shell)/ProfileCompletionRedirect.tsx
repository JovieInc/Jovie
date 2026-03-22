'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useDashboardData } from '@/app/app/(shell)/dashboard/DashboardDataContext';
import { isProfileComplete } from '@/lib/auth/profile-completeness';

/**
 * Client-side safety net for onboarding redirects.
 *
 * If server-side onboarding checks fail due to network/cache timing,
 * this guard ensures authenticated users without a usable profile
 * are sent to onboarding.
 *
 * Uses the canonical isProfileComplete() check, plus an additional
 * avatar check — avatar is enforced client-side only because it uploads
 * asynchronously during onboarding steps 1-2.
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

    // Canonical completeness check (username, displayName, isPublic, onboarding)
    // plus avatar which is only enforced client-side.
    if (
      !isProfileComplete(selectedProfile) ||
      !selectedProfile.avatarUrl?.trim()
    ) {
      router.replace('/onboarding');
    }
  }, [router, selectedProfile, dashboardLoadError]);

  return null;
}
