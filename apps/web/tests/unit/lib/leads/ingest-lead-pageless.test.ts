import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  captureError: vi.fn(),
  checkExistingProfile: vi.fn(),
  fetchFullExtractionProfile: vi.fn(),
  handleNewProfileIngest: vi.fn(),
  handleReingestProfile: vi.fn(),
  reconcileProfileSurfaces: vi.fn(),
  resolveHostedAvatarUrl: vi.fn(),
  enqueueMusicFetchEnrichmentJob: vi.fn(),
  enqueueDspArtistDiscoveryJob: vi.fn(),
  isAvailable: vi.fn(),
  searchArtists: vi.fn(),
  getArtist: vi.fn(),
  selectLimit: vi.fn(),
  updateSet: vi.fn(),
  updateWhere: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  db: {
    select: () => ({
      from: () => ({ where: () => ({ limit: mocks.selectLimit }) }),
    }),
    update: () => ({ set: mocks.updateSet }),
  },
}));
vi.mock('@/lib/error-tracking', () => ({ captureError: mocks.captureError }));
vi.mock('@/lib/ingestion/flows/avatar-hosting', () => ({
  resolveHostedAvatarUrl: mocks.resolveHostedAvatarUrl,
}));
vi.mock('@/lib/ingestion/flows/full-extraction-flow', () => ({
  fetchFullExtractionProfile: mocks.fetchFullExtractionProfile,
}));
vi.mock('@/lib/ingestion/flows/profile-operations', () => ({
  checkExistingProfile: mocks.checkExistingProfile,
}));
vi.mock('@/lib/ingestion/flows/reingest-flow', () => ({
  handleNewProfileIngest: mocks.handleNewProfileIngest,
  handleReingestProfile: mocks.handleReingestProfile,
}));
vi.mock('@/lib/ingestion/jobs', () => ({
  enqueueDspArtistDiscoveryJob: mocks.enqueueDspArtistDiscoveryJob,
  enqueueMusicFetchEnrichmentJob: mocks.enqueueMusicFetchEnrichmentJob,
}));
vi.mock('@/lib/profile-surfaces/reconciliation', () => ({
  reconcileProfileSurfaces: mocks.reconcileProfileSurfaces,
}));
vi.mock('@/lib/spotify/client', () => ({
  spotifyClient: {
    isAvailable: mocks.isAvailable,
    searchArtists: mocks.searchArtists,
    getArtist: mocks.getArtist,
  },
}));

import type { Lead, LeadSearchEvidence } from '@/lib/db/schema/leads';
import { ingestLeadAsCreator } from '@/lib/leads/ingest-lead';

const SPOTIFY_ID = '1a2B3c4D5e6F7g8H9i0J1k';

function evidence(title: string | null): LeadSearchEvidence {
  return {
    source: 'search_match',
    query: 'site:linktr.ee "laylo.com"',
    provider: 'serpapi',
    tools: ['laylo'],
    domains: ['laylo.com'],
    title,
    snippet: 'Drops, merch and tour dates.',
    observedAt: '2026-11-01T00:00:00.000Z',
  };
}

function lead(overrides: Partial<Lead> = {}): Lead {
  return {
    id: '22222222-2222-4222-8222-222222222222',
    linktreeHandle: 'novaray',
    linktreeUrl: 'https://linktr.ee/novaray',
    sourcePlatform: 'linktree',
    sourceHandle: 'novaray',
    displayName: null,
    spotifyUrl: null,
    signalSnapshot: {
      verified: null,
      hasPaidTier: null,
      hasSpotifyLink: false,
      hasInstagram: false,
      musicToolsDetected: [],
      allLinks: [],
      hasTrackingPixels: false,
      trackingPixelPlatforms: [],
      discoveryQuery: 'site:linktr.ee "laylo.com"',
      sourcePlatform: 'linktree',
      searchEvidence: [evidence('Nova Ray')],
    },
    ...overrides,
  } as Lead;
}

const fetchSpy = vi.fn();

describe('ingestLeadAsCreator for leads whose page is never read', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', fetchSpy);
    mocks.checkExistingProfile.mockImplementation(async (handle: string) => ({
      existing: null,
      finalHandle: handle,
      isReingest: false,
    }));
    mocks.resolveHostedAvatarUrl.mockResolvedValue(null);
    mocks.handleNewProfileIngest.mockResolvedValue({
      json: async () => ({
        ok: true,
        profile: { id: 'profile-1', username: 'novaray' },
      }),
    });
    mocks.reconcileProfileSurfaces.mockResolvedValue({});
    mocks.enqueueMusicFetchEnrichmentJob.mockResolvedValue(undefined);
    mocks.enqueueDspArtistDiscoveryJob.mockResolvedValue(undefined);
    mocks.selectLimit.mockResolvedValue([
      { spotifyId: null, spotifyUrl: null },
    ]);
    mocks.updateWhere.mockResolvedValue(undefined);
    mocks.updateSet.mockReturnValue({ where: mocks.updateWhere });
    mocks.isAvailable.mockReturnValue(true);
    mocks.searchArtists.mockResolvedValue([
      {
        spotifyId: SPOTIFY_ID,
        name: 'Nova Ray',
        imageUrl: 'https://i.scdn.co/image/nova',
        followerCount: 900,
        popularity: 20,
      },
      {
        spotifyId: '9z8Y7x6W5v4U3t2S1r0Q9p',
        name: 'Nova Rayne',
        imageUrl: null,
        followerCount: 10,
        popularity: 1,
      },
    ]);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('builds a Linktree lead from its search name and Spotify without reading the page', async () => {
    const result = await ingestLeadAsCreator(lead());

    expect(result).toMatchObject({ success: true, profileId: 'profile-1' });
    expect(mocks.fetchFullExtractionProfile).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(mocks.searchArtists).toHaveBeenCalledWith('Nova Ray', 5);
    expect(mocks.handleNewProfileIngest).toHaveBeenCalledWith(
      expect.objectContaining({
        finalHandle: 'novaray',
        displayName: 'Nova Ray',
        leadHold: true,
        extraction: expect.objectContaining({
          avatarUrl: 'https://i.scdn.co/image/nova',
          links: [
            expect.objectContaining({
              url: `https://open.spotify.com/artist/${SPOTIFY_ID}`,
            }),
            expect.objectContaining({ url: 'https://linktr.ee/novaray' }),
          ],
        }),
      })
    );
    // The avatar comes from Spotify only; the page link is never scanned.
    expect(mocks.resolveHostedAvatarUrl).toHaveBeenCalledWith('novaray', {
      avatarUrl: 'https://i.scdn.co/image/nova',
      links: [],
    });
    expect(mocks.updateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'ingested',
        creatorProfileId: 'profile-1',
        spotifyUrl: `https://open.spotify.com/artist/${SPOTIFY_ID}`,
      })
    );
    expect(mocks.enqueueDspArtistDiscoveryJob).toHaveBeenCalledWith(
      expect.objectContaining({ spotifyArtistId: SPOTIFY_ID })
    );
  });

  it('strips the beacons: key prefix for the username', async () => {
    await ingestLeadAsCreator(
      lead({
        linktreeHandle: 'beacons:novaray',
        linktreeUrl: 'https://beacons.ai/novaray',
        sourcePlatform: 'beacons',
        sourceHandle: null,
      })
    );

    expect(mocks.fetchFullExtractionProfile).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(mocks.checkExistingProfile).toHaveBeenCalledWith('novaray');
    expect(mocks.handleNewProfileIngest).toHaveBeenCalledWith(
      expect.objectContaining({ finalHandle: 'novaray' })
    );
  });

  it('builds from the search name alone when Spotify has no single match', async () => {
    mocks.searchArtists.mockResolvedValue([]);

    const result = await ingestLeadAsCreator(lead());

    expect(result.success).toBe(true);
    expect(mocks.handleNewProfileIngest).toHaveBeenCalledWith(
      expect.objectContaining({
        displayName: 'Nova Ray',
        extraction: expect.objectContaining({
          avatarUrl: null,
          links: [
            expect.objectContaining({ url: 'https://linktr.ee/novaray' }),
          ],
        }),
      })
    );
    expect(mocks.updateSet).toHaveBeenCalledWith(
      expect.not.objectContaining({ spotifyUrl: expect.anything() })
    );
  });

  it('matches Spotify by handle when the search showed no usable name', async () => {
    const result = await ingestLeadAsCreator(
      lead({
        signalSnapshot: {
          ...lead().signalSnapshot!,
          searchEvidence: [evidence(null)],
        },
      })
    );

    expect(result.success).toBe(true);
    expect(mocks.searchArtists).toHaveBeenCalledWith('novaray', 5);
    expect(mocks.handleNewProfileIngest).toHaveBeenCalledWith(
      expect.objectContaining({ displayName: 'Nova Ray' })
    );
  });

  it('leaves the lead unbuilt with a reason code when there is no name and no Spotify match', async () => {
    mocks.searchArtists.mockResolvedValue([]);

    const result = await ingestLeadAsCreator(
      lead({
        signalSnapshot: {
          ...lead().signalSnapshot!,
          searchEvidence: [evidence('Hip Hop Artist')],
        },
      })
    );

    expect(result).toEqual({
      success: false,
      error: 'No reliable name or Spotify match for lead',
      reason: 'pageless_identity_unresolved',
    });
    expect(mocks.checkExistingProfile).not.toHaveBeenCalled();
    expect(mocks.handleNewProfileIngest).not.toHaveBeenCalled();
    expect(mocks.updateSet).not.toHaveBeenCalled();
    expect(mocks.fetchFullExtractionProfile).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('treats a Spotify outage as no match rather than inventing data', async () => {
    mocks.searchArtists.mockRejectedValue(new Error('spotify down'));

    const result = await ingestLeadAsCreator(
      lead({
        signalSnapshot: {
          ...lead().signalSnapshot!,
          searchEvidence: [evidence(null)],
        },
      })
    );

    expect(result).toMatchObject({
      success: false,
      reason: 'pageless_identity_unresolved',
    });
    expect(mocks.handleNewProfileIngest).not.toHaveBeenCalled();
  });

  it('keeps reading Laylo leads through the existing extraction', async () => {
    mocks.fetchFullExtractionProfile.mockResolvedValue({
      links: [],
      avatarUrl: null,
      displayName: 'Nova Ray',
    });

    await ingestLeadAsCreator(
      lead({
        linktreeUrl: 'https://laylo.com/novaray',
        sourcePlatform: 'laylo',
      })
    );

    expect(mocks.fetchFullExtractionProfile).toHaveBeenCalledWith(
      true,
      'https://laylo.com/novaray',
      'novaray'
    );
    expect(mocks.searchArtists).not.toHaveBeenCalled();
  });

  it('reads a manually added Laylo lead that kept the default platform', async () => {
    mocks.fetchFullExtractionProfile.mockResolvedValue({
      links: [],
      avatarUrl: null,
      displayName: 'Nova Ray',
    });

    await ingestLeadAsCreator(
      lead({
        linktreeUrl: 'https://laylo.com/novaray',
        sourcePlatform: 'linktree',
      })
    );

    expect(mocks.fetchFullExtractionProfile).toHaveBeenCalledWith(
      true,
      'https://laylo.com/novaray',
      'novaray'
    );
    expect(mocks.searchArtists).not.toHaveBeenCalled();
  });
});
