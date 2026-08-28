import { and, eq } from 'drizzle-orm';
import { APP_ROUTES } from '@/constants/routes';
import { listArtistRulesForProfile } from '@/lib/artist-rules/store';
import type { ArtistRuleView } from '@/lib/artist-rules/types';
import { CONNECTOR_PROVIDERS } from '@/lib/connectors/registry';
import { requireCreatorDocumentAccess } from '@/lib/creator-documents/access';
import type { CreatorDocumentListItem } from '@/lib/creator-documents/types';
import { db } from '@/lib/db';
import { listCreatorDocuments } from '@/lib/db/creator-documents/store';
import { connectorAccounts } from '@/lib/db/schema/connectors';
import { captureError } from '@/lib/error-tracking';
import type { LibraryAssetShareViewModel } from '@/lib/library/asset-share';
import {
  getLibraryAssetShareMapForProfile,
  loadArtistHandleForProfile,
} from '@/lib/library/asset-share.server';
import { listLibraryRelationshipsForProfile } from '@/lib/library/graph-store';
import type { LibraryRelationshipView } from '@/lib/library/graph-types';
import { listLibraryPostReleaseBundle } from '@/lib/library/post-release-store';
import type { LibraryPostReleaseBundle } from '@/lib/library/post-release-types';
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
import {
  listLibraryVideosForProfile,
  type PublicVideoListItem,
} from '@/lib/youtube-library/queries';
import { loadAppShellRouteContext } from '../app-shell-route-context';
import { LibraryPageClient } from './LibraryPageClient';

export const runtime = 'nodejs';

export default async function LibraryPage({
  searchParams: _searchParams,
}: {
  readonly searchParams: Promise<{
    readonly section?: string | string[] | undefined;
  }>;
}) {
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
  let libraryRelationships: LibraryRelationshipView[] = [];
  let postReleaseBundle: LibraryPostReleaseBundle = {
    downloads: [],
    findings: [],
    rightsholders: [],
  };
  if (profileId && selectedProfile) {
    const loadDocuments = async () => {
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
    };

    const loadAssets = async () => {
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
    };

    const loadYouTube = async () => {
      try {
        const [account, videos] = await Promise.all([
          db
            .select({ id: connectorAccounts.id })
            .from(connectorAccounts)
            .where(
              and(
                eq(connectorAccounts.userId, routeContext.userId),
                eq(connectorAccounts.creatorProfileId, profileId),
                eq(connectorAccounts.provider, CONNECTOR_PROVIDERS.youtube),
                eq(connectorAccounts.status, 'connected')
              )
            )
            .limit(1)
            .then(rows => rows[0] ?? null),
          listLibraryVideosForProfile({ creatorProfileId: profileId }),
        ]);
        youtubeConnected = Boolean(account);
        youtubeVideos = videos;
      } catch (error) {
        void captureError('YouTube Library projection failed', error, {
          route: APP_ROUTES.LIBRARY,
        });
      }
    };

    const loadControls = async () => {
      try {
        [artistRules, libraryRelationships, postReleaseBundle] =
          await Promise.all([
            listArtistRulesForProfile(profileId),
            listLibraryRelationshipsForProfile(profileId),
            listLibraryPostReleaseBundle(profileId),
          ]);
      } catch (error) {
        void captureError('Library controls projection failed', error, {
          route: APP_ROUTES.LIBRARY,
        });
      }
    };

    await Promise.all([
      loadDocuments(),
      loadAssets(),
      loadYouTube(),
      loadControls(),
    ]);
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
        youtubeVideos={youtubeVideos}
        youtubeConnected={youtubeConnected}
        artistRules={artistRules}
        libraryRelationships={libraryRelationships}
        postReleaseBundle={postReleaseBundle}
      />
    </HydrateClient>
  );
}
