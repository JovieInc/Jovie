import { redirect } from 'next/navigation';
import { TourDatesManager } from '@/components/dashboard/organisms/tour-dates';
import { getDashboardData } from '../actions';
import { checkBandsintownConnection, loadTourDates } from './actions';

export const metadata = {
  title: 'Tour Dates | Dashboard',
  description: 'Manage your tour dates and sync from Bandsintown',
};

export default async function TourDatesPage() {
  const dashboardData = await getDashboardData();

  // Handle unauthenticated users
  if (!dashboardData.user?.id) {
    redirect('/sign-in?redirect_url=/app/dashboard/tour-dates');
  }

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
