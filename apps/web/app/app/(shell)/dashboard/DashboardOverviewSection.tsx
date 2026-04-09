import { redirect } from 'next/navigation';
import { DashboardOverview } from '@/features/dashboard/organisms/DashboardOverview';
import { getCachedAuth } from '@/lib/auth/cached';
import { convertDrizzleCreatorProfileToArtist } from '@/types/db';
import { getDashboardData } from './actions';
import { getLinkClicksByPlatform } from './actions/link-clicks';

export async function DashboardOverviewSection() {
  const [dashboardData, auth] = await Promise.all([
    getDashboardData(),
    getCachedAuth(),
  ]);

  if (dashboardData.needsOnboarding && !dashboardData.dashboardLoadError) {
    redirect('/onboarding');
  }

  const artist = dashboardData.selectedProfile
    ? convertDrizzleCreatorProfileToArtist(dashboardData.selectedProfile)
    : null;

  // Fetch link click stats (non-blocking, errors resolve to empty)
  let linkClickStats = {
    stats: [] as { platform: string; clicks: number }[],
    total: 0,
  };
  if (auth.userId) {
    try {
      linkClickStats = await getLinkClicksByPlatform(auth.userId);
    } catch {
      // Silent failure — card shows empty state
    }
  }

  return (
    <DashboardOverview
      artist={artist}
      bioLinkActivation={dashboardData.bioLinkActivation}
      hasSocialLinks={dashboardData.hasSocialLinks}
      hasMusicLinks={dashboardData.hasMusicLinks}
      linkClickStats={linkClickStats.stats}
      linkClickTotal={linkClickStats.total}
    />
  );
}
