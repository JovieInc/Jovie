import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { dedupedFetchWithMeta } from '@/lib/fetch/deduped-fetch';
import { useDedupedFetch } from '@/lib/fetch/use-deduped-fetch';

vi.mock('@/lib/fetch/deduped-fetch', async () => {
  const actual = await vi.importActual<
    typeof import('@/lib/fetch/deduped-fetch')
  >('@/lib/fetch/deduped-fetch');

  return {
    ...actual,
    dedupedFetchWithMeta: vi.fn(),
  };
});

const dedupedFetchWithMetaMock = vi.mocked(dedupedFetchWithMeta);

describe('useDedupedFetch', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('does not refetch on rerender when options identity changes', async () => {
    dedupedFetchWithMetaMock.mockResolvedValue({
      data: { ok: true },
      fetchedAt: 123,
      fromCache: false,
    });

    const { rerender } = renderHook(
      ({ options }: { options: { ttlMs: number } }) =>
        useDedupedFetch('/api/status', options),
      {
        initialProps: { options: { ttlMs: 5000 } },
      }
    );

    await waitFor(() => {
      expect(dedupedFetchWithMetaMock).toHaveBeenCalledTimes(1);
    });

    rerender({ options: { ttlMs: 5000 } });

    await waitFor(() => {
      expect(dedupedFetchWithMetaMock).toHaveBeenCalledTimes(1);
    });
  });
});
