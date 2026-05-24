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
  const designV1ReleasesEnabled = useAppFlag('DESIGN_V1');

  const {
    data: releases,
    isLoading,
    isError,
    refetch,
    error,
  } = useReleasesQuery(profileId);

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

  // Only swap to skeleton on a true cold load. Once we have any data (even
  // from placeholderData), keep the tree mounted so background refetches
  // never tear down the drawer or remount the table.
  if (!releases && isLoading) {
    return <ReleaseTableSkeleton showHeader={false} />;
  }

  if (isError && !releases) {
    return (
      <PageErrorState
        title='Unable to load releases'
        message='We could not load your releases. Retry the request or refresh the page.'
        error={error instanceof Error ? error : undefined}
        actionLabel='Retry load'
        onRetry={() => {
          void refetch();
        }}
        secondaryAction={{
          label: 'Refresh page',
          onClick: () => globalThis.location.reload(),
        }}
        extraContext={{ Profile: profileId }}
      />
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
