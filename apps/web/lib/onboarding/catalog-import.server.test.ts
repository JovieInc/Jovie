import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  sync: vi.fn(),
  discovery: vi.fn(),
  musicfetch: vi.fn(),
  musicfetchAllowed: vi.fn(() => true),
  track: vi.fn(),
  capture: vi.fn(),
  invalidate: vi.fn(),
  scheduleAfter: vi.fn((task: () => unknown) => {
    void task();
    return true;
  }),
  flag: vi.fn(() => true),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/db', () => ({ db: {} }));
vi.mock('@/lib/discography/spotify-import', () => ({
  syncReleasesFromSpotify: mocks.sync,
}));
vi.mock('@/lib/dsp-enrichment/jobs', () => ({
  processDspArtistDiscoveryJobStandalone: mocks.discovery,
  processMusicFetchEnrichmentJob: mocks.musicfetch,
}));
vi.mock('@/lib/music-resolver/musicfetch-gate', () => ({
  musicfetchNetworkAllowed: mocks.musicfetchAllowed,
}));
vi.mock('@/lib/server-analytics', () => ({ trackServerEvent: mocks.track }));
vi.mock('@/lib/error-tracking', () => ({ captureError: mocks.capture }));
vi.mock('@/lib/cache/releases', () => ({
  invalidateReleaseCaches: mocks.invalidate,
}));
vi.mock('@/lib/next/schedule-after', () => ({
  scheduleAfter: mocks.scheduleAfter,
}));
vi.mock('./catalog-preview.server', () => ({
  isValueBeforePaywallEnabled: mocks.flag,
}));

import {
  runOnboardingCatalogImport,
  scheduleOnboardingCatalogImport,
} from './catalog-import.server';

const input = {
  profileId: 'profile_1',
  spotifyArtistId: '4c9apHO3XHsvO1KyuwH0Rw',
  spotifyArtistUrl: 'https://open.spotify.com/artist/4c9apHO3XHsvO1KyuwH0Rw',
  userId: 'user_1',
};

describe('runOnboardingCatalogImport', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.flag.mockReturnValue(true);
  });

  it('imports releases with tracks, then discovers DSP links', async () => {
    mocks.sync.mockResolvedValue({
      success: true,
      imported: 22,
      updated: 0,
      failed: 0,
      total: 22,
      releases: [{}],
      errors: [],
    });

    await expect(runOnboardingCatalogImport(input)).resolves.toEqual({
      imported: 22,
      total: 22,
    });
    expect(mocks.sync).toHaveBeenCalledWith('profile_1', {
      includeTracks: true,
    });
    expect(mocks.discovery).toHaveBeenCalledWith(
      expect.objectContaining({
        creatorProfileId: 'profile_1',
        spotifyArtistId: input.spotifyArtistId,
      })
    );
    expect(mocks.musicfetch).toHaveBeenCalled();
    expect(mocks.track).toHaveBeenCalledWith(
      'releases_synced',
      expect.objectContaining({ profileId: 'profile_1', imported: 22 })
    );
  });

  it('reports an empty import instead of silently succeeding', async () => {
    mocks.sync.mockResolvedValue({
      success: false,
      imported: 0,
      updated: 0,
      failed: 0,
      total: 0,
      releases: [],
      errors: ['Spotify unavailable'],
    });

    await expect(runOnboardingCatalogImport(input)).resolves.toEqual({
      imported: 0,
      total: 0,
    });
    expect(mocks.capture).toHaveBeenCalledWith(
      'Onboarding catalog import returned no releases',
      expect.any(Error),
      expect.objectContaining({ creatorProfileId: 'profile_1' })
    );
    expect(mocks.discovery).not.toHaveBeenCalled();
  });

  it('keeps importing releases when DSP discovery throws', async () => {
    mocks.sync.mockResolvedValue({
      success: true,
      imported: 1,
      updated: 0,
      failed: 0,
      total: 1,
      releases: [{}],
      errors: [],
    });
    mocks.discovery.mockRejectedValue(new Error('apple down'));
    await expect(runOnboardingCatalogImport(input)).resolves.toEqual({
      imported: 1,
      total: 1,
    });
    expect(mocks.musicfetch).toHaveBeenCalled();
  });
});

describe('scheduleOnboardingCatalogImport', () => {
  beforeEach(() => vi.clearAllMocks());

  it('schedules the import after the response', () => {
    mocks.flag.mockReturnValue(true);
    mocks.sync.mockResolvedValue({
      success: true,
      imported: 0,
      updated: 0,
      failed: 0,
      total: 0,
      releases: [],
      errors: [],
    });
    expect(scheduleOnboardingCatalogImport(input)).toBe(true);
    expect(mocks.scheduleAfter).toHaveBeenCalledTimes(1);
  });

  it('does nothing when the kill switch is off', () => {
    mocks.flag.mockReturnValue(false);
    expect(scheduleOnboardingCatalogImport(input)).toBe(false);
    expect(mocks.scheduleAfter).not.toHaveBeenCalled();
  });
});
