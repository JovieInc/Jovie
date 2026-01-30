import { redirect } from 'next/navigation';
import { DashboardOverview } from '@/components/dashboard/organisms/DashboardOverview';
import { convertDrizzleCreatorProfileToArtist } from '@/types/db';
import { getDashboardData } from './actions';

export async function DashboardOverviewSection() {
  const dashboardData = await getDashboardData();

  if (dashboardData.needsOnboarding) {
    redirect('/onboarding');
  }

  const artist = dashboardData.selectedProfile
    ? convertDrizzleCreatorProfileToArtist(dashboardData.selectedProfile)
    : null;

  return (
    <DashboardOverview
      artist={artist}
      hasSocialLinks={dashboardData.hasSocialLinks}
      hasMusicLinks={dashboardData.hasMusicLinks}
    />
  );
}
