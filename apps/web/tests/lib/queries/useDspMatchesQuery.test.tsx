import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { queryKeys } from '@/lib/queries/keys';
import {
  countMatchesByStatus,
  type DspMatch,
  getBestMatchPerProvider,
  groupMatchesByProvider,
  useDspMatchesQuery,
} from '@/lib/queries/useDspMatchesQuery';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock env
vi.mock('@/lib/env-client', () => ({
  env: { IS_DEV: false },
}));

// Sample match data for tests
const createMockMatch = (overrides: Partial<DspMatch> = {}): DspMatch => ({
  id: 'match-1',
  providerId: 'apple_music',
  externalArtistId: 'ext-artist-1',
  externalArtistName: 'Test Artist',
  externalArtistUrl: 'https://music.apple.com/artist/123',
  externalArtistImageUrl: 'https://example.com/image.jpg',
  confidenceScore: 0.85,
  confidenceBreakdown: {
    isrcMatchScore: 0.9,
    upcMatchScore: 0.8,
    nameSimilarityScore: 0.85,
    followerRatioScore: 0.7,
    genreOverlapScore: 0.9,
  },
  matchingIsrcCount: 10,
  matchingUpcCount: 5,
  totalTracksChecked: 20,
  status: 'suggested',
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
  ...overrides,
});

describe('useDspMatchesQuery', () => {
  let queryClient: QueryClient;

  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          gcTime: 0,
        },
      },
    });
  });

  describe('useDspMatchesQuery hook', () => {
    it('fetches matches successfully', async () => {
      const mockMatches = [
        createMockMatch({ id: 'match-1', providerId: 'apple_music' }),
        createMockMatch({ id: 'match-2', providerId: 'deezer' }),
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            success: true,
            matches: mockMatches,
          }),
      });

      const { result } = renderHook(
        () => useDspMatchesQuery({ profileId: 'profile-123' }),
        { wrapper }
      );

      expect(result.current.isLoading).toBe(true);

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data).toHaveLength(2);
      expect(result.current.data?.[0].providerId).toBe('apple_music');
    });

    it('includes profileId in URL', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, matches: [] }),
      });

      renderHook(() => useDspMatchesQuery({ profileId: 'profile-123' }), {
        wrapper,
      });

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('profileId=profile-123'),
          expect.any(Object)
        );
      });
    });

    it('includes status filter in URL when provided', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, matches: [] }),
      });

      renderHook(
        () =>
          useDspMatchesQuery({ profileId: 'profile-123', status: 'suggested' }),
        { wrapper }
      );

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('status=suggested'),
          expect.any(Object)
        );
      });
    });

    it('does not include status in URL when "all"', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, matches: [] }),
      });

      renderHook(
        () => useDspMatchesQuery({ profileId: 'profile-123', status: 'all' }),
        { wrapper }
      );

      await waitFor(() => {
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).not.toContain('status=');
      });
    });

    it('uses correct query key with profileId and status', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, matches: [] }),
      });

      renderHook(
        () =>
          useDspMatchesQuery({ profileId: 'profile-123', status: 'suggested' }),
        { wrapper }
      );

      await waitFor(() => {
        expect(
          queryClient.getQueryState(
            queryKeys.dspEnrichment.matches('profile-123', 'suggested')
          )
        ).toBeDefined();
      });
    });

    it('is disabled when profileId is empty', async () => {
      const { result } = renderHook(
        () => useDspMatchesQuery({ profileId: '' }),
        { wrapper }
      );

      // Should not fetch
      expect(mockFetch).not.toHaveBeenCalled();
      expect(result.current.fetchStatus).toBe('idle');
    });

    it('is disabled when enabled=false', async () => {
      const { result } = renderHook(
        () => useDspMatchesQuery({ profileId: 'profile-123', enabled: false }),
        { wrapper }
      );

      expect(mockFetch).not.toHaveBeenCalled();
      expect(result.current.fetchStatus).toBe('idle');
    });

    it('throws error when API returns success: false', async () => {
      // Use mockResolvedValue (not Once) because hook has retry: 3
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            success: false,
            error: 'Profile not found',
            matches: [],
          }),
      });

      const { result } = renderHook(
        () => useDspMatchesQuery({ profileId: 'profile-123' }),
        { wrapper }
      );

      await waitFor(
        () => {
          expect(result.current.isError).toBe(true);
        },
        { timeout: 10000 }
      );

      expect(result.current.error?.message).toBe('Profile not found');
    });

    it('handles HTTP error', async () => {
      // Use mockResolvedValue (not Once) because hook has retry: 3
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      });

      const { result } = renderHook(
        () => useDspMatchesQuery({ profileId: 'profile-123' }),
        { wrapper }
      );

      await waitFor(
        () => {
          expect(result.current.isError).toBe(true);
        },
        { timeout: 10000 }
      );
    });
  });

  describe('groupMatchesByProvider', () => {
    it('groups matches by provider', () => {
      const matches: DspMatch[] = [
        createMockMatch({ id: '1', providerId: 'apple_music' }),
        createMockMatch({ id: '2', providerId: 'apple_music' }),
        createMockMatch({ id: '3', providerId: 'deezer' }),
        createMockMatch({ id: '4', providerId: 'spotify' }),
      ];

      const grouped = groupMatchesByProvider(matches);

      expect(grouped.get('apple_music')).toHaveLength(2);
      expect(grouped.get('deezer')).toHaveLength(1);
      expect(grouped.get('spotify')).toHaveLength(1);
    });

    it('returns empty Map for empty array', () => {
      const grouped = groupMatchesByProvider([]);
      expect(grouped.size).toBe(0);
    });

    it('preserves match order within provider groups', () => {
      const matches: DspMatch[] = [
        createMockMatch({
          id: '1',
          providerId: 'apple_music',
          confidenceScore: 0.9,
        }),
        createMockMatch({
          id: '2',
          providerId: 'apple_music',
          confidenceScore: 0.7,
        }),
      ];

      const grouped = groupMatchesByProvider(matches);
      const appleMatches = grouped.get('apple_music')!;

      expect(appleMatches[0].id).toBe('1');
      expect(appleMatches[1].id).toBe('2');
    });
  });

  describe('getBestMatchPerProvider', () => {
    it('returns highest confidence match per provider', () => {
      const matches: DspMatch[] = [
        createMockMatch({
          id: '1',
          providerId: 'apple_music',
          confidenceScore: 0.7,
        }),
        createMockMatch({
          id: '2',
          providerId: 'apple_music',
          confidenceScore: 0.95,
        }),
        createMockMatch({
          id: '3',
          providerId: 'apple_music',
          confidenceScore: 0.8,
        }),
        createMockMatch({
          id: '4',
          providerId: 'deezer',
          confidenceScore: 0.6,
        }),
      ];

      const best = getBestMatchPerProvider(matches);

      expect(best.get('apple_music')?.id).toBe('2');
      expect(best.get('apple_music')?.confidenceScore).toBe(0.95);
      expect(best.get('deezer')?.id).toBe('4');
    });

    it('returns empty Map for empty array', () => {
      const best = getBestMatchPerProvider([]);
      expect(best.size).toBe(0);
    });

    it('handles single match per provider', () => {
      const matches: DspMatch[] = [
        createMockMatch({
          id: '1',
          providerId: 'apple_music',
          confidenceScore: 0.85,
        }),
        createMockMatch({
          id: '2',
          providerId: 'deezer',
          confidenceScore: 0.75,
        }),
      ];

      const best = getBestMatchPerProvider(matches);

      expect(best.size).toBe(2);
      expect(best.get('apple_music')?.confidenceScore).toBe(0.85);
      expect(best.get('deezer')?.confidenceScore).toBe(0.75);
    });
  });

  describe('countMatchesByStatus', () => {
    it('counts matches by status', () => {
      const matches: DspMatch[] = [
        createMockMatch({ status: 'suggested' }),
        createMockMatch({ status: 'suggested' }),
        createMockMatch({ status: 'confirmed' }),
        createMockMatch({ status: 'rejected' }),
        createMockMatch({ status: 'auto_confirmed' }),
        createMockMatch({ status: 'auto_confirmed' }),
      ];

      const counts = countMatchesByStatus(matches);

      expect(counts.suggested).toBe(2);
      expect(counts.confirmed).toBe(1);
      expect(counts.rejected).toBe(1);
      expect(counts.auto_confirmed).toBe(2);
    });

    it('returns zeros for empty array', () => {
      const counts = countMatchesByStatus([]);

      expect(counts.suggested).toBe(0);
      expect(counts.confirmed).toBe(0);
      expect(counts.rejected).toBe(0);
      expect(counts.auto_confirmed).toBe(0);
    });

    it('handles all same status', () => {
      const matches: DspMatch[] = [
        createMockMatch({ status: 'suggested' }),
        createMockMatch({ status: 'suggested' }),
        createMockMatch({ status: 'suggested' }),
      ];

      const counts = countMatchesByStatus(matches);

      expect(counts.suggested).toBe(3);
      expect(counts.confirmed).toBe(0);
      expect(counts.rejected).toBe(0);
      expect(counts.auto_confirmed).toBe(0);
    });
  });
});
