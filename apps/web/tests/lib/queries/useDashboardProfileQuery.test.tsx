import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { queryKeys } from '@/lib/queries/keys';
import {
  type DashboardProfile,
  useDashboardProfileQuery,
  useUpdateDashboardProfileMutation,
  useUpdateVenmoMutation,
} from '@/lib/queries/useDashboardProfileQuery';

// Mock fetch with proper isolation
const mockFetch = vi.fn();

// Sample profile data for tests
const mockProfile: DashboardProfile = {
  id: 'profile-123',
  username: 'testartist',
  displayName: 'Test Artist',
  bio: 'A test bio',
  avatarUrl: 'https://example.com/avatar.jpg',
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
};

describe('useDashboardProfileQuery', () => {
  let queryClient: QueryClient;

  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch);
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

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('useDashboardProfileQuery hook', () => {
    it('fetches profile data successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockProfile),
      });

      const { result } = renderHook(() => useDashboardProfileQuery(), {
        wrapper,
      });

      expect(result.current.isLoading).toBe(true);

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data).toEqual(mockProfile);
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/dashboard/profile',
        expect.any(Object)
      );
    });

    it('handles fetch error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
      });

      const { result } = renderHook(() => useDashboardProfileQuery(), {
        wrapper,
      });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error).toBeDefined();
    });

    it('uses correct query key', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockProfile),
      });

      renderHook(() => useDashboardProfileQuery(), { wrapper });

      await waitFor(() => {
        expect(
          queryClient.getQueryState(queryKeys.user.profile())
        ).toBeDefined();
      });
    });

    it('does not refetch while data is fresh (STANDARD_CACHE)', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockProfile),
      });

      const { result, rerender } = renderHook(
        () => useDashboardProfileQuery(),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      const firstCallCount = mockFetch.mock.calls.length;

      // Rerender - should use cached data without refetching
      rerender();

      // Verify no additional fetch was made (data is still fresh)
      expect(mockFetch.mock.calls.length).toBe(firstCallCount);
    });
  });

  describe('useUpdateDashboardProfileMutation hook', () => {
    it('sends PATCH request with correct payload', async () => {
      queryClient.setQueryData(queryKeys.user.profile(), mockProfile);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockProfile),
      });

      const { result } = renderHook(() => useUpdateDashboardProfileMutation(), {
        wrapper,
      });

      result.current.mutate({
        displayName: 'New Name',
        bio: 'New Bio',
        avatarUrl: 'https://new-avatar.com',
      });

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          '/api/dashboard/profile',
          expect.objectContaining({
            method: 'PATCH',
            headers: expect.objectContaining({
              'Content-Type': 'application/json',
            }),
            body: JSON.stringify({
              displayName: 'New Name',
              bio: 'New Bio',
              avatarUrl: 'https://new-avatar.com',
            }),
          })
        );
      });
    });

    it('calls invalidateQueries after mutation settles', async () => {
      queryClient.setQueryData(queryKeys.user.profile(), mockProfile);

      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

      const serverUpdatedProfile: DashboardProfile = {
        ...mockProfile,
        displayName: 'Server Value',
        updatedAt: '2024-12-01T00:00:00Z',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(serverUpdatedProfile),
      });

      const { result } = renderHook(() => useUpdateDashboardProfileMutation(), {
        wrapper,
      });

      result.current.mutate({ displayName: 'Server Value' });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      // Verify invalidateQueries was called
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: queryKeys.user.profile(),
      });
    });

    it('handles mutation error', async () => {
      queryClient.setQueryData(queryKeys.user.profile(), mockProfile);

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      const { result } = renderHook(() => useUpdateDashboardProfileMutation(), {
        wrapper,
      });

      result.current.mutate({ displayName: 'Will Fail' });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });
    });
  });

  describe('useUpdateVenmoMutation hook', () => {
    it('sends PUT request with correct payload structure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockProfile),
      });

      const { result } = renderHook(() => useUpdateVenmoMutation(), {
        wrapper,
      });

      result.current.mutate({ venmo_handle: 'myvenmo' });

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          '/api/dashboard/profile',
          expect.objectContaining({
            method: 'PUT',
            body: JSON.stringify({ updates: { venmo_handle: 'myvenmo' } }),
          })
        );
      });
    });

    it('supports setting venmo_handle to null', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockProfile),
      });

      const { result } = renderHook(() => useUpdateVenmoMutation(), {
        wrapper,
      });

      result.current.mutate({ venmo_handle: null });

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          '/api/dashboard/profile',
          expect.objectContaining({
            body: JSON.stringify({ updates: { venmo_handle: null } }),
          })
        );
      });
    });

    it('calls invalidateQueries for profile after success', async () => {
      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({ ...mockProfile, venmo_handle: 'newhandle' }),
      });

      const { result } = renderHook(() => useUpdateVenmoMutation(), {
        wrapper,
      });

      result.current.mutate({ venmo_handle: 'newhandle' });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      // Verify invalidateQueries was called
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: queryKeys.user.profile(),
      });
    });
  });
});
