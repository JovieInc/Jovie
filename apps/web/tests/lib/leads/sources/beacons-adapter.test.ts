import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  fetchBeaconsDocumentMock,
  extractBeaconsMock,
  detectBeaconsPaidTierMock,
  isBeaconsUrlMock,
  extractBeaconsHandleMock,
  searchWebWithStatusMock,
} = vi.hoisted(() => ({
  fetchBeaconsDocumentMock: vi.fn(),
  extractBeaconsMock: vi.fn(),
  detectBeaconsPaidTierMock: vi.fn(),
  isBeaconsUrlMock: vi.fn(),
  extractBeaconsHandleMock: vi.fn(),
  searchWebWithStatusMock: vi.fn(),
}));

vi.mock('@/lib/ingestion/strategies/beacons', () => ({
  BEACONS_CONFIG: { canonicalHost: 'beacons.ai' },
  fetchBeaconsDocument: fetchBeaconsDocumentMock,
  extractBeacons: extractBeaconsMock,
  detectBeaconsPaidTier: detectBeaconsPaidTierMock,
  isBeaconsUrl: isBeaconsUrlMock,
  extractBeaconsHandle: extractBeaconsHandleMock,
}));

vi.mock('@/lib/leads/google-cse', () => ({
  searchWebWithStatus: searchWebWithStatusMock,
}));

import { BeaconsDiscoveryAdapter } from '@/lib/leads/sources/beacons-adapter';

const adapter = new BeaconsDiscoveryAdapter();

describe('BeaconsDiscoveryAdapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('normalizeIdentity', () => {
    it('returns a canonical beacons identity for valid URLs', () => {
      isBeaconsUrlMock.mockReturnValue(true);
      extractBeaconsHandleMock.mockReturnValue('artistname');

      expect(
        adapter.normalizeIdentity('https://beacons.ai/artistname')
      ).toEqual({
        sourcePlatform: 'beacons',
        sourceHandle: 'artistname',
        sourceUrl: 'https://beacons.ai/artistname',
      });
    });

    it('returns null for non-beacons URLs', () => {
      isBeaconsUrlMock.mockReturnValue(false);
      expect(adapter.normalizeIdentity('https://linktr.ee/x')).toBeNull();
    });
  });

  describe('discover', () => {
    it('returns beacons URLs from a successful search', async () => {
      isBeaconsUrlMock.mockImplementation((url: string) =>
        url.includes('beacons.ai')
      );
      searchWebWithStatusMock.mockResolvedValue({
        status: 'ok',
        provider: 'exa',
        results: [
          { link: 'https://beacons.ai/a' },
          { link: 'https://linktr.ee/b' },
        ],
        error: null,
      });

      const urls = await adapter.discover({ keywords: ['site:beacons.ai'] });
      expect(urls).toEqual(['https://beacons.ai/a']);
    });

    it('returns [] when the provider fails (not disguised as demand)', async () => {
      searchWebWithStatusMock.mockResolvedValue({
        status: 'quota_exceeded',
        provider: 'exa',
        results: [],
        error: 'quota',
      });
      expect(await adapter.discover({ keywords: ['q'] })).toEqual([]);
    });

    it('returns [] with no keywords', async () => {
      expect(await adapter.discover({ keywords: [] })).toEqual([]);
      expect(searchWebWithStatusMock).not.toHaveBeenCalled();
    });
  });

  describe('qualify', () => {
    it('qualifies a paid-tier profile with Spotify', async () => {
      fetchBeaconsDocumentMock.mockResolvedValue('<html/>');
      extractBeaconsMock.mockReturnValue({
        links: [
          { url: 'https://open.spotify.com/artist/abc', platformId: 'spotify' },
          { url: 'https://instagram.com/x', platformId: 'instagram' },
        ],
        displayName: 'Artist',
        bio: null,
        avatarUrl: null,
      });
      detectBeaconsPaidTierMock.mockReturnValue(true);

      const result = await adapter.qualify('https://beacons.ai/artist');
      expect(result.status).toBe('qualified');
      expect(result.sourcePlatform).toBe('beacons');
      expect(result.hasSpotifyLink).toBe(true);
      expect(result.hasInstagram).toBe(true);
      expect(result.instagramHandle).toBe('x');
      expect(result.isLinktreeVerified).toBeNull();
      expect(result.contactEmail).toBeNull();
    });

    it('disqualifies when no Spotify link exists', async () => {
      fetchBeaconsDocumentMock.mockResolvedValue('<html/>');
      extractBeaconsMock.mockReturnValue({
        links: [],
        displayName: null,
        bio: null,
        avatarUrl: null,
      });
      detectBeaconsPaidTierMock.mockReturnValue(null);

      const result = await adapter.qualify('https://beacons.ai/artist');
      expect(result.status).toBe('disqualified');
      expect(result.disqualificationReason).toBe('no_spotify');
    });
  });
});
