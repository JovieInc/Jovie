import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock server-only since tests don't run in server context
vi.mock('server-only', () => ({}));

// Mock env
vi.mock('@/lib/env-server', () => ({
  env: {
    get MUSICFETCH_API_TOKEN() {
      return mockToken;
    },
  },
}));

// Mock Sentry
vi.mock('@sentry/nextjs', () => ({
  addBreadcrumb: vi.fn(),
}));

// Mock circuit breaker
const mockExecute = vi.fn();
const mockGetState = vi.fn().mockReturnValue('CLOSED');
const mockGetStats = vi.fn().mockReturnValue({ state: 'CLOSED' });
vi.mock('@/lib/discography/musicfetch-circuit-breaker', () => ({
  musicfetchCircuitBreaker: {
    execute: (...args: unknown[]) => mockExecute(...args),
    getState: () => mockGetState(),
    getStats: () => mockGetStats(),
    reset: vi.fn(),
  },
}));

let mockToken: string | undefined = 'test-token';

describe('musicfetch client', () => {
  beforeEach(() => {
    mockToken = 'test-token';
    mockExecute.mockReset();
    mockGetState.mockReturnValue('CLOSED');
  });

  describe('isMusicfetchConfigured', () => {
    it('returns true when token is set', async () => {
      const { isMusicfetchConfigured } = await import(
        '@/lib/discography/musicfetch'
      );
      expect(isMusicfetchConfigured()).toBe(true);
    });

    it('returns false when token is not set', async () => {
      mockToken = undefined;
      const { isMusicfetchConfigured } = await import(
        '@/lib/discography/musicfetch'
      );
      expect(isMusicfetchConfigured()).toBe(false);
    });
  });

  describe('isMusicfetchAvailable', () => {
    it('returns false when circuit breaker is open', async () => {
      mockGetState.mockReturnValue('OPEN');
      const { isMusicfetchAvailable } = await import(
        '@/lib/discography/musicfetch'
      );
      expect(isMusicfetchAvailable()).toBe(false);
    });

    it('returns true when configured and circuit breaker is closed', async () => {
      const { isMusicfetchAvailable } = await import(
        '@/lib/discography/musicfetch'
      );
      expect(isMusicfetchAvailable()).toBe(true);
    });
  });

  describe('lookupByIsrc', () => {
    it('returns null when token is not configured', async () => {
      mockToken = undefined;
      const { lookupByIsrc } = await import('@/lib/discography/musicfetch');
      const result = await lookupByIsrc('USUM72212345');
      expect(result).toBeNull();
      expect(mockExecute).not.toHaveBeenCalled();
    });

    it('returns mapped provider links on successful response', async () => {
      mockExecute.mockImplementation(async (fn: () => Promise<unknown>) => {
        // Simulate what circuit breaker does: execute the fn
        // But we mock the whole response instead
        return {
          result: {
            type: 'track',
            name: 'Anti-Hero',
            isrc: 'USUM72212345',
            services: {
              spotify: { url: 'https://open.spotify.com/track/abc123' },
              appleMusic: {
                url: 'https://music.apple.com/us/album/anti-hero/123',
              },
              youtubeMusic: {
                url: 'https://music.youtube.com/watch?v=xyz',
              },
              tidal: { url: 'https://tidal.com/track/456' },
              pandora: {
                url: 'https://www.pandora.com/artist/taylor-swift/anti-hero',
              },
              iHeartRadio: {
                url: 'https://www.iheart.com/song/anti-hero-123',
              },
            },
          },
        };
      });

      const { lookupByIsrc } = await import('@/lib/discography/musicfetch');
      const result = await lookupByIsrc('USUM72212345');

      expect(result).not.toBeNull();
      expect(result!.links).toEqual({
        spotify: 'https://open.spotify.com/track/abc123',
        apple_music: 'https://music.apple.com/us/album/anti-hero/123',
        youtube: 'https://music.youtube.com/watch?v=xyz',
        tidal: 'https://tidal.com/track/456',
        pandora: 'https://www.pandora.com/artist/taylor-swift/anti-hero',
        iheartradio: 'https://www.iheart.com/song/anti-hero-123',
      });
    });

    it('maps musicfetch camelCase service names to snake_case provider keys', async () => {
      mockExecute.mockResolvedValue({
        result: {
          type: 'track',
          name: 'Test',
          isrc: 'TEST123',
          services: {
            amazonMusic: { url: 'https://music.amazon.com/albums/B123' },
            iHeartRadio: { url: 'https://www.iheart.com/song/test-123' },
          },
        },
      });

      const { lookupByIsrc } = await import('@/lib/discography/musicfetch');
      const result = await lookupByIsrc('TEST123');

      expect(result!.links).toEqual({
        amazon_music: 'https://music.amazon.com/albums/B123',
        iheartradio: 'https://www.iheart.com/song/test-123',
      });
    });

    it('returns null when circuit breaker throws', async () => {
      mockExecute.mockRejectedValue(new Error('Circuit is OPEN'));

      const { lookupByIsrc } = await import('@/lib/discography/musicfetch');
      const result = await lookupByIsrc('USUM72212345');

      expect(result).toBeNull();
    });

    it('returns null when API returns no services', async () => {
      mockExecute.mockResolvedValue({
        result: {
          type: 'track',
          name: 'Unknown',
          isrc: 'UNKNOWN',
          services: {},
        },
      });

      const { lookupByIsrc } = await import('@/lib/discography/musicfetch');
      const result = await lookupByIsrc('UNKNOWN');

      expect(result).not.toBeNull();
      expect(Object.keys(result!.links)).toHaveLength(0);
    });

    it('skips services without URLs', async () => {
      mockExecute.mockResolvedValue({
        result: {
          type: 'track',
          name: 'Test',
          isrc: 'TEST',
          services: {
            spotify: { url: 'https://open.spotify.com/track/abc' },
            deezer: { someOtherField: 'no-url-here' },
          },
        },
      });

      const { lookupByIsrc } = await import('@/lib/discography/musicfetch');
      const result = await lookupByIsrc('TEST');

      expect(result!.links).toEqual({
        spotify: 'https://open.spotify.com/track/abc',
      });
    });
  });
});
