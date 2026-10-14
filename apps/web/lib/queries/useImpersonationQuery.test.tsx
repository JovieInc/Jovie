import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applyCacheScope,
  getCacheGeneration,
  getCacheScope,
  resetCacheIsolationForTests,
} from './cache-isolation';
import { queryKeys } from './keys';
import {
  type ImpersonationState,
  useEndImpersonationMutation,
  useStartImpersonationMutation,
} from './useImpersonationQuery';

const { mockHandleMutationError, mockToastDismiss, mockToastLoading } =
  vi.hoisted(() => ({
    mockHandleMutationError: vi.fn(),
    mockToastDismiss: vi.fn(),
    mockToastLoading: vi.fn(),
  }));

vi.mock('@/components/feedback', () => ({
  toast: {
    dismiss: mockToastDismiss,
    loading: mockToastLoading,
  },
}));

vi.mock('./mutation-utils', () => ({
  handleMutationError: mockHandleMutationError,
}));

const targetUserId = '11111111-1111-4111-8111-111111111111';

function createWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { readonly children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

describe('impersonation mutations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetCacheIsolationForTests();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('posts the validated target and scopes client state to the effective user', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          effectiveUserId: targetUserId,
          expiresInMinutes: 15,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );
    vi.stubGlobal('fetch', fetchMock);
    const queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false } },
    });
    applyCacheScope({
      userId: 'admin',
      sessionId: 'session',
      ready: true,
    });
    const { result } = renderHook(() => useStartImpersonationMutation(), {
      wrapper: createWrapper(queryClient),
    });

    await act(() => result.current.mutateAsync({ targetUserId }));

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/admin/impersonate',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ targetUserId }),
      })
    );
    expect(getCacheScope().impersonationSubject).toBe(targetUserId);
    expect(getCacheGeneration()).toBe(1);
    expect(
      queryClient.getQueryData<ImpersonationState>(
        queryKeys.admin.impersonation()
      )
    ).toMatchObject({ isImpersonating: true, effectiveUserId: targetUserId });
  });

  it('surfaces a start authorization failure through existing feedback', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: 'Admin privileges required' }), {
          status: 403,
          headers: { 'Content-Type': 'application/json' },
        })
      )
    );
    const queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false } },
    });
    const { result } = renderHook(() => useStartImpersonationMutation(), {
      wrapper: createWrapper(queryClient),
    });

    act(() => result.current.mutate({ targetUserId }));

    await waitFor(() =>
      expect(mockHandleMutationError).toHaveBeenCalledWith(
        expect.any(Error),
        'Failed to start impersonation'
      )
    );
  });

  it('clears the effective-user cache scope when impersonation ends', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )
    );
    const queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false } },
    });
    queryClient.setQueryData<ImpersonationState>(
      queryKeys.admin.impersonation(),
      {
        enabled: true,
        isImpersonating: true,
        effectiveUserId: targetUserId,
      }
    );
    applyCacheScope({
      userId: 'admin',
      sessionId: 'session',
      impersonationSubject: targetUserId,
      ready: true,
    });
    const { result } = renderHook(() => useEndImpersonationMutation(), {
      wrapper: createWrapper(queryClient),
    });

    await act(() => result.current.mutateAsync());

    expect(getCacheScope().impersonationSubject).toBeNull();
    expect(
      queryClient.getQueryData<ImpersonationState>(
        queryKeys.admin.impersonation()
      )
    ).toMatchObject({ isImpersonating: false });
  });
});
