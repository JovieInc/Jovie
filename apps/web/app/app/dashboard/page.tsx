import { redirect } from 'next/navigation';
import { DashboardOverview } from '@/components/dashboard/organisms/DashboardOverview';
import { getCachedAuth } from '@/lib/auth/cached';
import { convertDrizzleCreatorProfileToArtist } from '@/types/db';
import { getDashboardData } from './actions';

export default async function DashboardPage() {
  const { userId } = await getCachedAuth();

  if (!userId) {
    redirect('/signin?redirect_url=/app/dashboard');
  }

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
