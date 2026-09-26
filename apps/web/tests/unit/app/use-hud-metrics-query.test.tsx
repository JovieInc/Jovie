import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useHudMetricsQuery } from '@/app/app/(shell)/admin/ops/useHudMetricsQuery';
import { FetchDecodeError, FetchError } from '@/lib/queries/fetch';
import { queryKeys } from '@/lib/queries/keys';
import {
  CLASSIFIED_QUERY_RETRY,
  QUERY_MAX_RETRIES,
} from '@/lib/queries/retry-policy';
import type { HudMetrics } from '@/types/hud';

const mockFetch = vi.fn();

function makeHudMetrics(overrides: Partial<HudMetrics> = {}): HudMetrics {
  const source = {
    label: 'Source',
    state: 'ok' as const,
    fetchedAtIso: '2026-09-25T00:00:00.000Z',
    errorMessage: null,
    dashboardUrl: null,
    configureUrl: null,
    nextStep: null,
  };
  return {
    accessMode: 'admin',
    branding: { startupName: 'Jovie', logoUrl: null },
    overview: {
      mrrUsd: 1,
      activeSubscribers: 2,
      balanceUsd: 3,
      burnRateUsd: 4,
      runwayMonths: 12,
      defaultStatus: 'alive',
      defaultStatusDetail: 'ok',
      financialDataAvailable: true,
    },
    operations: {
      status: 'ok',
      dbLatencyMs: 5,
      checkedAtIso: '2026-09-25T00:00:00.000Z',
    },
    reliability: {
      errorRatePercent: 0,
      reliabilityScorePercent: 100,
      p95LatencyMs: null,
      incidents24h: 0,
      lastIncidentAtIso: null,
      unresolvedSentryIssues24h: 0,
    },
    testing: {
      quarantine: {
        isValid: true,
      } as HudMetrics['testing']['quarantine'],
    },
    deployments: { availability: 'not_configured', current: null, recent: [] },
    aiOps: { availability: 'available' } as HudMetrics['aiOps'],
    agentRuns: [],
    sources: {
      stripe: { ...source, key: 'stripe' as const },
      mercury: { ...source, key: 'mercury' as const },
      database: { ...source, key: 'database' as const },
      sentry: { ...source, key: 'sentry' as const },
      github: { ...source, key: 'github' as const },
    },
    generatedAtIso: '2026-09-25T00:00:00.000Z',
    ...overrides,
  };
}

function jsonResponse(data: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  });
}

// Stale initial data forces an immediate background refetch on mount.
const STALE_INITIAL_ISO = '1970-01-01T00:00:00.000Z';

describe('useHudMetricsQuery (JOV-6185)', () => {
  let queryClient: QueryClient;

  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch);
    mockFetch.mockReset();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          ...CLASSIFIED_QUERY_RETRY,
          retryDelay: () => 0,
          gcTime: 0,
        },
      },
    });
  });

  afterEach(() => {
    queryClient.clear();
    vi.unstubAllGlobals();
  });

  it('uses the canonical transport and a nonsecret scoped query key', async () => {
    const initial = makeHudMetrics({ generatedAtIso: STALE_INITIAL_ISO });
    const fresh = makeHudMetrics({
      accessMode: 'kiosk',
      generatedAtIso: '2026-09-25T01:00:00.000Z',
    });
    mockFetch.mockResolvedValueOnce(jsonResponse(fresh));

    const { result } = renderHook(
      () => useHudMetricsQuery(initial, 'secret-kiosk-token'),
      { wrapper }
    );

    await waitFor(() =>
      expect(result.current.data?.generatedAtIso).toBe(
        '2026-09-25T01:00:00.000Z'
      )
    );

    const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/api/hud/metrics');
    expect(url).toContain('kiosk=secret-kiosk-token');

    // Scoped under the kiosk access mode; the raw token never enters a key.
    expect(
      queryClient.getQueryData(queryKeys.hud.metrics('kiosk'))
    ).toBeDefined();
    const keys = queryClient
      .getQueryCache()
      .getAll()
      .map(query => JSON.stringify(query.queryKey));
    expect(keys.every(key => !key.includes('secret-kiosk-token'))).toBe(true);
  });

  it('preserves the polling cadence and background/focus protections', async () => {
    const initial = makeHudMetrics();
    mockFetch.mockResolvedValue(jsonResponse(initial));

    renderHook(() => useHudMetricsQuery(initial, null), { wrapper });

    const query = await waitFor(() => {
      const found = queryClient
        .getQueryCache()
        .find({ queryKey: queryKeys.hud.metrics('admin') });
      expect(found).toBeDefined();
      return found;
    });

    // Observer-level options are merged into query.options at fetch time but
    // are not part of the public QueryOptions type surface.
    const options = query?.options as Record<string, unknown>;
    expect(options.refetchInterval).toBe(30_000);
    expect(options.refetchIntervalInBackground).toBe(false);
    expect(options.refetchOnWindowFocus).toBe(false);
    expect(options.staleTime).toBe(30_000);
    expect(options.gcTime).toBe(60_000);
  });

  it('does not retry 401 responses and preserves last valid content', async () => {
    const initial = makeHudMetrics({ generatedAtIso: STALE_INITIAL_ISO });
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      })
    );

    const { result } = renderHook(() => useHudMetricsQuery(initial, null), {
      wrapper,
    });

    await waitFor(() =>
      expect(result.current.failureReason).toBeInstanceOf(FetchError)
    );
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect((result.current.failureReason as FetchError).status).toBe(401);
    // Background refresh failure keeps the last valid payload visible.
    expect(result.current.data?.generatedAtIso).toBe(STALE_INITIAL_ISO);
  });

  it('bounds transient 5xx retries to the shared policy attempt count', async () => {
    const initial = makeHudMetrics({ generatedAtIso: STALE_INITIAL_ISO });
    mockFetch.mockResolvedValue(
      new Response('{}', { status: 503, statusText: 'Service Unavailable' })
    );

    const { result } = renderHook(() => useHudMetricsQuery(initial, null), {
      wrapper,
    });

    await waitFor(() =>
      expect(result.current.failureReason).toBeInstanceOf(FetchError)
    );
    // Exact network-attempt count: 1 initial + QUERY_MAX_RETRIES retries.
    expect(mockFetch).toHaveBeenCalledTimes(QUERY_MAX_RETRIES + 1);
    expect(result.current.data?.generatedAtIso).toBe(STALE_INITIAL_ISO);
  });

  it('recovers after a transient failure and serves the refreshed payload', async () => {
    const initial = makeHudMetrics({ generatedAtIso: STALE_INITIAL_ISO });
    const fresh = makeHudMetrics({
      generatedAtIso: '2026-09-25T01:00:00.000Z',
    });
    mockFetch
      .mockResolvedValueOnce(new Response('{}', { status: 500 }))
      .mockResolvedValueOnce(jsonResponse(fresh));

    const { result } = renderHook(() => useHudMetricsQuery(initial, null), {
      wrapper,
    });

    await waitFor(() =>
      expect(result.current.data?.generatedAtIso).toBe(
        '2026-09-25T01:00:00.000Z'
      )
    );
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('rejects an invalid payload as a decode failure without retrying', async () => {
    const initial = makeHudMetrics({ generatedAtIso: STALE_INITIAL_ISO });
    mockFetch.mockResolvedValue(jsonResponse({ unexpected: true }));

    const { result } = renderHook(() => useHudMetricsQuery(initial, null), {
      wrapper,
    });

    await waitFor(() =>
      expect(result.current.failureReason).toBeInstanceOf(FetchDecodeError)
    );
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(result.current.data?.generatedAtIso).toBe(STALE_INITIAL_ISO);
  });

  it('stops retrying when the query is cancelled during an in-flight request', async () => {
    const initial = makeHudMetrics({ generatedAtIso: STALE_INITIAL_ISO });
    mockFetch.mockImplementation(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            'abort',
            () =>
              reject(
                Object.assign(new Error('aborted'), { name: 'AbortError' })
              ),
            { once: true }
          );
        })
    );

    const { unmount } = renderHook(() => useHudMetricsQuery(initial, null), {
      wrapper,
    });
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));

    unmount();
    // Cancellation settles the in-flight fetch as a non-retryable failure;
    // give the retryer a window to prove no second attempt is scheduled.
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
