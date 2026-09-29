import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAdminAssetsInfiniteQuery } from '@/lib/queries/admin-infinite';

const { mockFetchWithTimeout } = vi.hoisted(() => ({
  mockFetchWithTimeout: vi.fn(),
}));

vi.mock('@/lib/queries/fetch', () => ({
  fetchWithTimeout: mockFetchWithTimeout,
}));

function wrapper({ children }: { readonly children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('useAdminAssetsInfiniteQuery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches the assets endpoint with filter params', async () => {
    mockFetchWithTimeout.mockResolvedValue({
      rows: [{ id: 'a1', createdAt: '2026-08-22T00:00:00.000Z' }],
      total: 1,
    });
    const { result } = renderHook(
      () =>
        useAdminAssetsInfiniteQuery({
          sort: 'created_desc',
          search: 'bloom',
          type: 'release',
          issues: 'issues',
          verified: 'verified',
          pageSize: 20,
        }),
      { wrapper }
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const calledUrl = mockFetchWithTimeout.mock.calls[0]?.[0] as string;
    expect(calledUrl).toContain('/api/admin/assets?');
    expect(calledUrl).toContain('type=release');
    expect(calledUrl).toContain('issues=issues');
    expect(calledUrl).toContain('verified=verified');
    expect(calledUrl).toContain('q=bloom');
    expect(result.current.data?.pages[0]?.rows[0]?.createdAt).toBeInstanceOf(
      Date
    );
  });
});
