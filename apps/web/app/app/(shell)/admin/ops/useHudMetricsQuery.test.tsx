import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultQueryRetryPolicy } from '@/lib/queries/retry-policy';
import type { HudMetrics } from '@/types/hud';
import { useHudMetricsQuery } from './useHudMetricsQuery';

const mockFetch = vi.fn();
global.fetch = mockFetch;

function makeHudMetrics(): HudMetrics {
  return {
    accessMode: 'kiosk',
    branding: {},
    overview: {},
    operations: {},
    reliability: {},
    testing: {},
    deployments: {},
    aiOps: {},
    sources: {},
    agentRuns: [],
    generatedAtIso: new Date().toISOString(),
  } as unknown as HudMetrics;
}

function jsonResponse(body: unknown, status = 200, headers?: HeadersInit) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: `status ${status}`,
    headers: new Headers(headers),
    json: () => Promise.resolve(body),
    clone() {
      return jsonResponse(body, status, headers);
    },
  } as unknown as Response;
}

describe('useHudMetricsQuery (JOV-6185)', () => {
  let queryClient: QueryClient;

  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          // Real classified policy, but zero the delay so retries resolve
          // immediately and exact network-attempt counts are assertable.
          retry: defaultQueryRetryPolicy.retry,
          retryDelay: 0,
          gcTime: 0,
        },
      },
    });
  });

  it('serves usable initial data without an immediate network fetch', () => {
    const { result } = renderHook(
      () => useHudMetricsQuery(makeHudMetrics(), null),
      { wrapper }
    );

    expect(result.current.isSuccess).toBe(true);
    expect(result.current.data).toBeDefined();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('scopes the query key by access mode without exposing the kiosk token', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(makeHudMetrics()));

    const { result } = renderHook(
      () => useHudMetricsQuery(makeHudMetrics(), 'secret-kiosk-token'),
      { wrapper }
    );

    await result.current.refetch();

    const query = queryClient.getQueryCache().findAll()[0];
    expect(query.queryKey).toEqual(['hud', 'metrics', 'kiosk']);
    expect(JSON.stringify(query.queryKey)).not.toContain('secret-kiosk-token');

    const requestUrl = String(mockFetch.mock.calls[0][0]);
    expect(requestUrl).toContain('kiosk=secret-kiosk-token');
  });

  it('does not retry a 403 auth failure (exactly one network attempt)', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ error: 'Forbidden' }, 403));

    const { result } = renderHook(
      () => useHudMetricsQuery(makeHudMetrics(), null),
      { wrapper }
    );

    const refreshed = await result.current.refetch();
    expect(refreshed.isError).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    // Failed background refresh keeps the last valid data available.
    expect(refreshed.data).toBeDefined();
  });

  it('does not retry an invalid payload (schema failure stops)', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ error: 'oops' }, 200));

    const { result } = renderHook(
      () => useHudMetricsQuery(makeHudMetrics(), null),
      { wrapper }
    );

    const refreshed = await result.current.refetch();
    expect(refreshed.isError).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('bounds a transient 5xx to the classified attempt count', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ error: 'down' }, 500));

    const { result } = renderHook(
      () => useHudMetricsQuery(makeHudMetrics(), null),
      { wrapper }
    );

    const refreshed = await result.current.refetch();
    expect(refreshed.isError).toBe(true);
    // 1 initial attempt + QUERY_RETRY_MAX_RETRIES classified retries.
    expect(mockFetch).toHaveBeenCalledTimes(3);
    // Last valid content is preserved behind the error signal.
    expect(refreshed.data).toBeDefined();
  });

  it('uses the admin scope when no kiosk token is present', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(makeHudMetrics()));

    const { result } = renderHook(
      () => useHudMetricsQuery(makeHudMetrics(), null),
      { wrapper }
    );

    await result.current.refetch();

    const query = queryClient.getQueryCache().findAll()[0];
    expect(query.queryKey).toEqual(['hud', 'metrics', 'admin']);
    const requestUrl = String(mockFetch.mock.calls[0][0]);
    expect(requestUrl).not.toContain('kiosk=');
  });
});
