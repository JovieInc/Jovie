'use client';

import { useDashboardData } from '@/app/app/(shell)/dashboard/DashboardDataContext';
import { PageErrorState } from '@/features/feedback/PageErrorState';
import { useReleasesQuery } from '@/lib/queries/useReleasesQuery';
import { LibraryLoadingState, LibrarySurface } from './LibrarySurface';
import { buildLibraryReleaseAssets } from './library-data';

export function LibraryPageClient() {
  const { selectedProfile } = useDashboardData();
  const profileId = selectedProfile?.id ?? '';
  const hasProfile = Boolean(profileId);
  const { data: releases, isError } = useReleasesQuery(profileId, {
    enabled: hasProfile,
  });

  if (!hasProfile) {
    return <LibrarySurface assets={[]} />;
  }

  if (isError) {
    return (
      <PageErrorState message='Failed to load library data. Please refresh the page.' />
    );
  }

  if (releases === undefined) {
    return <LibraryLoadingState />;
  }

  return <LibrarySurface assets={buildLibraryReleaseAssets(releases)} />;
}
