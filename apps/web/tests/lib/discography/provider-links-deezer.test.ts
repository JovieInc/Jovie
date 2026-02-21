/**
 * Tests for Deezer ISRC lookups in the provider-links module.
 *
 * The existing provider-links.test.ts only covers Apple Music ISRC lookups.
 * This file fills the gap by testing lookupDeezerByIsrc and Deezer integration
 * in resolveProviderLinks.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock Sentry before imports
vi.mock('@sentry/nextjs', () => ({
  addBreadcrumb: vi.fn(),
}));

// Mock musicfetch to control availability in resolveProviderLinks
const mockIsMusicfetchAvailable = vi.fn(() => false);
vi.mock('@/lib/discography/musicfetch', () => ({
  isMusicfetchAvailable: () => mockIsMusicfetchAvailable(),
  lookupByIsrc: vi.fn().mockResolvedValue(null),
}));

import * as Sentry from '@sentry/nextjs';
import {
  lookupDeezerByIsrc,
  resolveProviderLinks,
  type TrackDescriptor,
} from '@/lib/discography/provider-links';

const baseTrack: TrackDescriptor = {
  title: 'Anti-Hero',
  artistName: 'Taylor Swift',
  isrc: 'USUM72212345',
};

describe('lookupDeezerByIsrc', () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.clearAllMocks();
    fetchMock.mockReset();
  });

  it('returns track and album data on successful lookup', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 1234567,
        link: 'https://www.deezer.com/track/1234567',
        album: {
          id: 9876543,
          link: 'https://www.deezer.com/album/9876543',
        },
      }),
    } as unknown as Response);

    const result = await lookupDeezerByIsrc('USUM72212345', {
      fetcher: fetchMock,
    });

    expect(result).toEqual({
      url: 'https://www.deezer.com/track/1234567',
      trackId: '1234567',
      albumUrl: 'https://www.deezer.com/album/9876543',
      albumId: '9876543',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.deezer.com/track/isrc:USUM72212345'
    );
  });

  it('returns null when Deezer returns an error object', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        error: {
          type: 'DataException',
          message: 'no data',
        },
      }),
    } as unknown as Response);

    const result = await lookupDeezerByIsrc('INVALID_ISRC', {
      fetcher: fetchMock,
    });

    expect(result).toBeNull();
  });

  it('returns null when Deezer returns no id', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        link: 'https://www.deezer.com/track/noid',
      }),
    } as unknown as Response);

    const result = await lookupDeezerByIsrc('USUM72212345', {
      fetcher: fetchMock,
    });

    expect(result).toBeNull();
  });

  it('returns null when Deezer returns no link', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 1234567,
      }),
    } as unknown as Response);

    const result = await lookupDeezerByIsrc('USUM72212345', {
      fetcher: fetchMock,
    });

    expect(result).toBeNull();
  });

  it('returns null on network error and logs breadcrumb', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNRESET'));

    const result = await lookupDeezerByIsrc('USUM72212345', {
      fetcher: fetchMock,
    });

    expect(result).toBeNull();
    expect(Sentry.addBreadcrumb).toHaveBeenCalledWith(
      expect.objectContaining({
        category: 'discography',
        message: 'Deezer lookup failed',
      })
    );
  });

  it('returns null on non-OK response', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
    } as unknown as Response);

    const result = await lookupDeezerByIsrc('USUM72212345', {
      fetcher: fetchMock,
    });

    expect(result).toBeNull();
  });

  it('handles missing album data gracefully', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 1234567,
        link: 'https://www.deezer.com/track/1234567',
        // No album field
      }),
    } as unknown as Response);

    const result = await lookupDeezerByIsrc('USUM72212345', {
      fetcher: fetchMock,
    });

    expect(result).toEqual({
      url: 'https://www.deezer.com/track/1234567',
      trackId: '1234567',
      albumUrl: null,
      albumId: null,
    });
  });

  it('handles album with missing link and id', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 1234567,
        link: 'https://www.deezer.com/track/1234567',
        album: {},
      }),
    } as unknown as Response);

    const result = await lookupDeezerByIsrc('USUM72212345', {
      fetcher: fetchMock,
    });

    expect(result).toEqual({
      url: 'https://www.deezer.com/track/1234567',
      trackId: '1234567',
      albumUrl: null,
      albumId: null,
    });
  });
});

describe('resolveProviderLinks with Deezer', () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.clearAllMocks();
    fetchMock.mockReset();
    mockIsMusicfetchAvailable.mockReturnValue(false);
  });

  it('includes Deezer canonical link when ISRC lookup succeeds', async () => {
    // Mock the Apple Music (iTunes) lookup to return nothing
    fetchMock.mockImplementation(async (url: string | URL | Request) => {
      const urlStr = typeof url === 'string' ? url : url.toString();

      if (urlStr.includes('api.deezer.com')) {
        return {
          ok: true,
          json: async () => ({
            id: 9999,
            link: 'https://www.deezer.com/track/9999',
            album: {
              id: 5555,
              link: 'https://www.deezer.com/album/5555',
            },
          }),
        } as unknown as Response;
      }

      // iTunes returns no result
      return {
        ok: true,
        json: async () => ({ resultCount: 0, results: [] }),
      } as unknown as Response;
    });

    const links = await resolveProviderLinks(baseTrack, {
      providers: ['deezer', 'spotify'],
      fetcher: fetchMock,
    });

    // Deezer should prefer album URL
    expect(links).toContainEqual(
      expect.objectContaining({
        provider: 'deezer',
        url: 'https://www.deezer.com/album/5555',
        quality: 'canonical',
        discovered_from: 'deezer_isrc',
      })
    );
  });

  it('falls back to search URL when Deezer ISRC lookup fails', async () => {
    fetchMock.mockImplementation(async (url: string | URL | Request) => {
      const urlStr = typeof url === 'string' ? url : url.toString();

      if (urlStr.includes('api.deezer.com')) {
        return {
          ok: true,
          json: async () => ({
            error: { type: 'DataException', message: 'no data' },
          }),
        } as unknown as Response;
      }

      return {
        ok: true,
        json: async () => ({ resultCount: 0, results: [] }),
      } as unknown as Response;
    });

    const links = await resolveProviderLinks(baseTrack, {
      providers: ['deezer'],
      fetcher: fetchMock,
    });

    expect(links).toContainEqual(
      expect.objectContaining({
        provider: 'deezer',
        quality: 'search_fallback',
        discovered_from: 'search_url',
      })
    );
  });

  it('does not include Deezer when not in providers list', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ resultCount: 0, results: [] }),
    } as unknown as Response);

    const links = await resolveProviderLinks(baseTrack, {
      providers: ['apple_music'],
      fetcher: fetchMock,
    });

    const deezerLinks = links.filter(l => l.provider === 'deezer');
    expect(deezerLinks).toHaveLength(0);
  });

  it('prefers Deezer album URL over track URL', async () => {
    fetchMock.mockImplementation(async (url: string | URL | Request) => {
      const urlStr = typeof url === 'string' ? url : url.toString();

      if (urlStr.includes('api.deezer.com')) {
        return {
          ok: true,
          json: async () => ({
            id: 1111,
            link: 'https://www.deezer.com/track/1111',
            album: {
              id: 2222,
              link: 'https://www.deezer.com/album/2222',
            },
          }),
        } as unknown as Response;
      }

      return {
        ok: true,
        json: async () => ({ resultCount: 0, results: [] }),
      } as unknown as Response;
    });

    const links = await resolveProviderLinks(baseTrack, {
      providers: ['deezer'],
      fetcher: fetchMock,
    });

    expect(links[0]).toMatchObject({
      provider: 'deezer',
      url: 'https://www.deezer.com/album/2222',
      provider_id: '2222',
    });
  });
});
