'use client';

import dynamic from 'next/dynamic';
import { useDashboardData } from '@/app/app/(shell)/dashboard/DashboardDataContext';
import { ShellReleasesView } from '@/components/features/dashboard/organisms/release-provider-matrix/shell-releases/ShellReleasesView';
import { PageErrorState } from '@/features/feedback/PageErrorState';
import { useAppFlag } from '@/lib/flags/client';
import { useReleasesQuery } from '@/lib/queries/useReleasesQuery';
import { primaryProviderKeys, providerConfig } from './config';
import { ReleaseTableSkeleton } from './loading';

const ReleasesExperience = dynamic(
  () =>
    import('@/features/dashboard/organisms/release-provider-matrix').then(
      mod => mod.ReleasesExperience
    ),
  {
    loading: () => <ReleaseTableSkeleton showHeader={false} />,
  }
);

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
  const { data: releases, isError } = useReleasesQuery(profileId);
  const designV1ReleasesEnabled = useAppFlag('DESIGN_V1_RELEASES');

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

  // Cold-load skeleton only. TanStack's `isLoading` can spike on refetch
  // transitions before data is repopulated, which flashes the skeleton.
  // `data === undefined` is the only true no-cache signal here.
  if (isError) {
    return (
      <PageErrorState message='Failed to load releases data. Please refresh the page.' />
    );
  }

  if (releases === undefined) {
    return <ReleaseTableSkeleton showHeader={false} />;
  }

  if (designV1ReleasesEnabled) {
    return (
      <ShellReleasesView
        releases={releases ?? []}
        providerConfig={providerConfig}
        primaryProviders={primaryProviderKeys}
        artistName={spotifyArtistName ?? appleMusicArtistName ?? null}
        allowArtworkDownloads={allowArtworkDownloads}
        spotifyConnected={spotifyConnected}
        appleMusicConnected={appleMusicConnected}
        initialImporting={spotifyImportStatus === 'importing'}
        initialTotalCount={spotifyImportTotal}
      />
    );
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
