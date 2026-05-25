'use client';

import dynamic from 'next/dynamic';
import { useDashboardData } from '@/app/app/(shell)/dashboard/DashboardDataContext';
import {
  LibraryLoadingState,
  LibrarySurface,
} from '@/app/app/(shell)/library/LibrarySurface';
import { buildLibraryReleaseAssets } from '@/app/app/(shell)/library/library-data';
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

export type ReleaseCatalogView = 'list' | 'assets';

interface ReleaseCatalogPageClientProps {
  readonly view: ReleaseCatalogView;
}

export function ReleaseCatalogPageClient({
  view,
}: ReleaseCatalogPageClientProps) {
  const { selectedProfile } = useDashboardData();
  const profileId = selectedProfile?.id ?? '';
  const designV1ReleasesEnabled = useAppFlag('DESIGN_V1');
  const hasProfile = Boolean(profileId);

  const {
    data: releases,
    isLoading,
    isError,
    refetch,
    error,
  } = useReleasesQuery(profileId, {
    enabled: hasProfile,
  });

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

  if (view === 'assets') {
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
          refetch();
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
