import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  AnalyticsRange,
  DashboardAnalyticsResponse,
} from '@/types/analytics';
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

function renderAnalyticsQuery() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  clients.push(client);
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
