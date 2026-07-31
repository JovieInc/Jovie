import { APP_ROUTES } from '@/constants/routes';
import { captureError } from '@/lib/error-tracking';
import type { LibraryAssetShareViewModel } from '@/lib/library/asset-share';
import {
  getLibraryAssetShareMapForProfile,
  loadArtistHandleForProfile,
} from '@/lib/library/asset-share.server';
import type { LibraryProfileVisibility } from '@/lib/library/profile-visibility';
import { getLibraryProfileStateMapForProfile } from '@/lib/library/profile-visibility.server';
import { getLibraryMerchCardsForProfile } from '@/lib/merch/service';
import { queryKeys } from '@/lib/queries';
import { HydrateClient } from '@/lib/queries/HydrateClient';
import { getDehydratedState, getQueryClient } from '@/lib/queries/server';
import {
  loadArchivedReleaseMatrixForProfile,
  loadReleaseMatrixForProfile,
} from '@/lib/releases/release-matrix-loader';
import { loadAppShellRouteContext } from '../app-shell-route-context';
import { LibraryPageClient } from './LibraryPageClient';

export const runtime = 'nodejs';

export default async function LibraryPage() {
  const routeContext = await loadAppShellRouteContext({
    route: APP_ROUTES.LIBRARY,
    authFailure: 'notFound',
    dashboardErrorLogMessage: 'Dashboard data load failed on library page',
    dashboardErrorMessage:
      'Failed to load library data. Please refresh the page.',
  });
  if (!routeContext.ok) {
    return routeContext.error;
  }

  const selectedProfile = routeContext.dashboardData.selectedProfile;
  const profileId = selectedProfile?.id ?? null;
  let merchCards: Awaited<ReturnType<typeof getLibraryMerchCardsForProfile>> =
    [];
  let archivedMerchCards: Awaited<
    ReturnType<typeof getLibraryMerchCardsForProfile>
  > = [];
  let archivedReleases: Awaited<
    ReturnType<typeof loadArchivedReleaseMatrixForProfile>
  > = [];
  let approvalStatusByAssetId: Record<string, string> = {};
  let profileVisibilityByAssetId: Record<string, LibraryProfileVisibility> = {};
  let assetShareByAssetId: Record<string, LibraryAssetShareViewModel> = {};
  if (profileId && selectedProfile) {
    const queryClient = getQueryClient();
    try {
      const assetSharesPromise = loadArtistHandleForProfile(profileId).then(
        artistHandle =>
          artistHandle
            ? getLibraryAssetShareMapForProfile(profileId, artistHandle)
            : new Map()
      );
      const profileContext = {
        userId: routeContext.userId,
        profileId,
        profileHandle:
          selectedProfile.usernameNormalized ?? selectedProfile.username,
        spotifyId: selectedProfile.spotifyId ?? null,
        appleMusicId: selectedProfile.appleMusicId ?? null,
        settings: selectedProfile.settings ?? null,
      };
      const [
        _releases,
        archivedReleaseRows,
        merch,
        archivedMerch,
        profileStates,
        assetShares,
      ] = await Promise.all([
        queryClient.fetchQuery({
          queryKey: queryKeys.releases.matrix(profileId),
          queryFn: () => loadReleaseMatrixForProfile(profileContext),
        }),
        loadArchivedReleaseMatrixForProfile(profileContext),
        getLibraryMerchCardsForProfile(profileId),
        getLibraryMerchCardsForProfile(profileId, { lifecycle: 'archived' }),
        getLibraryProfileStateMapForProfile(profileId),
        assetSharesPromise,
      ]);
      merchCards = merch;
      archivedMerchCards = archivedMerch;
      archivedReleases = archivedReleaseRows;
      approvalStatusByAssetId = Object.fromEntries(
        [...profileStates].map(([assetId, state]) => [
          assetId,
          state.approvalStatus,
        ])
      );
      profileVisibilityByAssetId = Object.fromEntries(
        [...profileStates].map(([assetId, state]) => [
          assetId,
          state.profileVisibility,
        ])
      );
      assetShareByAssetId = Object.fromEntries(assetShares);
    } catch (error) {
      void captureError(
        'Release matrix prefetch failed on library page',
        error,
        {
          route: APP_ROUTES.LIBRARY,
        }
      );
    }
  }

  return (
    <HydrateClient state={getDehydratedState()}>
      <LibraryPageClient
        merchCards={merchCards}
        archivedMerchCards={archivedMerchCards}
        archivedReleases={archivedReleases}
        approvalStatusByAssetId={approvalStatusByAssetId}
        profileVisibilityByAssetId={profileVisibilityByAssetId}
        assetShareByAssetId={assetShareByAssetId}
      />
    </HydrateClient>
  );
}
