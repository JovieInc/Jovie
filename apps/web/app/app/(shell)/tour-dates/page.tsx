import type { Metadata } from 'next';
import { APP_ROUTES } from '@/constants/routes';
import { PageErrorState } from '@/features/feedback/PageErrorState';
import { captureError } from '@/lib/error-tracking';
import { queryKeys } from '@/lib/queries';
import { HydrateClient } from '@/lib/queries/HydrateClient';
import { getDehydratedState, getQueryClient } from '@/lib/queries/server';
import { tourDateToEventRecord } from '@/lib/queries/useEventsQuery';
import { loadAppShellRouteContext } from '../app-shell-route-context';
import {
  checkBandsintownConnection,
  loadTourDates,
} from '../dashboard/tour-dates/actions';
import { TourDatesPageClient } from './TourDatesPageClient';

export const runtime = 'nodejs';

export const metadata: Metadata = {
  title: 'Tour Dates | Jovie',
  description: 'Manage tour dates and events',
};

export default async function TourDatesPage() {
  const routeContext = await loadAppShellRouteContext({
    route: APP_ROUTES.TOUR_DATES,
    dashboardErrorLogMessage: 'Dashboard data load failed on tour dates page',
    dashboardErrorMessage:
      'Failed to load tour dates. Please refresh the page.',
  });
  if (!routeContext.ok) {
    return routeContext.error;
  }

  const profileId = routeContext.profileId;
  if (!profileId) {
    return <PageErrorState message='Select a profile to manage tour dates.' />;
  }

  const queryClient = getQueryClient();
  let initialTourDates: Awaited<ReturnType<typeof loadTourDates>> = [];
  let connectionStatus: Awaited<ReturnType<typeof checkBandsintownConnection>> =
    {
      connected: false,
      hasApiKey: false,
      artistName: null,
      lastSyncedAt: null,
    };

  try {
    [initialTourDates, connectionStatus] = await Promise.all([
      loadTourDates(profileId),
      checkBandsintownConnection(),
    ]);
    queryClient.setQueryData(
      queryKeys.tourDates.connection(profileId),
      connectionStatus
    );
    queryClient.setQueryData(
      queryKeys.tourDates.list(profileId),
      initialTourDates
    );
    queryClient.setQueryData(
      queryKeys.events.list(profileId),
      initialTourDates.map(tourDateToEventRecord)
    );
  } catch (error) {
    void captureError('Tour dates page load failed', error, {
      route: APP_ROUTES.TOUR_DATES,
      profileId,
    });
    return (
      <PageErrorState message='Failed to load tour dates. Please refresh the page.' />
    );
  }

  return (
    <HydrateClient state={getDehydratedState()}>
      <TourDatesPageClient
        profileId={profileId}
        initialTourDates={initialTourDates}
        connectionStatus={connectionStatus}
      />
    </HydrateClient>
  );
}
