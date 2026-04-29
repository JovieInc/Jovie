'use client';

import dynamic from 'next/dynamic';
import { useDashboardData } from '@/app/app/(shell)/dashboard/DashboardDataContext';
import { PageErrorState } from '@/features/feedback/PageErrorState';
import { useAppFlag } from '@/lib/flags/client';
import { useReleasesQuery } from '@/lib/queries/useReleasesQuery';
import { primaryProviderKeys, providerConfig } from './config';
import { ReleaseTableSkeleton } from './loading';

export type ReleasesViewMode = 'designV1ShellReleases' | 'legacyProviderMatrix';

export interface ReleasesFlagState {
  readonly shellChatV1Enabled: boolean;
  readonly designV1ReleasesEnabled: boolean;
}

export function resolveReleasesViewMode({
  designV1ReleasesEnabled,
}: ReleasesFlagState): ReleasesViewMode {
  // SHELL_CHAT_V1 owns shell chrome; releases view selection belongs to DESIGN_V1_RELEASES.
  return designV1ReleasesEnabled
    ? 'designV1ShellReleases'
    : 'legacyProviderMatrix';
}

const ReleasesExperience = dynamic(
  () =>
    import('@/features/dashboard/organisms/release-provider-matrix').then(
      mod => mod.ReleasesExperience
    ),
  {
    loading: () => <ReleaseTableSkeleton showHeader={false} />,
  }
);

const ShellReleasesView = dynamic(
  () =>
    import(
      '@/features/dashboard/organisms/release-provider-matrix/shell-releases/ShellReleasesView'
    ).then(mod => mod.ShellReleasesView),
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
  const releasesViewMode = resolveReleasesViewMode({
    shellChatV1Enabled: useAppFlag('SHELL_CHAT_V1'),
    designV1ReleasesEnabled: useAppFlag('DESIGN_V1_RELEASES'),
  });

  const { data: releases, isLoading, isError } = useReleasesQuery(profileId);

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

  if (isError) {
    return (
      <PageErrorState message='Failed to load releases data. Please refresh the page.' />
    );
  }

  if (releasesViewMode === 'designV1ShellReleases') {
    return <ShellReleasesView releases={releases ?? []} />;
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
