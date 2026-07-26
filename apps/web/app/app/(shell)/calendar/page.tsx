import type { Metadata } from 'next';
import { APP_ROUTES } from '@/constants/routes';
import { loadAppShellRouteContext } from '../app-shell-route-context';
import { LazyCalendarPageClient } from './LazyCalendarPageClient';

export const runtime = 'nodejs';

export const metadata: Metadata = {
  title: 'Calendar | Jovie',
  description: 'Releases and events at a glance',
};

const CALENDAR_ROUTE = APP_ROUTES.CALENDAR;

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
  const routeContext = await loadAppShellRouteContext({
    route: CALENDAR_ROUTE,
    dashboardErrorLogMessage: 'Dashboard data load failed on calendar page',
    dashboardErrorMessage:
      'Failed to load calendar data. Please refresh the page.',
  });
  if (!routeContext.ok) {
    return routeContext.error;
  }

  return <LazyCalendarPageClient />;
}
