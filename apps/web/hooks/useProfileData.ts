'use client';

import { useDashboardDataOptional } from '@/app/app/(shell)/dashboard/DashboardDataContext';

export interface ProfileData {
  /** Normalized or raw username */
  username: string | undefined;
  /** Profile URL path (e.g., "/username") */
  profileHref: string | undefined;
  /** Display name with fallbacks */
  displayName: string;
  /** Avatar URL if available */
  avatarUrl: string | null | undefined;
}

/**
 * Shared hook to extract profile data from dashboard context.
 *
 * Centralizes username normalization logic (usernameNormalized ?? username)
 * so both UnifiedSidebar and AuthShell use a single source of truth.
 *
 * Uses the optional context hook so it won't throw if rendered outside
 * a DashboardDataProvider (e.g., in settings pages).
 *
 * @param isDashboardOrAdmin - Whether the current section needs profile data
 * @returns Profile data including username, profileHref, displayName, and avatarUrl
 */
export function useProfileData(isDashboardOrAdmin: boolean): ProfileData {
  const dashboardDataRaw = useDashboardDataOptional();
  const dashboardData = isDashboardOrAdmin ? dashboardDataRaw : null;

  const username = dashboardData
    ? (dashboardData.selectedProfile?.usernameNormalized ??
      dashboardData.selectedProfile?.username)
    : undefined;

  return {
    username,
    profileHref: username ? `/${username}` : undefined,
    displayName: dashboardData
      ? dashboardData.selectedProfile?.displayName?.trim() ||
        dashboardData.selectedProfile?.username ||
        'Your profile'
      : 'Your profile',
    avatarUrl: dashboardData?.selectedProfile?.avatarUrl,
  };
}
