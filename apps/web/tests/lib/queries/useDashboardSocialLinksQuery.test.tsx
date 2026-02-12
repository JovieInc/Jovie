import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { queryKeys } from '@/lib/queries/keys';
import {
  type DashboardSocialLink,
  type SaveSocialLinksInput,
  useDashboardSocialLinksQuery,
  useSaveSocialLinksMutation,
} from '@/lib/queries/useDashboardSocialLinksQuery';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock sonner toast
vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

// Mock Sentry
vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
  addBreadcrumb: vi.fn(),
}));

// Mock analytics
vi.mock('@/lib/analytics', () => ({
  track: vi.fn(),
}));

import { toast } from 'sonner';
import { track } from '@/lib/analytics';

// Sample social link data for tests
const mockSocialLinks: DashboardSocialLink[] = [
  { id: 'link-1', platform: 'spotify', url: 'https://spotify.com/artist/123' },
  {
    id: 'link-2',
    platform: 'instagram',
    url: 'https://instagram.com/testartist',
  },
  { id: 'link-3', platform: 'twitter', url: 'https://twitter.com/testartist' },
];

describe('useDashboardSocialLinksQuery', () => {
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
        mutations: {
          retry: false,
        },
      },
    });
  });

  describe('useDashboardSocialLinksQuery hook', () => {
    it('fetches social links successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ links: mockSocialLinks }),
      });

      const { result } = renderHook(
        () => useDashboardSocialLinksQuery('profile-123'),
        { wrapper }
      );

      expect(result.current.isLoading).toBe(true);

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data).toHaveLength(3);
      expect(result.current.data?.[0].platform).toBe('spotify');
    });

    it('includes profileId in URL', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ links: [] }),
      });

      renderHook(() => useDashboardSocialLinksQuery('profile-123'), {
        wrapper,
      });

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('profileId=profile-123'),
          expect.any(Object)
        );
      });
    });

    it('uses no-store cache option', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ links: [] }),
      });

      renderHook(() => useDashboardSocialLinksQuery('profile-123'), {
        wrapper,
      });

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({
            cache: 'no-store',
          })
        );
      });
    });

    it('uses correct query key', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ links: [] }),
      });

      renderHook(() => useDashboardSocialLinksQuery('profile-123'), {
        wrapper,
      });

      await waitFor(() => {
        expect(
          queryClient.getQueryState(
            queryKeys.dashboard.socialLinks('profile-123')
          )
        ).toBeDefined();
      });
    });

    it('is disabled when profileId is empty', async () => {
      const { result } = renderHook(() => useDashboardSocialLinksQuery(''), {
        wrapper,
      });

      expect(mockFetch).not.toHaveBeenCalled();
      expect(result.current.fetchStatus).toBe('idle');
    });

    it('handles empty links array', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ links: [] }),
      });

      const { result } = renderHook(
        () => useDashboardSocialLinksQuery('profile-123'),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data).toEqual([]);
    });

    it('handles missing links in response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({}),
      });

      const { result } = renderHook(
        () => useDashboardSocialLinksQuery('profile-123'),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data).toEqual([]);
    });

    it('handles fetch error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      const { result } = renderHook(
        () => useDashboardSocialLinksQuery('profile-123'),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });
    });
  });

  describe('useSaveSocialLinksMutation hook', () => {
    it('sends PUT request with correct payload', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, version: 2 }),
      });

      const { result } = renderHook(
        () => useSaveSocialLinksMutation('profile-123'),
        { wrapper }
      );

      const input: SaveSocialLinksInput = {
        profileId: 'profile-123',
        links: [
          {
            platform: 'spotify',
            platformType: 'music',
            url: 'https://spotify.com/artist/123',
            sortOrder: 0,
            isActive: true,
          },
          {
            platform: 'instagram',
            platformType: 'social',
            url: 'https://instagram.com/artist',
            sortOrder: 1,
            isActive: true,
          },
        ],
      };

      result.current.mutate(input);

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          '/api/dashboard/social-links',
          expect.objectContaining({
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(input),
          })
        );
      });
    });

    it('does not show success toast on success', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });

      const { result } = renderHook(
        () => useSaveSocialLinksMutation('profile-123'),
        { wrapper }
      );

      result.current.mutate({
        profileId: 'profile-123',
        links: [],
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(toast.success).not.toHaveBeenCalled();
    });

    it('tracks analytics event on success', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });

      const { result } = renderHook(
        () => useSaveSocialLinksMutation('profile-123'),
        { wrapper }
      );

      result.current.mutate({
        profileId: 'profile-123',
        links: [],
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(track).toHaveBeenCalledWith('dashboard_social_links_saved', {
        profileId: 'profile-123',
      });
    });

    it('invalidates social links and suggestions queries on success', async () => {
      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });

      const { result } = renderHook(
        () => useSaveSocialLinksMutation('profile-123'),
        { wrapper }
      );

      result.current.mutate({
        profileId: 'profile-123',
        links: [],
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      // Should invalidate both social links and suggestions
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: queryKeys.dashboard.socialLinks('profile-123'),
      });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: queryKeys.suggestions.list('profile-123'),
      });
    });

    it('shows error toast on failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      const { result } = renderHook(
        () => useSaveSocialLinksMutation('profile-123'),
        { wrapper }
      );

      result.current.mutate({
        profileId: 'profile-123',
        links: [],
      });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(toast.error).toHaveBeenCalledWith(
        'Something went wrong. Please try again.'
      );
    });

    it('includes expectedVersion for optimistic locking', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, version: 3 }),
      });

      const { result } = renderHook(
        () => useSaveSocialLinksMutation('profile-123'),
        { wrapper }
      );

      result.current.mutate({
        profileId: 'profile-123',
        links: [],
        expectedVersion: 2,
      });

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({
            body: expect.stringContaining('"expectedVersion":2'),
          })
        );
      });
    });

    it('returns version in response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, version: 5 }),
      });

      const { result } = renderHook(
        () => useSaveSocialLinksMutation('profile-123'),
        { wrapper }
      );

      result.current.mutate({
        profileId: 'profile-123',
        links: [],
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data?.version).toBe(5);
    });

    it('uses correct mutation key', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });

      const { result } = renderHook(
        () => useSaveSocialLinksMutation('profile-123'),
        { wrapper }
      );

      result.current.mutate({
        profileId: 'profile-123',
        links: [],
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      // Mutation key should include profileId
      const mutationState = queryClient.getMutationCache().getAll()[0];
      expect(mutationState?.options.mutationKey).toEqual([
        'dashboard',
        'social-links',
        'save',
        'profile-123',
      ]);
    });
  });
});
