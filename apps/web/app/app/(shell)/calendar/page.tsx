import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { APP_ROUTES } from '@/constants/routes';
import { PageErrorState } from '@/features/feedback/PageErrorState';
import { getCachedAuth } from '@/lib/auth/cached';
import { captureError } from '@/lib/error-tracking';
import { queryKeys } from '@/lib/queries';
import { HydrateClient } from '@/lib/queries/HydrateClient';
import { getDehydratedState, getQueryClient } from '@/lib/queries/server';
import type { EventRecord } from '@/lib/queries/useEventsQuery';
import type {
  TicketStatus,
  TourDateProviderValue,
  TourDateViewModel,
} from '@/lib/tour-dates/types';
import { getDashboardShellData } from '../dashboard/actions';
import { loadReleaseMatrix } from '../dashboard/releases/actions';
import { loadTourDates } from '../dashboard/tour-dates/actions';
import { CalendarPageClient } from './CalendarPageClient';

export const runtime = 'nodejs';

export const metadata: Metadata = {
  title: 'Calendar | Jovie',
  description: 'Releases and events at a glance',
};

const CALENDAR_ROUTE = APP_ROUTES.CALENDAR;

function formatProvider(provider: TourDateProviderValue): string {
  if (provider === 'bandsintown') return 'Bandsintown';
  if (provider === 'songkick') return 'Songkick';
  if (provider === 'admin_import') return 'Admin Import';
  return 'Manual';
}

function formatStatus(status: TicketStatus): string | undefined {
  if (status === 'sold_out') return 'Sold out';
  if (status === 'cancelled') return 'Cancelled';
  return undefined;
}

function formatLocation(
  city: string,
  region: string | null,
  country: string | null
): string {
  if (region) return `${city}, ${region}`;
  if (country) return `${city}, ${country}`;
  return city;
}

function tourDateToCalendarEvent(td: TourDateViewModel): EventRecord {
  const location = formatLocation(td.city, td.region, td.country);
  const providerLabel = formatProvider(td.provider);
  return {
    id: td.id,
    title: td.title || td.venueName || td.city,
    subtitle: `${location} · ${providerLabel}`,
    eventDate: td.startDate,
    timezone: td.timezone,
    eventType: td.eventType,
    confirmationStatus: td.confirmationStatus,
    providerKey: td.provider,
    reviewedAt: td.reviewedAt,
    lastSyncedAt: td.lastSyncedAt,
    venue: td.venueName,
    city: location,
    provider: providerLabel,
    status: formatStatus(td.ticketStatus),
    ticketUrl: td.ticketUrl ?? undefined,
  };
}

async function prefetchCalendarQueries(profileId: string) {
  const queryClient = getQueryClient();

  await Promise.all([
    queryClient.fetchQuery({
      queryKey: queryKeys.releases.matrix(profileId),
      queryFn: () => loadReleaseMatrix(profileId),
    }),
    queryClient.fetchQuery({
      queryKey: queryKeys.events.list(profileId),
      queryFn: async () => {
        const dates = await loadTourDates(profileId);
        return dates.map(tourDateToCalendarEvent);
      },
    }),
  ]);
}

/**
 * Calendar route — unified month-grid view of releases + events.
 *
 * Releases come from the shared release matrix query. Events (tour, livestream,
 * listening party, AMA, signing) come from `useEventsQuery`. Synced
 * provider events land as `pending` and surface in the day-detail
 * sidebar with inline confirm/reject — they do not bleed to fans or
 * notifications until the creator confirms.
 */
export default async function CalendarPage() {
  const { userId } = await getCachedAuth();
  if (!userId) {
    redirect(`${APP_ROUTES.SIGNIN}?redirect_url=${CALENDAR_ROUTE}`);
  }

  const dashboardData = await getDashboardShellData(userId);
  if (dashboardData.dashboardLoadError) {
    void captureError(
      'Dashboard data load failed on calendar page',
      dashboardData.dashboardLoadError,
      { route: CALENDAR_ROUTE }
    );
    return (
      <PageErrorState message='Failed to load calendar data. Please refresh the page.' />
    );
  }

  if (dashboardData.needsOnboarding) {
    redirect(APP_ROUTES.START);
  }

  const profileId = dashboardData.selectedProfile?.id;
  if (profileId) {
    try {
      await prefetchCalendarQueries(profileId);
    } catch (error) {
      void captureError('Calendar prefetch failed on calendar page', error, {
        route: CALENDAR_ROUTE,
      });
    }
  }

  return (
    <HydrateClient state={getDehydratedState()}>
      <CalendarPageClient />
    </HydrateClient>
  );
}
