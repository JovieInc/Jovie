'use client';

import { useDashboardData } from '@/app/app/(shell)/dashboard/DashboardDataContext';
import { DspPresenceView } from '@/features/dashboard/organisms/dsp-presence/DspPresenceView';
import { PageErrorState } from '@/features/feedback/PageErrorState';
import { useDspPresenceQuery } from '@/lib/queries/useDspPresenceQuery';
import PresenceLoading from './loading';

/**
 * Client-first presence page.
 *
 * Reads DSP presence data from TanStack Query cache (seeded by server prefetch
 * on first visit, warmed by nav-hover prefetch on subsequent visits).
 * Skeleton only shows on a true cold load with no cached data.
 *
 * Note: hasUnresolvedMismatches is initially false and the CatalogHealthSection
 * lazily loads its own data when expanded. This avoids the extra server query
 * on every navigation.
 */
export function PresencePageClient() {
  const { selectedProfile } = useDashboardData();
  const profileId = selectedProfile?.id ?? '';

  const { data: presenceData, isError } = useDspPresenceQuery(profileId);

  // Cold-load skeleton only. Keep the mounted view stable across background
  // refetches where data stays defined.
  if (presenceData === undefined) {
    return <PresenceLoading />;
  }

  if (isError) {
    return (
      <PageErrorState message='Failed to load presence data. Please refresh the page.' />
    );
  }

  if (!presenceData) return null;

  return <DspPresenceView data={presenceData} />;
}
