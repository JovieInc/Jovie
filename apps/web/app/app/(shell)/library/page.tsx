import { APP_ROUTES } from '@/constants/routes';
import { listArtistRulesForProfile } from '@/lib/artist-rules/store';
import type { ArtistRuleView } from '@/lib/artist-rules/types';
import { requireCreatorDocumentAccess } from '@/lib/creator-documents/access';
import type { CreatorDocumentListItem } from '@/lib/creator-documents/types';
import { listCreatorDocuments } from '@/lib/db/creator-documents/store';
import { captureError } from '@/lib/error-tracking';
import type { LibraryAssetShareViewModel } from '@/lib/library/asset-share';
import {
  getLibraryAssetShareMapForProfile,
  loadArtistHandleForProfile,
} from '@/lib/library/asset-share.server';
import { listLibraryRelationshipsForProfile } from '@/lib/library/graph-store';
import { listLibraryPostReleaseBundle } from '@/lib/library/post-release-store';
import {
  EMPTY_LIBRARY_POST_RELEASE_BUNDLE,
  type LibraryPostReleaseBundle,
} from '@/lib/library/post-release-types';
import type { LibraryProfileVisibility } from '@/lib/library/profile-visibility';
import { getLibraryProfileStateMapForProfile } from '@/lib/library/profile-visibility.server';
import type { LibraryRelationshipView } from '@/lib/library/track-drawer-types';
import { getLibraryMerchCardsForProfile } from '@/lib/merch/service';
import { queryKeys } from '@/lib/queries';
import { HydrateClient } from '@/lib/queries/HydrateClient';
import { getDehydratedState, getQueryClient } from '@/lib/queries/server';
import {
  loadArchivedReleaseMatrixForProfile,
  loadReleaseMatrixForProfile,
} from '@/lib/releases/release-matrix-loader';
import {
  hasConnectedYouTubeAccount,
  listVideosForLibraryProjection,
  type PublicVideoListItem,
} from '@/lib/youtube-library';
import { loadAppShellRouteContext } from '../app-shell-route-context';
import { LibraryPageClient } from './LibraryPageClient';

export const runtime = 'nodejs';

export default async function LibraryPage({
  searchParams,
}: {
  readonly searchParams: Promise<{
    readonly section?: string | string[] | undefined;
  }>;
}) {
  await searchParams;
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
  let creatorDocuments: CreatorDocumentListItem[] = [];
  let creatorDocumentsNextCursor: string | null = null;
  let creatorDocumentsLoadFailed = false;
  let youtubeVideos: PublicVideoListItem[] = [];
  let youtubeConnected = false;
  let artistRules: ArtistRuleView[] = [];
  let relationships: LibraryRelationshipView[] = [];
  let postReleaseBundle: LibraryPostReleaseBundle =
    EMPTY_LIBRARY_POST_RELEASE_BUNDLE;
  if (profileId && selectedProfile) {
    {
      try {
        await requireCreatorDocumentAccess({
          userId: routeContext.userId,
          profileId,
        });
        const privateDocuments = await listCreatorDocuments(profileId);
        creatorDocuments = [...privateDocuments.documents];
        creatorDocumentsNextCursor = privateDocuments.nextCursor;
      } catch (error) {
        void captureError(
          'Private creator documents load failed on library page',
          error,
          { route: APP_ROUTES.LIBRARY }
        );
        creatorDocumentsLoadFailed = true;
      }
    }
    {
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
          videos,
          postRelease,
          rules,
          relationshipRows,
          youtubeAccount,
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
          listVideosForLibraryProjection({ creatorProfileId: profileId }),
          listLibraryPostReleaseBundle(profileId).catch(error => {
            void captureError(
              'Post-release bundle load failed on library page',
              error,
              { route: APP_ROUTES.LIBRARY }
            );
            return EMPTY_LIBRARY_POST_RELEASE_BUNDLE;
          }),
          listArtistRulesForProfile(profileId).catch(error => {
            void captureError(
              'Artist rules load failed on library page',
              error,
              { route: APP_ROUTES.LIBRARY }
            );
            return [];
          }),
          listLibraryRelationshipsForProfile(profileId).catch(error => {
            void captureError('Library relationships load failed', error, {
              route: APP_ROUTES.LIBRARY,
            });
            return [];
          }),
          hasConnectedYouTubeAccount({
            userId: routeContext.userId,
            creatorProfileId: profileId,
            route: APP_ROUTES.LIBRARY,
          }).catch(error => {
            void captureError('YouTube connection lookup failed', error, {
              route: APP_ROUTES.LIBRARY,
            });
            return false;
          }),
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
        youtubeVideos = videos;
        postReleaseBundle = postRelease;
        artistRules = rules;
        relationships = relationshipRows;
        youtubeConnected = Boolean(youtubeAccount);
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
  }

  return (
    <HydrateClient state={getDehydratedState()}>
      <LibraryPageClient
        creatorProfileId={profileId ?? 'unavailable'}
        merchCards={merchCards}
        archivedMerchCards={archivedMerchCards}
        archivedReleases={archivedReleases}
        approvalStatusByAssetId={approvalStatusByAssetId}
        profileVisibilityByAssetId={profileVisibilityByAssetId}
        assetShareByAssetId={assetShareByAssetId}
        creatorDocuments={creatorDocuments}
        creatorDocumentsNextCursor={creatorDocumentsNextCursor}
        creatorDocumentsLoadFailed={creatorDocumentsLoadFailed}
        initialArtistRules={artistRules}
        youtubeVideos={youtubeVideos}
        youtubeConnected={youtubeConnected}
        relationships={relationships}
        postReleaseBundle={postReleaseBundle}
      />
    </HydrateClient>
  );
}
