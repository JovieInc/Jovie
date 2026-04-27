import type { Metadata } from 'next';
import { CalendarPageClient } from './CalendarPageClient';

export const metadata: Metadata = {
  title: 'Calendar | Jovie',
  description: 'Releases + release moments calendar',
};

/**
 * Calendar route — month-grid view of releases.
 *
 * Scaffold per the migration plan: ships the surface so the user can
 * iterate on the visual design via PR review comments. Pulls real
 * release data from `useRecentReleasesQuery`; wiring deeper data
 * (release moments, scheduled posts, tour dates) is a follow-up once
 * the visual baseline is approved.
 */
export default function CalendarPage() {
  return <CalendarPageClient />;
}
