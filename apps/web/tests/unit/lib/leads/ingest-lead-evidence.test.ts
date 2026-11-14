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
    vi.resetAllMocks();
    mocks.profile = [{ spotifyUrl: null, spotifyId: null }];
    mocks.musicFetch.mockResolvedValue('music-job');
    mocks.dsp.mockResolvedValue('dsp-job');
    mocks.reconcile.mockResolvedValue({ surfaces: 6, sources: 6 });
  });

  it("falls back to the lead's Spotify artist link when the profile has none", async () => {
    mocks.profile = [{ spotifyUrl: null, spotifyId: null }];
    await expect(
      refreshLeadProfileEvidence('profile-1', {
        id: 'lead-1',
        spotifyUrl: ARTIST_URL,
      })
    ).resolves.toMatchObject({ musicFetch: true, dspDiscovery: true });
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
    ).resolves.toMatchObject({
      musicFetch: false,
      dspDiscovery: false,
      status: 'no_source',
    });
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
    ).resolves.toMatchObject({ musicFetch: true, dspDiscovery: true });
    expect(mocks.captureError).toHaveBeenCalled();
  });
  it('waits for both queue receipts before returning acceptance', async () => {
    const music = Promise.withResolvers<string>();
    const dsp = Promise.withResolvers<string>();
    mocks.musicFetch.mockReturnValue(music.promise);
    mocks.dsp.mockReturnValue(dsp.promise);
    let settled = false;
    const refresh = refreshLeadProfileEvidence('profile-1', {
      id: 'lead-1',
      spotifyUrl: ARTIST_URL,
    }).then(result => {
      settled = true;
      return result;
    });
    // Drain microtasks deterministically; no wall-clock polling.
    for (let i = 0; i < 20; i++) await Promise.resolve();
    expect(settled).toBe(false);
    music.resolve('music-job');
    for (let i = 0; i < 20; i++) await Promise.resolve();
    expect(settled).toBe(false);
    dsp.resolve('dsp-job');
    await expect(refresh).resolves.toMatchObject({
      status: 'accepted',
      musicFetch: true,
      dspDiscovery: true,
      jobs: {
        musicFetch: { status: 'accepted', jobId: 'music-job' },
        dspDiscovery: { status: 'accepted', jobId: 'dsp-job' },
      },
    });
  });

  it.each(['musicFetch', 'dsp'] as const)(
    'reports a rejected %s enqueue without discarding the other receipt',
    async provider => {
      mocks[provider].mockRejectedValue(new Error('private provider detail'));
      const result = await refreshLeadProfileEvidence('profile-1', {
        id: 'lead-1',
        spotifyUrl: ARTIST_URL,
      });
      expect(result).toMatchObject({
        status: 'partial',
        musicFetch: provider !== 'musicFetch',
        dspDiscovery: provider !== 'dsp',
      });
      expect(mocks.captureError).toHaveBeenCalled();
      expect(JSON.stringify(result)).not.toContain('private provider detail');
    }
  );

  it('does not call a null job receipt accepted', async () => {
    mocks.musicFetch.mockResolvedValue(null);
    const result = await refreshLeadProfileEvidence('profile-1', {
      id: 'lead-1',
      spotifyUrl: ARTIST_URL,
    });
    expect(result).toMatchObject({
      status: 'partial',
      musicFetch: false,
      dspDiscovery: true,
      jobs: { musicFetch: { status: 'not_accepted', jobId: null } },
    });
  });

  it('reports surface failure alongside accepted jobs', async () => {
    mocks.reconcile.mockRejectedValue(new Error('surface write failed'));
    await expect(
      refreshLeadProfileEvidence('profile-1', {
        id: 'lead-1',
        spotifyUrl: ARTIST_URL,
      })
    ).resolves.toMatchObject({
      status: 'partial',
      musicFetch: true,
      dspDiscovery: true,
      surfaces: { status: 'failed' },
    });
  });

  it('reports total failure when reconciliation and both enqueues fail', async () => {
    mocks.reconcile.mockRejectedValue(new Error('db'));
    mocks.musicFetch.mockRejectedValue(new Error('db'));
    mocks.dsp.mockRejectedValue(new Error('db'));
    await expect(
      refreshLeadProfileEvidence('profile-1', {
        id: 'lead-1',
        spotifyUrl: ARTIST_URL,
      })
    ).resolves.toMatchObject({
      status: 'failed',
      musicFetch: false,
      dspDiscovery: false,
    });
  });

  it('does not turn a failed reconciliation without Spotify into no-source success', async () => {
    mocks.reconcile.mockRejectedValue(new Error('db'));
    await expect(
      refreshLeadProfileEvidence('profile-1', {
        id: 'lead-1',
        spotifyUrl: null,
      })
    ).resolves.toMatchObject({
      status: 'failed',
      musicFetch: false,
      dspDiscovery: false,
    });
    expect(mocks.musicFetch).not.toHaveBeenCalled();
    expect(mocks.dsp).not.toHaveBeenCalled();
  });

  it('rejects a missing profile without enqueueing orphaned work', async () => {
    mocks.profile = [];
    await expect(
      refreshLeadProfileEvidence('profile-1', {
        id: 'lead-1',
        spotifyUrl: ARTIST_URL,
      })
    ).rejects.toThrow('Lead profile not found');
    expect(mocks.reconcile).not.toHaveBeenCalled();
    expect(mocks.musicFetch).not.toHaveBeenCalled();
    expect(mocks.dsp).not.toHaveBeenCalled();
  });
  it('preserves existing-job receipts, including a shared fallback job', async () => {
    mocks.profile = [{ spotifyUrl: ARTIST_URL, spotifyId: 'profile-artist' }];
    mocks.musicFetch.mockResolvedValue('existing-dsp-job');
    mocks.dsp.mockResolvedValue('existing-dsp-job');
    await expect(
      refreshLeadProfileEvidence('profile-1', {
        id: 'lead-1',
        spotifyUrl: null,
      })
    ).resolves.toMatchObject({
      status: 'accepted',
      musicFetch: true,
      dspDiscovery: true,
    });
    expect(mocks.dsp).toHaveBeenCalledWith(
      expect.objectContaining({ spotifyArtistId: 'profile-artist' })
    );
  });

  it('accepts a DSP-only refresh when the profile has an ID but no URL', async () => {
    mocks.profile = [{ spotifyUrl: null, spotifyId: 'profile-artist' }];
    await expect(
      refreshLeadProfileEvidence('profile-1', {
        id: 'lead-1',
        spotifyUrl: null,
      })
    ).resolves.toMatchObject({
      status: 'accepted',
      musicFetch: false,
      dspDiscovery: true,
      jobs: { musicFetch: { status: 'no_source', jobId: null } },
    });
    expect(mocks.musicFetch).not.toHaveBeenCalled();
  });

  it('retains reconciled surface counts when neither queue acknowledges work', async () => {
    mocks.musicFetch.mockResolvedValue(null);
    mocks.dsp.mockResolvedValue(null);
    await expect(
      refreshLeadProfileEvidence('profile-1', {
        id: 'lead-1',
        spotifyUrl: ARTIST_URL,
      })
    ).resolves.toMatchObject({
      status: 'partial',
      musicFetch: false,
      dspDiscovery: false,
      surfaces: { status: 'reconciled', surfaces: 6, sources: 6 },
      jobs: {
        musicFetch: { status: 'not_accepted', jobId: null },
        dspDiscovery: { status: 'not_accepted', jobId: null },
      },
    });
  });
});
