'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useDashboardData } from '@/app/app/(shell)/dashboard/DashboardDataContext';
import { APP_ROUTES } from '@/constants/routes';

/**
 * Client-side safety net for onboarding redirects.
 *
 * If server-side onboarding checks fail due to network/cache timing,
 * this guard ensures authenticated users without a usable profile
 * are sent to onboarding.
 *
 * Uses the canonical isProfileComplete() check only. Avatar is NOT
 * checked here — it's a soft requirement handled by the onboarding
 * step-resume logic (resolveInitialStep). Adding avatar here causes
 * an infinite redirect loop: /app → /onboarding (ACTIVE guard) → /app.
 */
export function ProfileCompletionRedirect() {
  const { selectedProfile, dashboardLoadError, isAdmin, needsOnboarding } =
    useDashboardData();
  const router = useRouter();

  useEffect(() => {
    if (isAdmin) {
      return;
    }

    // Don't redirect when profile is null due to a data loading error —
    // the null selectedProfile reflects a transient failure, not a missing
    // profile. Redirecting here would loop: /app → /onboarding → /app.
    if (dashboardLoadError) {
      return;
    }

    if (!selectedProfile) {
      router.replace(APP_ROUTES.ONBOARDING);
      return;
    }

    if (needsOnboarding) {
      router.replace(APP_ROUTES.ONBOARDING);
    }
  }, [dashboardLoadError, isAdmin, needsOnboarding, router, selectedProfile]);

  return null;
}
