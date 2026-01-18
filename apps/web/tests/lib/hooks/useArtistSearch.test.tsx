import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useArtistSearchQuery } from '@/lib/queries';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Single QueryClient instance shared across all tests (cleared between tests)
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      gcTime: 0,
    },
  },
});

function TestWrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe('useArtistSearchQuery', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    queryClient.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should start with idle state', () => {
    const { result } = renderHook(() => useArtistSearchQuery(), {
      wrapper: TestWrapper,
    });

    expect(result.current.state).toBe('idle');
    expect(result.current.results).toEqual([]);
    expect(result.current.error).toBeNull();
    expect(result.current.query).toBe('');
  });

  it('should not search for queries shorter than minQueryLength', () => {
    const { result } = renderHook(
      () => useArtistSearchQuery({ minQueryLength: 2 }),
      { wrapper: TestWrapper }
    );

    act(() => {
      result.current.search('a');
    });

    expect(result.current.state).toBe('idle');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('should update query immediately on search', async () => {
    let resolveFetch: ((value: unknown) => void) | undefined;
    const fetchPromise = new Promise(resolve => {
      resolveFetch = resolve;
    });
    mockFetch.mockReturnValue(fetchPromise);

    const { result } = renderHook(() => useArtistSearchQuery(), {
      wrapper: TestWrapper,
    });

    act(() => {
      result.current.search('my query');
    });

    expect(result.current.query).toBe('my query');
    // State transitions to loading when isPending is set (happens async)
    await waitFor(() => {
      expect(result.current.state).toBe('loading');
    });

    resolveFetch?.({
      ok: true,
      json: () => Promise.resolve([]),
    });
  });

  it('should return results on successful searchImmediate', async () => {
    const mockResults = [
      {
        id: '1',
        name: 'Artist One',
        url: 'https://open.spotify.com/artist/1',
        popularity: 80,
        followers: 1000,
      },
      {
        id: '2',
        name: 'Artist Two',
        url: 'https://open.spotify.com/artist/2',
        popularity: 60,
      },
    ];
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockResults),
    });

    const { result } = renderHook(() => useArtistSearchQuery(), {
      wrapper: TestWrapper,
    });

    act(() => {
      result.current.searchImmediate('artist');
    });

    await waitFor(() => {
      expect(result.current.state).toBe('success');
    });

    expect(result.current.results).toHaveLength(2);
    expect(result.current.results[0].name).toBe('Artist One');
  });

  it('should set empty state when no results found', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve([]),
    });

    const { result } = renderHook(() => useArtistSearchQuery(), {
      wrapper: TestWrapper,
    });

    act(() => {
      result.current.searchImmediate('nonexistent');
    });

    await waitFor(() => {
      expect(result.current.state).toBe('empty');
    });

    expect(result.current.results).toEqual([]);
  });

  it('should set error state on fetch failure', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: () =>
        Promise.resolve({ error: 'Search failed', code: 'SEARCH_FAILED' }),
    });

    const { result } = renderHook(() => useArtistSearchQuery(), {
      wrapper: TestWrapper,
    });

    act(() => {
      result.current.searchImmediate('test');
    });

    await waitFor(() => {
      expect(result.current.state).toBe('error');
    });

    expect(result.current.error).toBe('Search failed');
  });

  it('should handle rate limit error', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: () =>
        Promise.resolve({ error: 'Too many requests', code: 'RATE_LIMITED' }),
    });

    const { result } = renderHook(() => useArtistSearchQuery(), {
      wrapper: TestWrapper,
    });

    act(() => {
      result.current.searchImmediate('test');
    });

    await waitFor(() => {
      expect(result.current.state).toBe('error');
    });

    expect(result.current.error).toContain('Too many requests');
  });

  it('should clear results and reset state', async () => {
    const mockResults = [
      {
        id: '1',
        name: 'Artist',
        url: 'https://open.spotify.com/artist/1',
        popularity: 80,
      },
    ];
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockResults),
    });

    const { result } = renderHook(() => useArtistSearchQuery(), {
      wrapper: TestWrapper,
    });

    act(() => {
      result.current.searchImmediate('test');
    });

    await waitFor(() => {
      expect(result.current.results).toHaveLength(1);
    });

    act(() => {
      result.current.clear();
    });

    expect(result.current.results).toEqual([]);
    expect(result.current.state).toBe('idle');
    expect(result.current.query).toBe('');
  });

  it('should respect limit option in URL', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve([]),
    });

    const { result } = renderHook(() => useArtistSearchQuery({ limit: 10 }), {
      wrapper: TestWrapper,
    });

    act(() => {
      result.current.searchImmediate('test');
    });

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalled();
    });

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('limit=10'),
      expect.any(Object)
    );
  });
});
