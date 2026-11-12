import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  captureError: vi.fn(),
  fetchQuery: vi.fn(),
  getDspMatchesForProfile: vi.fn(),
  getLibraryAssetShareMapForProfile: vi.fn(),
  getLibraryMerchCardsForProfile: vi.fn(),
  getLibraryProfileStateMapForProfile: vi.fn(),
  listArtistRulesForProfile: vi.fn(),
  listCreatorDocuments: vi.fn(),
  listLibraryPostReleaseBundle: vi.fn(),
  listLibraryRelationshipsForProfile: vi.fn(),
  listTeleprompterTakes: vi.fn(),
  listVideosForLibraryProjection: vi.fn(),
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
vi.mock('@/lib/db/creator-documents/store', () => ({
  listCreatorDocuments: mocks.listCreatorDocuments,
}));
vi.mock('@/lib/dsp-enrichment/queries.server', () => ({
  getDspMatchesForProfile: mocks.getDspMatchesForProfile,
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
vi.mock('@/lib/teleprompter/takes/server', () => ({
  listTeleprompterTakes: mocks.listTeleprompterTakes,
}));
vi.mock('@/lib/merch/service', () => ({
  getLibraryMerchCardsForProfile: mocks.getLibraryMerchCardsForProfile,
}));
vi.mock('@/lib/queries/server', () => ({
  getDehydratedState: vi.fn(() => ({})),
  getQueryClient: vi.fn(() => ({ fetchQuery: mocks.fetchQuery })),
}));
vi.mock('@/lib/youtube-library', () => ({
  hasConnectedYouTubeAccount: vi.fn(async () => null),
  listVideosForLibraryProjection: mocks.listVideosForLibraryProjection,
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

function getClientProps(result: Awaited<ReturnType<typeof LibraryPage>>) {
  const hydrate = result as ReactElement<{
    children: ReactElement<Record<string, unknown>>;
  }>;
  return hydrate.props.children.props;
}

function renderLibraryPage(section?: string, view?: string) {
  return LibraryPage({ searchParams: Promise.resolve({ section, view }) });
}

type FetchQueryOptions = {
  readonly queryKey: readonly unknown[];
  readonly queryFn: () => Promise<unknown>;
};

function dspMatchesCalls() {
  return mocks.fetchQuery.mock.calls.filter(
    ([options]) =>
      (options as FetchQueryOptions).queryKey[0] === 'dsp-enrichment'
  );
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
    mocks.loadArtistHandleForProfile.mockResolvedValue(null);
    mocks.getLibraryAssetShareMapForProfile.mockResolvedValue(new Map());
    mocks.listTeleprompterTakes.mockResolvedValue([]);
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

  it('runs the private-document load concurrently with the release/asset loaders', async () => {
    let resolveDocuments: (value: {
      documents: (typeof privateDocument)[];
      nextCursor: string | null;
    }) => void = () => {};
    mocks.listCreatorDocuments.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          resolveDocuments = resolve;
        })
    );

    const render = renderLibraryPage();

    // The release/asset loaders must start without waiting for the document
    // list; serializing behind it would leave this expectation unsatisfied.
    await vi.waitFor(() => {
      expect(mocks.fetchQuery).toHaveBeenCalled();
      expect(mocks.getLibraryMerchCardsForProfile).toHaveBeenCalled();
    });

    resolveDocuments({ documents: [privateDocument], nextCursor: null });
    const result = await render;
    expect(getClientProps(result)).toMatchObject({
      creatorDocuments: [privateDocument],
      creatorDocumentsLoadFailed: false,
    });
  });

  it('keeps loaded private documents when the release/asset batch fails', async () => {
    mocks.fetchQuery.mockRejectedValueOnce(new Error('matrix failed'));
    mocks.listLibraryPostReleaseBundle.mockRejectedValueOnce(
      new Error('post-release failed')
    );

    const result = await renderLibraryPage();

    expect(getClientProps(result)).toMatchObject({
      creatorDocuments: [privateDocument],
      creatorDocumentsNextCursor: 'older-documents',
      creatorDocumentsLoadFailed: false,
    });
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
    expect(mocks.listArtistRulesForProfile).not.toHaveBeenCalled();
  });

  it('reads Apple Music matches with the releases view so its banner is in the first paint', async () => {
    mocks.fetchQuery.mockImplementation(async (options: FetchQueryOptions) =>
      options.queryKey[0] === 'dsp-enrichment' ? options.queryFn() : []
    );
    mocks.getDspMatchesForProfile.mockResolvedValue([
      {
        id: 'match_1',
        providerId: 'apple_music',
        status: 'suggested',
        confidenceScore: 0.92,
        createdAt: new Date('2026-11-01T10:00:00.000Z'),
        updatedAt: new Date('2026-11-02T10:00:00.000Z'),
      },
    ]);

    await renderLibraryPage(undefined, 'releases');

    const [call] = dspMatchesCalls();
    const options = call?.[0] as FetchQueryOptions;
    // The client hook reads this exact key, so a hydrated entry skips its fetch.
    expect(options.queryKey).toEqual([
      'dsp-enrichment',
      'matches',
      profileId,
      'all',
    ]);
    expect(mocks.getDspMatchesForProfile).toHaveBeenCalledWith(
      profileId,
      'user_1'
    );
    // Dates go over the wire as the API route sends them.
    await expect(options.queryFn()).resolves.toEqual([
      expect.objectContaining({
        id: 'match_1',
        createdAt: '2026-11-01T10:00:00.000Z',
        updatedAt: '2026-11-02T10:00:00.000Z',
      }),
    ]);
  });

  it('does not read Apple Music matches for other Library views', async () => {
    await renderLibraryPage();

    expect(dspMatchesCalls()).toHaveLength(0);
  });

  it('still renders the Library when the Apple Music match read fails', async () => {
    mocks.fetchQuery.mockImplementation(async (options: FetchQueryOptions) =>
      options.queryKey[0] === 'dsp-enrichment' ? options.queryFn() : []
    );
    mocks.getDspMatchesForProfile.mockRejectedValue(new Error('db down'));

    const result = await renderLibraryPage(undefined, 'releases');

    expect(mocks.captureError).toHaveBeenCalledWith(
      'DSP matches prefetch failed on library page',
      expect.any(Error),
      expect.anything()
    );
    expect(mocks.captureError).not.toHaveBeenCalledWith(
      'Release matrix prefetch failed on library page',
      expect.anything(),
      expect.anything()
    );
    expect(getClientProps(result)).toMatchObject({
      creatorDocuments: [privateDocument],
      creatorDocumentsLoadFailed: false,
    });
  });

  it("lists the signed-in creator's studio takes without blob paths", async () => {
    mocks.listTeleprompterTakes.mockResolvedValueOnce([
      {
        schemaVersion: 1,
        takeId: 'take_1',
        takeNumber: 2,
        title: 'Save the Night intro',
        kind: 'promo',
        source: 'answer',
        question: 'Why this song?',
        contentType: 'video/webm',
        sizeBytes: 1024,
        durationMs: 30_000,
        videoPathname: 'jovie/teleprompter/takes/user_1/take_1.webm',
        ownerId: 'user_1',
        kept: true,
        createdAt: '2026-11-08T00:00:00.000Z',
        updatedAt: '2026-11-08T00:00:00.000Z',
      },
    ]);

    const result = await renderLibraryPage();

    expect(mocks.listTeleprompterTakes).toHaveBeenCalledWith('user_1');
    const takes = getClientProps(result).teleprompterTakes as unknown[];
    expect(takes).toEqual([
      expect.objectContaining({
        takeId: 'take_1',
        kept: true,
        question: 'Why this song?',
        mediaUrl: '/api/teleprompter/takes/take_1/media',
      }),
    ]);
    expect(JSON.stringify(takes)).not.toContain('videoPathname');
  });

  it('still renders Work when the takes listing fails', async () => {
    mocks.listTeleprompterTakes.mockRejectedValueOnce(new Error('blob down'));

    const result = await renderLibraryPage();

    expect(getClientProps(result)).toMatchObject({ teleprompterTakes: [] });
    expect(mocks.captureError).toHaveBeenCalledWith(
      'Studio takes load failed on library page',
      expect.any(Error),
      expect.anything()
    );
  });
});
