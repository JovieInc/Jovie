import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useSilentYouTubeLink } from '@/lib/queries/useSilentYouTubeLink';

function wrapper(client: QueryClient) {
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  }
  return Wrapper;
}

describe('useSilentYouTubeLink', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('POSTs once per profile and refreshes links only when linked', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ status: 'linked' }),
    }));
    vi.stubGlobal('fetch', fetchMock);
    const client = new QueryClient();
    const spy = vi.spyOn(client, 'invalidateQueries');
    const { rerender } = renderHook(
      () => useSilentYouTubeLink('profile-once'),
      {
        wrapper: wrapper(client),
      }
    );
    rerender();
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/dashboard/youtube-verification?profileId=profile-once',
      { method: 'POST' }
    );
  });

  it('does nothing visible when there is no match', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ status: 'no_match' }),
    }));
    vi.stubGlobal('fetch', fetchMock);
    const client = new QueryClient();
    const spy = vi.spyOn(client, 'invalidateQueries');
    renderHook(() => useSilentYouTubeLink('profile-none'), {
      wrapper: wrapper(client),
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(spy).not.toHaveBeenCalled();
  });
});
