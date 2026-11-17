import type { DashboardData } from '@/app/app/(shell)/dashboard/actions/dashboard-data';

/**
 * Signed-in creator dashboard data for UnifiedSidebar library tests: one
 * complete-looking profile, no admin, empty tipping and completion state.
 */
export const dashboardData: DashboardData = {
  user: { id: 'user_123' },
  creatorProfiles: [
    {
      id: 'profile_123',
      avatarUrl: null,
      displayName: 'Tim White',
      username: 'timwhite',
      usernameNormalized: 'timwhite',
    } as DashboardData['creatorProfiles'][number],
  ],
  selectedProfile: {
    id: 'profile_123',
    avatarUrl: null,
    displayName: 'Tim White',
    username: 'timwhite',
    usernameNormalized: 'timwhite',
  } as DashboardData['selectedProfile'],
  needsOnboarding: false,
  sidebarCollapsed: false,
  hasSocialLinks: false,
  hasMusicLinks: false,
  isAdmin: false,
  tippingStats: {
    tipClicks: 0,
    qrTipClicks: 0,
    linkTipClicks: 0,
    tipsSubmitted: 0,
    totalReceivedCents: 0,
    monthReceivedCents: 0,
  },
  profileCompletion: {
    percentage: 0,
    completedCount: 0,
    totalCount: 6,
    steps: [],
    profileIsLive: false,
  },
};
