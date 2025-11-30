import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { DashboardOverview } from '@/components/dashboard/organisms/DashboardOverview';
import { convertDrizzleCreatorProfileToArtist } from '@/types/db';
import { getDashboardData } from '../actions';

export default async function OverviewPage() {
  const { userId } = await auth();

  if (!userId) {
    redirect('/sign-in?redirect_url=/dashboard/overview');
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
    />
  );
}
