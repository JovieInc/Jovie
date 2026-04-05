'use client';

import { useDashboardData } from '@/app/app/(shell)/dashboard/DashboardDataContext';
import { ReleasesExperience } from '@/features/dashboard/organisms/release-provider-matrix';
import { useReleasesQuery } from '@/lib/queries/useReleasesQuery';
import { primaryProviderKeys, providerConfig } from './config';
import { ReleaseTableSkeleton } from './loading';

/**
 * Client-first releases page.
 *
 * Reads release data from TanStack Query cache (seeded by server prefetch
 * on first visit, warmed by nav-hover prefetch on subsequent visits).
 * Connection status and settings are derived from dashboard context.
 *
 * Skeleton only shows on a true cold load with no cached data.
 */
export function ReleasesPageClient() {
  const { selectedProfile } = useDashboardData();
  const profileId = selectedProfile?.id ?? '';

  const { data: releases, isLoading } = useReleasesQuery(profileId);

  const settings =
    (selectedProfile?.settings as Record<string, unknown> | null) ?? {};

  const spotifyConnected = Boolean(selectedProfile?.spotifyId);
  const spotifyArtistName =
    (settings.spotifyArtistName as string | null) ?? null;
  const appleMusicConnected = Boolean(selectedProfile?.appleMusicId);
  const appleMusicArtistName =
    (settings.appleMusicArtistName as string | null) ?? null;
  const allowArtworkDownloads =
    (settings.allowArtworkDownloads as boolean) ?? false;
  const spotifyImportStatus =
    (settings.spotifyImportStatus as string) ?? 'idle';
  const spotifyImportTotal =
    typeof settings.spotifyImportTotal === 'number'
      ? settings.spotifyImportTotal
      : 0;

  // Only show skeleton on cold load (no cached data at all)
  if (isLoading && !releases) {
    return <ReleaseTableSkeleton showHeader={false} />;
  }

  return (
    <ReleasesExperience
      releases={releases ?? []}
      providerConfig={providerConfig}
      primaryProviders={primaryProviderKeys}
      spotifyConnected={spotifyConnected}
      spotifyArtistName={spotifyArtistName}
      appleMusicConnected={appleMusicConnected}
      appleMusicArtistName={appleMusicArtistName}
      allowArtworkDownloads={allowArtworkDownloads}
      initialImporting={spotifyImportStatus === 'importing'}
      initialTotalCount={spotifyImportTotal}
    />
  );
}
