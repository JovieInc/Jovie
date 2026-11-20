import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  AnalyticsRange,
  DashboardAnalyticsResponse,
} from '@/types/analytics';
import { queryKeys } from './keys';
import { useDashboardAnalyticsQuery } from './useDashboardAnalyticsQuery';

const mocks = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock('./fetch', async importOriginal => ({
  ...(await importOriginal<typeof import('./fetch')>()),
  fetchWithTimeout: mocks.fetch,
}));

const clients: QueryClient[] = [];
afterEach(() => {
  cleanup();
  for (const client of clients.splice(0)) client.clear();
  mocks.fetch.mockReset();
});

function analytics(profileViews: number): DashboardAnalyticsResponse {
  return {
    profile_views: profileViews,
    top_cities: [],
    top_countries: [],
    top_referrers: [],
  };
}

function deferred() {
  return Promise.withResolvers<DashboardAnalyticsResponse>();
}

function createClient() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  clients.push(client);
  return client;
}

function renderAnalyticsQuery(client = createClient()) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return renderHook(
    ({ range }: { range: AnalyticsRange }) => {
      const {
        data,
        error,
        isPending,
        isFetching,
        isError,
        isSuccess,
        refetch,
      } = useDashboardAnalyticsQuery({ range, view: 'full' });
      return {
        data,
        error,
        isPending,
        isFetching,
        isError,
        isSuccess,
        refetch,
      };
    },
    { wrapper, initialProps: { range: '30d' as AnalyticsRange } }
  );
}

describe('dashboard analytics window identity', () => {
  it('ignores a canceled response after repeatedly selecting the same window', async () => {
    const canceledWindow = deferred();
    const currentWindow = deferred();
    mocks.fetch
      .mockResolvedValueOnce(analytics(300))
      .mockReturnValueOnce(canceledWindow.promise)
      .mockReturnValueOnce(currentWindow.promise);
    const client = createClient();
    const hook = renderAnalyticsQuery(client);
    await waitFor(() =>
      expect(hook.result.current.data?.profile_views).toBe(300)
    );

    hook.rerender({ range: '7d' });
    const canceledSignal = mocks.fetch.mock.calls[1][1].signal;
    expect(hook.result.current.data).toBeUndefined();
    hook.rerender({ range: '30d' });
    expect(canceledSignal.aborted).toBe(true);
    expect(hook.result.current.data?.profile_views).toBe(300);
    hook.rerender({ range: '7d' });
    expect(mocks.fetch).toHaveBeenCalledTimes(3);
    expect(mocks.fetch.mock.calls[2][0]).toBe(
      '/api/dashboard/analytics?range=7d&view=full'
    );

    // The synthetic transport deliberately completes even after cancellation.
    await act(async () => canceledWindow.resolve(analytics(700)));
    expect(
      client.getQueryData(queryKeys.dashboard.analytics('7d'))
    ).toBeUndefined();
    expect(hook.result.current.data).toBeUndefined();
    expect(hook.result.current.isPending).toBe(true);
    await act(async () => currentWindow.resolve(analytics(70)));
    await waitFor(() =>
      expect(hook.result.current.data?.profile_views).toBe(70)
    );
    expect(hook.result.current.isSuccess).toBe(true);
  });

  it('isolates a still-active old-window response and reuses each window across navigation', async () => {
    const oldWindowRefresh = deferred();
    const selectedWindow = deferred();
    mocks.fetch
      .mockResolvedValueOnce(analytics(300))
      .mockReturnValueOnce(oldWindowRefresh.promise)
      .mockReturnValueOnce(selectedWindow.promise);
    const client = createClient();
    const selected = renderAnalyticsQuery(client);
    await waitFor(() =>
      expect(selected.result.current.data?.profile_views).toBe(300)
    );
    const oldWindow = renderAnalyticsQuery(client);
    let refreshResult:
      | ReturnType<typeof oldWindow.result.current.refetch>
      | undefined;
    act(() => {
      refreshResult = oldWindow.result.current.refetch();
    });
    await waitFor(() => expect(oldWindow.result.current.isFetching).toBe(true));
    selected.rerender({ range: '7d' });
    expect(mocks.fetch.mock.calls[1][1].signal.aborted).toBe(false);
    expect(selected.result.current.data).toBeUndefined();

    await act(async () => {
      oldWindowRefresh.resolve(analytics(310));
      await refreshResult;
    });
    await waitFor(() =>
      expect(oldWindow.result.current.data?.profile_views).toBe(310)
    );
    expect(selected.result.current.data).toBeUndefined();
    expect(selected.result.current.isPending).toBe(true);
    await act(async () => selectedWindow.resolve(analytics(70)));
    await waitFor(() =>
      expect(selected.result.current.data?.profile_views).toBe(70)
    );

    selected.unmount();
    oldWindow.unmount();
    const remounted = renderAnalyticsQuery(client);
    for (const range of ['7d', '30d', '7d', '30d'] as const) {
      remounted.rerender({ range });
      expect(remounted.result.current.data?.profile_views).toBe(
        range === '7d' ? 70 : 310
      );
      expect(remounted.result.current.isSuccess).toBe(true);
      expect(remounted.result.current.isFetching).toBe(false);
    }
    expect(mocks.fetch).toHaveBeenCalledTimes(3);
  });

  it('waits for the selected window while preserving same-window cache and refresh data', async () => {
    const nextWindow = deferred();
    const refresh = deferred();
    mocks.fetch
      .mockResolvedValueOnce(analytics(300))
      .mockReturnValueOnce(nextWindow.promise)
      .mockReturnValueOnce(refresh.promise);
    const hook = renderAnalyticsQuery();
    await waitFor(() =>
      expect(hook.result.current.data?.profile_views).toBe(300)
    );

    hook.rerender({ range: '7d' });
    expect(mocks.fetch.mock.calls[1][0]).toBe(
      '/api/dashboard/analytics?range=7d&view=full'
    );
    expect(mocks.fetch.mock.calls[1][1].signal).toBeInstanceOf(AbortSignal);
    expect(hook.result.current.data).toBeUndefined();
    expect(hook.result.current.isPending).toBe(true);

    await act(async () => nextWindow.resolve(analytics(70)));
    await waitFor(() =>
      expect(hook.result.current.data?.profile_views).toBe(70)
    );
    expect(hook.result.current.isSuccess).toBe(true);

    hook.rerender({ range: '30d' });
    expect(hook.result.current.data?.profile_views).toBe(300);
    expect(hook.result.current.isPending).toBe(false);
    expect(mocks.fetch).toHaveBeenCalledTimes(2);

    let refreshResult:
      | ReturnType<typeof hook.result.current.refetch>
      | undefined;
    act(() => {
      refreshResult = hook.result.current.refetch();
    });
    await waitFor(() => expect(hook.result.current.isFetching).toBe(true));
    expect(hook.result.current.data?.profile_views).toBe(300);
    expect(hook.result.current.isPending).toBe(false);
    await act(async () => {
      refresh.resolve(analytics(310));
      await refreshResult;
    });
    await waitFor(() =>
      expect(hook.result.current.data?.profile_views).toBe(310)
    );
  });

  it('keeps a failed new window unavailable instead of borrowing the previous measurements', async () => {
    const nextWindow = deferred();
    mocks.fetch
      .mockResolvedValueOnce(analytics(300))
      .mockReturnValueOnce(nextWindow.promise);
    const hook = renderAnalyticsQuery();
    await waitFor(() =>
      expect(hook.result.current.data?.profile_views).toBe(300)
    );

    hook.rerender({ range: '7d' });
    expect(hook.result.current.data).toBeUndefined();
    expect(hook.result.current.isSuccess).toBe(false);
    const error = new Error('Analytics unavailable');
    await act(async () => nextWindow.reject(error));
    await waitFor(() => expect(hook.result.current.isError).toBe(true));
    expect(hook.result.current.error).toBe(error);
    expect(hook.result.current.data).toBeUndefined();

    hook.rerender({ range: '30d' });
    expect(hook.result.current.data?.profile_views).toBe(300);
    expect(hook.result.current.isSuccess).toBe(true);
  });
});
