import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useTrackingMutation } from '@/lib/queries/useTrackingMutation';

const { mockPostJsonBeacon } = vi.hoisted(() => ({
  mockPostJsonBeacon: vi.fn(),
}));

vi.mock('@/lib/tracking/json-beacon', () => ({
  postJsonBeacon: mockPostJsonBeacon,
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return function Wrapper({ children }: Readonly<{ children: ReactNode }>) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

describe('useTrackingMutation', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('uses the beacon helper for POST tracking requests', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(null, { status: 204 }));
    mockPostJsonBeacon.mockReturnValue(true);

    const { result } = renderHook(
      () => useTrackingMutation({ endpoint: '/api/track' }),
      { wrapper: createWrapper() }
    );

    await act(async () => {
      await result.current.mutateAsync({ handle: 'dualipa', linkType: 'tip' });
    });

    expect(mockPostJsonBeacon).toHaveBeenCalledWith('/api/track', {
      handle: 'dualipa',
      linkType: 'tip',
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('still uses fetch for non-POST tracking requests', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(null, { status: 204 }));

    const { result } = renderHook(
      () =>
        useTrackingMutation({
          endpoint: '/api/track',
          method: 'PATCH',
        }),
      { wrapper: createWrapper() }
    );

    await act(async () => {
      await result.current.mutateAsync({ handle: 'dualipa' });
    });

    expect(mockPostJsonBeacon).not.toHaveBeenCalled();
    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/track',
      expect.objectContaining({
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ handle: 'dualipa' }),
        keepalive: true,
      })
    );
  });
});
