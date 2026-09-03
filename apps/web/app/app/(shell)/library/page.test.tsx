import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  captureError: vi.fn(),
  fetchQuery: vi.fn(),
  getLibraryAssetShareMapForProfile: vi.fn(),
  getLibraryMerchCardsForProfile: vi.fn(),
  getLibraryProfileStateMapForProfile: vi.fn(),
  listArtistRulesForProfile: vi.fn(),
  listCreatorDocuments: vi.fn(),
  listLibraryPostReleaseBundle: vi.fn(),
  listLibraryRelationshipsForProfile: vi.fn(),
  listVideosForLibraryProjection: vi.fn(),
  hasConnectedYouTubeAccount: vi.fn(),
  loadAppShellRouteContext: vi.fn(),
  loadArchivedReleaseMatrixForProfile: vi.fn(),
  loadArtistHandleForProfile: vi.fn(),
  requireCreatorDocumentAccess: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({ limit: vi.fn(() => Promise.resolve([])) })),
      })),
    })),
  },
}));

vi.mock('@/lib/creator-documents/access', () => ({
  requireCreatorDocumentAccess: mocks.requireCreatorDocumentAccess,
}));
vi.mock('@/lib/artist-rules/store', () => ({
  listArtistRulesForProfile: mocks.listArtistRulesForProfile,
}));
vi.mock('@/lib/db/creator-documents/store', () => ({
  listCreatorDocuments: mocks.listCreatorDocuments,
}));
vi.mock('@/lib/error-tracking', () => ({
  captureError: mocks.captureError,
}));
vi.mock('@/lib/library/asset-share.server', () => ({
  getLibraryAssetShareMapForProfile: mocks.getLibraryAssetShareMapForProfile,
  loadArtistHandleForProfile: mocks.loadArtistHandleForProfile,
}));
vi.mock('@/lib/library/graph-store', () => ({
  listLibraryRelationshipsForProfile: mocks.listLibraryRelationshipsForProfile,
}));
vi.mock('@/lib/library/post-release-store', () => ({
  listLibraryPostReleaseBundle: mocks.listLibraryPostReleaseBundle,
}));
vi.mock('@/lib/artist-rules/store', () => ({
  listArtistRulesForProfile: mocks.listArtistRulesForProfile,
}));
vi.mock('@/lib/library/profile-visibility.server', () => ({
  getLibraryProfileStateMapForProfile:
    mocks.getLibraryProfileStateMapForProfile,
}));
vi.mock('@/lib/merch/service', () => ({
  getLibraryMerchCardsForProfile: mocks.getLibraryMerchCardsForProfile,
}));
vi.mock('@/lib/queries/server', () => ({
  getDehydratedState: vi.fn(() => ({})),
  getQueryClient: vi.fn(() => ({ fetchQuery: mocks.fetchQuery })),
}));
vi.mock('@/lib/youtube-library', () => ({
  listVideosForLibraryProjection: mocks.listVideosForLibraryProjection,
  hasConnectedYouTubeAccount: mocks.hasConnectedYouTubeAccount,
}));
vi.mock('@/lib/releases/release-matrix-loader', () => ({
  loadArchivedReleaseMatrixForProfile:
    mocks.loadArchivedReleaseMatrixForProfile,
  loadReleaseMatrixForProfile: vi.fn(),
}));
vi.mock('../app-shell-route-context', () => ({
  loadAppShellRouteContext: mocks.loadAppShellRouteContext,
}));
vi.mock('./LibraryPageClient', () => ({
  LibraryPageClient: vi.fn(() => null),
}));

import LibraryPage from './page';

const profileId = '22222222-2222-4222-8222-222222222222';
const privateDocument = {
  id: '11111111-1111-4111-8111-111111111111',
  title: 'Private script',
  kind: 'script' as const,
  stage: 'private_draft' as const,
  currentRevision: 1,
  content: { type: 'doc' as const, content: [] },
  plainText: 'Private body',
  updatedAt: '2026-08-18T00:00:00.000Z',
};
const artistRule = {
  id: '33333333-3333-4333-8333-333333333333',
  category: 'visual',
  ruleKey: 'palette',
  instruction: 'never use yellow',
  strength: 'hard_constraint' as const,
  scope: 'artist' as const,
  scopeValue: null,
  allowOverride: false,
  status: 'active' as const,
  provenanceSource: 'artist' as const,
  confirmedAt: '2026-08-28T12:00:00.000Z',
  createdAt: '2026-08-28T12:00:00.000Z',
};

function getClientProps(result: Awaited<ReturnType<typeof LibraryPage>>) {
  const hydrate = result as ReactElement<{
    children: ReactElement<Record<string, unknown>>;
  }>;
  return hydrate.props.children.props;
}

function renderLibraryPage(section?: string) {
  return LibraryPage({ searchParams: Promise.resolve({ section }) });
}

describe('LibraryPage private document boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.loadAppShellRouteContext.mockResolvedValue({
      ok: true,
      userId: 'user_1',
      dashboardData: {
        selectedProfile: {
          id: profileId,
          username: 'creator',
          usernameNormalized: 'creator',
          spotifyId: null,
          appleMusicId: null,
          settings: null,
        },
      },
    });
    mocks.requireCreatorDocumentAccess.mockResolvedValue(undefined);
    mocks.listCreatorDocuments.mockResolvedValue({
      documents: [privateDocument],
      nextCursor: 'older-documents',
    });
    mocks.listVideosForLibraryProjection.mockResolvedValue([]);
    mocks.hasConnectedYouTubeAccount.mockResolvedValue(false);
    mocks.listArtistRulesForProfile.mockResolvedValue([]);
    mocks.listLibraryRelationshipsForProfile.mockResolvedValue([]);
    mocks.listLibraryPostReleaseBundle.mockResolvedValue({
      downloads: [],
      findings: [],
      rightsholders: [],
      stats: [],
    });
    mocks.fetchQuery.mockResolvedValue([]);
    mocks.loadArchivedReleaseMatrixForProfile.mockResolvedValue([]);
    mocks.getLibraryMerchCardsForProfile.mockResolvedValue([]);
    mocks.getLibraryProfileStateMapForProfile.mockResolvedValue(new Map());
    mocks.listArtistRulesForProfile.mockResolvedValue([]);
    mocks.loadArtistHandleForProfile.mockResolvedValue(null);
    mocks.getLibraryAssetShareMapForProfile.mockResolvedValue(new Map());
  });

  it('authorizes the selected profile before listing private documents', async () => {
    await renderLibraryPage();

    expect(mocks.requireCreatorDocumentAccess).toHaveBeenCalledWith({
      userId: 'user_1',
      profileId,
    });
    expect(
      mocks.requireCreatorDocumentAccess.mock.invocationCallOrder[0]
    ).toBeLessThan(mocks.listCreatorDocuments.mock.invocationCallOrder[0] ?? 0);
  });

  it('loads private documents and asset data for the unified Library', async () => {
    const result = await renderLibraryPage();

    expect(getClientProps(result)).toMatchObject({
      creatorDocuments: [privateDocument],
      creatorDocumentsNextCursor: 'older-documents',
      creatorDocumentsLoadFailed: false,
      youtubeVideos: [],
      youtubeConnected: false,
      relationships: [],
      initialArtistRules: [],
    });
    expect(mocks.fetchQuery).toHaveBeenCalled();
    expect(mocks.getLibraryMerchCardsForProfile).toHaveBeenCalled();
  });

  it('does not query or render private documents when authorization fails', async () => {
    mocks.requireCreatorDocumentAccess.mockRejectedValueOnce(
      new Error('Unauthorized')
    );

    const result = await renderLibraryPage();

    expect(mocks.listCreatorDocuments).not.toHaveBeenCalled();
    expect(getClientProps(result)).toMatchObject({
      creatorDocuments: [],
      creatorDocumentsNextCursor: null,
      creatorDocumentsLoadFailed: true,
    });
    expect(mocks.fetchQuery).toHaveBeenCalled();
  });

  it('loads the uncapped YouTube projection and graph slices together', async () => {
    await renderLibraryPage();

    expect(mocks.listVideosForLibraryProjection).toHaveBeenCalledWith({
      creatorProfileId: profileId,
    });
    expect(mocks.listLibraryRelationshipsForProfile).toHaveBeenCalledWith(
      profileId
    );
    expect(mocks.listLibraryPostReleaseBundle).toHaveBeenCalledWith(profileId);
    expect(mocks.listArtistRulesForProfile).toHaveBeenCalledWith(profileId);
  });

  it('passes artist rules into the library client', async () => {
    mocks.listArtistRulesForProfile.mockResolvedValueOnce([artistRule]);

    const result = await renderLibraryPage();

    expect(mocks.listArtistRulesForProfile).toHaveBeenCalledWith(profileId);
    expect(getClientProps(result)).toMatchObject({
      initialArtistRules: [artistRule],
    });
  });
});
