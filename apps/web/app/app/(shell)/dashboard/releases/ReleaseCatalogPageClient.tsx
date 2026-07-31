'use client';

import { useDashboardData } from '@/app/app/(shell)/dashboard/DashboardDataContext';
import {
  LibraryLoadingState,
  LibrarySurface,
} from '@/app/app/(shell)/library/LibrarySurface';
import {
  buildLibraryMerchAssets,
  buildLibraryReleaseAssets,
} from '@/app/app/(shell)/library/library-data';
import { ShellReleasesView } from '@/components/features/dashboard/organisms/release-provider-matrix/shell-releases/ShellReleasesView';
import { PageErrorState } from '@/features/feedback/PageErrorState';
import {
  isLibraryApprovalStatus,
  type LibraryApprovalStatus,
} from '@/lib/library/approval-status';
import type { LibraryAssetShareViewModel } from '@/lib/library/asset-share';
import {
  isLibraryProfileVisibility,
  type LibraryProfileVisibility,
} from '@/lib/library/profile-visibility';
import type { LibraryMerchCard } from '@/lib/merch/types';
import { useReleasesQuery } from '@/lib/queries/useReleasesQuery';
import { primaryProviderKeys, providerConfig } from './config';
import { ReleaseTableSkeleton } from './loading';

export type ReleaseCatalogView = 'list' | 'assets';

interface ReleaseCatalogPageClientProps {
  readonly view: ReleaseCatalogView;
  readonly merchCards?: readonly LibraryMerchCard[];
  readonly approvalStatusByAssetId?: Readonly<Record<string, string>>;
  readonly profileVisibilityByAssetId?: Readonly<Record<string, string>>;
  readonly assetShareByAssetId?: Readonly<
    Record<string, LibraryAssetShareViewModel>
  >;
}

function toApprovalStatusMap(
  approvalStatusByAssetId: Readonly<Record<string, string>>
): ReadonlyMap<string, LibraryApprovalStatus> {
  const entries = Object.entries(approvalStatusByAssetId).flatMap(
    ([assetId, status]) =>
      isLibraryApprovalStatus(status) ? [[assetId, status] as const] : []
  );
  return new Map(entries);
}

function toProfileVisibilityMap(
  profileVisibilityByAssetId: Readonly<Record<string, string>>
): ReadonlyMap<string, LibraryProfileVisibility> {
  const entries = Object.entries(profileVisibilityByAssetId).flatMap(
    ([assetId, visibility]) =>
      isLibraryProfileVisibility(visibility)
        ? [[assetId, visibility] as const]
        : []
  );
  return new Map(entries);
}

export function ReleaseCatalogPageClient({
  view,
  merchCards = [],
  approvalStatusByAssetId = {},
  profileVisibilityByAssetId = {},
  assetShareByAssetId = {},
}: ReleaseCatalogPageClientProps) {
  const { selectedProfile } = useDashboardData();
  const profileId = selectedProfile?.id ?? '';
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

    const artistName =
      spotifyArtistName ??
      appleMusicArtistName ??
      selectedProfile?.displayName?.trim() ??
      selectedProfile?.username ??
      'Artist';

    const approvalStatusMap = toApprovalStatusMap(approvalStatusByAssetId);
    const profileVisibilityMap = toProfileVisibilityMap(
      profileVisibilityByAssetId
    );
    const artistHandle =
      selectedProfile?.usernameNormalized?.trim() ||
      selectedProfile?.username?.trim() ||
      null;

    const withShare = (
      asset: ReturnType<typeof buildLibraryReleaseAssets>[number]
    ) => ({
      ...asset,
      share: assetShareByAssetId[asset.id] ?? null,
    });

    return (
      <LibrarySurface
        profileId={profileId}
        artistHandle={artistHandle}
        assets={[
          ...buildLibraryReleaseAssets(
            releases,
            approvalStatusMap,
            profileVisibilityMap
          ).map(withShare),
          ...buildLibraryMerchAssets(
            merchCards,
            artistName,
            approvalStatusMap,
            profileVisibilityMap
          ).map(withShare),
        ]}
      />
    );
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
        extraContext={{ Profile: profileId }}
      />
    );
  }

  if (releases === undefined) {
    return <ReleaseTableSkeleton showHeader={false} />;
  }

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
