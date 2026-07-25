import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FetchError } from '@/lib/queries/fetch';
import { useRemoveSocialLinkMutation } from '@/lib/queries/useRemoveSocialLinkMutation';

vi.mock('@/lib/queries/mutation-utils', () => ({
  handleMutationError: vi.fn(),
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  return function Wrapper({ children }: { readonly children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

describe('useRemoveSocialLinkMutation', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('preserves the authoritative conflict version for retry reconciliation', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json(
        {
          error: 'Conflict: Link has been modified by another request',
          code: 'VERSION_CONFLICT',
          currentVersion: 4,
          expectedVersion: 3,
        },
        { status: 409 }
      )
    );
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useRemoveSocialLinkMutation(), {
      wrapper: createWrapper(),
    });

    let caught: unknown;
    try {
      await result.current.mutateAsync({
        profileId: 'profile-1',
        linkId: 'link-1',
        expectedVersion: 3,
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(FetchError);
    expect(caught).toMatchObject({
      status: 409,
      parsedBody: { currentVersion: 4, expectedVersion: 3 },
    });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/dashboard/social-links',
      expect.objectContaining({
        method: 'DELETE',
        body: JSON.stringify({
          profileId: 'profile-1',
          linkId: 'link-1',
          action: 'dismiss',
          expectedVersion: 3,
        }),
      })
    );
  });
});
