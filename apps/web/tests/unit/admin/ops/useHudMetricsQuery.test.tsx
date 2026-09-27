import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useHudMetricsQuery } from '@/app/app/(shell)/admin/ops/useHudMetricsQuery';
import {
  classifiedQueryRetry,
  QUERY_RETRY_MAX_ATTEMPTS,
} from '@/lib/queries/retry-policy';
import type { HudMetrics } from '@/types/hud';

const mockFetch = vi.fn();

function fixture(overrides: Partial<HudMetrics> = {}): HudMetrics {
  return {
    accessMode: 'admin',
    branding: {},
    overview: {},
    operations: {},
    reliability: {},
    testing: {},
    deployments: {},
    aiOps: {},
    agentRuns: [],
    sources: {},
    // Stale initial data forces the mount refetch under test.
    generatedAtIso: new Date(Date.now() - 60_000).toISOString(),
    ...overrides,
  } as HudMetrics;
}

function jsonResponse(data: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  });
}

function createClient(
  retryDelay: number | ((a: number, e: Error) => number) = 0
) {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: classifiedQueryRetry,
        retryDelay,
        gcTime: 0,
      },
    },
  });
}

describe('useHudMetricsQuery (JOV-6185)', () => {
  let queryClient: QueryClient;
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch);
    mockFetch.mockReset();
    queryClient = createClient();
  });

  afterEach(() => {
    queryClient.clear();
    vi.unstubAllGlobals();
  });

  it('serves initial data and scopes the key without the kiosk token', async () => {
    mockFetch.mockResolvedValue(jsonResponse(fixture()));

    const { result } = renderHook(
      () => useHudMetricsQuery(fixture(), 'secret-kiosk-token'),
      { wrapper }
    );

    // Usable initial data renders immediately.
    expect(result.current.data?.generatedAtIso).toBeDefined();

    const query = queryClient.getQueryCache().findAll()[0];
    expect(query.queryKey).toEqual(['hud', 'metrics', 'kiosk']);
    expect(JSON.stringify(query.queryKey)).not.toContain('secret-kiosk-token');

    // Token is sent on the request, not on the key.
    await waitFor(() => expect(mockFetch).toHaveBeenCalled());
    const [url] = mockFetch.mock.calls[0] as [string];
    expect(url).toContain('kiosk=secret-kiosk-token');
  });

  it('does not retry 401 responses (exactly one network attempt)', async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({ error: 'Unauthorized' }, { status: 401 })
    );

    const { result } = renderHook(() => useHudMetricsQuery(fixture(), null), {
      wrapper,
    });

    // Last valid content is preserved; the stale/error signal is truthful.
    await waitFor(() => expect(result.current.isRefetchError).toBe(true));
    expect(result.current.data).toBeDefined();
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('does not retry schema-invalid payloads (decode failure)', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ nope: true }));

    const { result } = renderHook(() => useHudMetricsQuery(fixture(), null), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isRefetchError).toBe(true));
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('retries transient server failures a bounded number of times', async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({ error: 'boom' }, { status: 500 })
    );

    const { result } = renderHook(() => useHudMetricsQuery(fixture(), null), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isRefetchError).toBe(true), {
      timeout: 5000,
    });
    // One retry owner (Query): initial + QUERY_RETRY_MAX_ATTEMPTS.
    expect(mockFetch).toHaveBeenCalledTimes(1 + QUERY_RETRY_MAX_ATTEMPTS);
  });

  it('stops retrying once the observer unmounts during backoff', async () => {
    queryClient = createClient(() => 60_000);
    mockFetch.mockRejectedValue(new TypeError('network down'));

    const { result, unmount } = renderHook(
      () => useHudMetricsQuery(fixture(), null),
      { wrapper }
    );

    await waitFor(() => expect(result.current.failureCount).toBe(1));
    unmount();

    await new Promise(resolve => setTimeout(resolve, 50));
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
