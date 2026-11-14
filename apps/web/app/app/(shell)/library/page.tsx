import type { Metadata } from 'next';
import { APP_ROUTES } from '@/constants/routes';
import { requireCreatorDocumentAccess } from '@/lib/creator-documents/access';
import type { CreatorDocumentListItem } from '@/lib/creator-documents/types';
import { listCreatorDocuments } from '@/lib/db/creator-documents/store';
import { getDspMatchesForProfile } from '@/lib/dsp-enrichment/queries.server';
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
import { type DspMatch, queryKeys } from '@/lib/queries';
import { HydrateClient } from '@/lib/queries/HydrateClient';
import { getDehydratedState, getQueryClient } from '@/lib/queries/server';
import {
  loadArchivedReleaseMatrixForProfile,
  loadReleaseMatrixForProfile,
} from '@/lib/releases/release-matrix-loader';
import {
  type TeleprompterTakeSummary,
  toTeleprompterTakeSummary,
} from '@/lib/teleprompter/takes/contract';
import { listTeleprompterTakes } from '@/lib/teleprompter/takes/server';
import {
  hasConnectedYouTubeAccount,
  listVideosForLibraryProjection,
  type PublicVideoListItem,
} from '@/lib/youtube-library';
import { loadAppShellRouteContext } from '../app-shell-route-context';
import { LibraryPageClient } from './LibraryPageClient';

export const runtime = 'nodejs';

export const metadata: Metadata = {
  title: 'Work',
  description: 'Manage what you make and put into the world',
};

// Same rows GET /api/dsp/matches sends, which the client reads into this
// key; the client types that JSON as DspMatch the same way.
async function loadDspMatches(
  profileId: string,
  userId: string
): Promise<DspMatch[]> {
  const matches = await getDspMatchesForProfile(profileId, userId);
  return matches.map(match => ({
    ...match,
    createdAt: match.createdAt.toISOString(),
    updatedAt: match.updatedAt.toISOString(),
  })) as DspMatch[];
}

export default async function LibraryPage({
  searchParams,
}: {
  readonly searchParams: Promise<{
    readonly section?: string | string[] | undefined;
    readonly view?: string | string[] | undefined;
  }>;
}) {
  const { view } = await searchParams;
  const isReleasesView = view === 'releases';
  const routeContext = await loadAppShellRouteContext({
    route: APP_ROUTES.LIBRARY,
    authFailure: 'notFound',
    dashboardErrorLogMessage: 'Dashboard data load failed on library page',
    dashboardErrorMessage: 'Failed to load Work. Please refresh the page.',
  });
  if (!routeContext.ok) {
    return routeContext.error;
  }

  const selectedProfile = routeContext.dashboardData.selectedProfile;
  // Studio takes are private to the signed-in creator, not the profile.
  const takesPromise = listTeleprompterTakes(routeContext.userId)
    .then(records => records.map(toTeleprompterTakeSummary))
    .catch((error): TeleprompterTakeSummary[] => {
      void captureError('Studio takes load failed on library page', error, {
        route: APP_ROUTES.LIBRARY,
      });
      return [];
    });
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
  let relationships: LibraryRelationshipView[] = [];
  let postReleaseBundle: LibraryPostReleaseBundle =
    EMPTY_LIBRARY_POST_RELEASE_BUNDLE;
  if (profileId && selectedProfile) {
    // Private-document access + listing are independent of the release/asset
    // loaders, so they run concurrently instead of serializing ahead of them.
    const creatorDocumentsPromise = (async () => {
      try {
        await requireCreatorDocumentAccess({
          userId: routeContext.userId,
          profileId,
        });
        const privateDocuments = await listCreatorDocuments(profileId);
        return {
          documents: [...privateDocuments.documents],
          nextCursor: privateDocuments.nextCursor,
          loadFailed: false,
        };
      } catch (error) {
        void captureError(
          'Private creator documents load failed on library page',
          error,
          { route: APP_ROUTES.LIBRARY }
        );
        return {
          documents: [] as CreatorDocumentListItem[],
          nextCursor: null,
          loadFailed: true,
        };
      }
    })();
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
          }),
          // The releases view shows an Apple Music banner above its list.
          // Read its matches here so the banner is in the first paint;
          // fetched on the client, the banner landed after the list and
          // pushed it down (layout shift 0.075 against the 0.06 budget).
          isReleasesView
            ? queryClient
                .fetchQuery({
                  queryKey: queryKeys.dspEnrichment.matches(profileId),
                  queryFn: () => loadDspMatches(profileId, routeContext.userId),
                })
                .catch(error => {
                  void captureError(
                    'DSP matches prefetch failed on library page',
                    error,
                    { route: APP_ROUTES.LIBRARY }
                  );
                })
            : undefined,
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
    // Apply the document result even when the release/asset batch failed so a
    // degraded page still shows successfully loaded private documents.
    const creatorDocumentsResult = await creatorDocumentsPromise;
    creatorDocuments = creatorDocumentsResult.documents;
    creatorDocumentsNextCursor = creatorDocumentsResult.nextCursor;
    creatorDocumentsLoadFailed = creatorDocumentsResult.loadFailed;
  }

  const teleprompterTakes = await takesPromise;

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
        youtubeVideos={youtubeVideos}
        youtubeConnected={youtubeConnected}
        teleprompterTakes={teleprompterTakes}
        relationships={relationships}
        postReleaseBundle={postReleaseBundle}
      />
    </HydrateClient>
  );
}
