import type { Metadata } from 'next';
import { CalendarPageClient } from './CalendarPageClient';

export const metadata: Metadata = {
  title: 'Calendar | Jovie',
  description: 'Releases and events at a glance',
};

/**
 * Calendar route — unified month-grid view of releases + events.
 *
 * Releases come from `useRecentReleasesQuery`. Events (tour, livestream,
 * listening party, AMA, signing) come from `useEventsQuery`. Synced
 * provider events land as `pending` and surface in the day-detail
 * sidebar with inline confirm/reject — they do not bleed to fans or
 * notifications until the creator confirms.
 */
export default function CalendarPage() {
  return <CalendarPageClient />;
}
