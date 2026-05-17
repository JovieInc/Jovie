import { redirect } from 'next/navigation';
import { APP_ROUTES } from '@/constants/routes';
import { DashboardOverview } from '@/features/dashboard/organisms/DashboardOverview';
import { getCachedAuth } from '@/lib/auth/cached';
import { convertDrizzleCreatorProfileToArtist } from '@/types/db';
import {
  getDashboardDataEssential,
  getDashboardOverviewSupplement,
} from './actions';
import { getLinkClicksByPlatform } from './actions/link-clicks';

export async function DashboardOverviewSection() {
  const [dashboardData, auth] = await Promise.all([
    getDashboardDataEssential(),
    getCachedAuth(),
  ]);

  if (dashboardData.needsOnboarding && !dashboardData.dashboardLoadError) {
    redirect(APP_ROUTES.START);
  }

  const artist = dashboardData.selectedProfile
    ? convertDrizzleCreatorProfileToArtist(dashboardData.selectedProfile)
    : null;

  const [overviewSupplement, linkClickStats] = await Promise.all([
    dashboardData.selectedProfile && dashboardData.user?.id
      ? getDashboardOverviewSupplement({
          onboardingCompletedAt:
            dashboardData.selectedProfile.onboardingCompletedAt?.toISOString() ??
            null,
          profileId: dashboardData.selectedProfile.id,
          userId: dashboardData.user.id,
        })
      : Promise.resolve({
          hasSocialLinks: false,
          hasMusicLinks: false,
          bioLinkActivation: null,
        }),
    auth.userId
      ? getLinkClicksByPlatform(auth.userId).catch(() => ({
          stats: [] as { platform: string; clicks: number }[],
          total: 0,
        }))
      : Promise.resolve({
          stats: [] as { platform: string; clicks: number }[],
          total: 0,
        }),
  ]);

  return (
    <DashboardOverview
      artist={artist}
      bioLinkActivation={overviewSupplement.bioLinkActivation}
      hasSocialLinks={overviewSupplement.hasSocialLinks}
      hasMusicLinks={overviewSupplement.hasMusicLinks}
      linkClickStats={linkClickStats.stats}
      linkClickTotal={linkClickStats.total}
    />
  );
}
