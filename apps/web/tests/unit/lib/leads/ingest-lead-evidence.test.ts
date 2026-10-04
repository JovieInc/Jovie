import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  profile: [] as unknown[],
  reconcile: vi.fn(),
  musicFetch: vi.fn(),
  dsp: vi.fn(),
  captureError: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  db: {
    select: () => ({
      from: () => ({ where: () => ({ limit: async () => mocks.profile }) }),
    }),
  },
}));
vi.mock('@/lib/profile-surfaces/reconciliation', () => ({
  reconcileProfileSurfaces: mocks.reconcile,
}));
vi.mock('@/lib/ingestion/jobs', () => ({
  enqueueMusicFetchEnrichmentJob: mocks.musicFetch,
  enqueueDspArtistDiscoveryJob: mocks.dsp,
}));
vi.mock('@/lib/error-tracking', () => ({ captureError: mocks.captureError }));
vi.mock('@/lib/ingestion/flows/avatar-hosting', () => ({}));
vi.mock('@/lib/ingestion/flows/full-extraction-flow', () => ({}));
vi.mock('@/lib/ingestion/flows/profile-operations', () => ({}));
vi.mock('@/lib/ingestion/flows/reingest-flow', () => ({}));

import { refreshLeadProfileEvidence } from '@/lib/leads/ingest-lead';

const ARTIST_URL = 'https://open.spotify.com/artist/4Z8W4fKeB5YxbusRsdQVPb';

describe('refreshLeadProfileEvidence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.musicFetch.mockResolvedValue(undefined);
    mocks.dsp.mockResolvedValue(undefined);
    mocks.reconcile.mockResolvedValue({ surfaces: 6, sources: 6 });
  });

  it("falls back to the lead's Spotify artist link when the profile has none", async () => {
    mocks.profile = [{ spotifyUrl: null, spotifyId: null }];
    await expect(
      refreshLeadProfileEvidence('profile-1', {
        id: 'lead-1',
        spotifyUrl: ARTIST_URL,
      })
    ).resolves.toEqual({ musicFetch: true, dspDiscovery: true });
    expect(mocks.reconcile).toHaveBeenCalledWith('profile-1');
    expect(mocks.musicFetch).toHaveBeenCalledWith({
      creatorProfileId: 'profile-1',
      spotifyUrl: ARTIST_URL,
    });
    expect(mocks.dsp).toHaveBeenCalledWith(
      expect.objectContaining({ spotifyArtistId: '4Z8W4fKeB5YxbusRsdQVPb' })
    );
  });

  it('does not guess an artist from a non-artist Spotify link', async () => {
    mocks.profile = [{ spotifyUrl: null, spotifyId: null }];
    await expect(
      refreshLeadProfileEvidence('profile-1', {
        id: 'lead-1',
        spotifyUrl: 'https://open.spotify.com/playlist/37i9dQZF1DX0XUsuxWHRQd',
      })
    ).resolves.toEqual({ musicFetch: false, dspDiscovery: false });
    expect(mocks.reconcile).toHaveBeenCalled();
  });

  it('keeps going when surface reconciliation fails', async () => {
    mocks.profile = [{ spotifyUrl: ARTIST_URL, spotifyId: 'abc' }];
    mocks.reconcile.mockRejectedValue(new Error('db'));
    await expect(
      refreshLeadProfileEvidence('profile-1', {
        id: 'lead-1',
        spotifyUrl: null,
      })
    ).resolves.toEqual({ musicFetch: true, dspDiscovery: true });
    expect(mocks.captureError).toHaveBeenCalled();
  });
});
