import { redirect } from 'next/navigation';
import { TourDatesManager } from '@/components/dashboard/organisms/tour-dates';
import { getCachedAuth } from '@/lib/auth/cached';
import { STATSIG_FLAGS } from '@/lib/flags';
import { checkGateForUser } from '@/lib/flags/server';
import { getDashboardData } from '../actions';
import { checkBandsintownConnection, loadTourDates } from './actions';

export const metadata = {
  title: 'Tour Dates | Dashboard',
  description: 'Manage your tour dates and sync from Bandsintown',
};

// Revalidate every 5 minutes for tour date data
export const revalidate = 300;

export default async function TourDatesPage() {
  const { userId } = await getCachedAuth();

  if (!userId) {
    redirect('/sign-in?redirect_url=/app/dashboard/tour-dates');
  }

  // Check feature gate - redirect if not enabled
  const isTourDatesEnabled = await checkGateForUser(STATSIG_FLAGS.TOUR_DATES, {
    userID: userId,
  });

  if (!isTourDatesEnabled) {
    redirect('/app/dashboard');
  }

  const dashboardData = await getDashboardData();

  if (dashboardData.needsOnboarding) {
    redirect('/onboarding');
  }

  if (!dashboardData.selectedProfile) {
    redirect('/onboarding');
  }

  const profileId = dashboardData.selectedProfile.id;

  const [tourDates, connectionStatus] = await Promise.all([
    loadTourDates(),
    checkBandsintownConnection(),
  ]);

  return (
    <TourDatesManager
      profileId={profileId}
      initialTourDates={tourDates}
      connectionStatus={connectionStatus}
    />
  );
}
