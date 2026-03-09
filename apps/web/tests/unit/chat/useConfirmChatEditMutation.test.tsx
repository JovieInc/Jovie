import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useConfirmChatEditMutation } from '@/lib/queries/useConfirmChatEditMutation';

const mockFetch = vi.fn();
global.fetch = mockFetch;

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false, gcTime: 0 },
    mutations: { retry: false },
  },
});

function TestWrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe('useConfirmChatEditMutation', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    queryClient.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends POST to /api/chat/confirm-edit with correct body', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ success: true }),
    });

    const { result } = renderHook(() => useConfirmChatEditMutation(), {
      wrapper: TestWrapper,
    });

    await act(async () => {
      await result.current.mutateAsync({
        profileId: 'profile-123',
        field: 'displayName',
        newValue: 'New Artist Name',
      });
    });

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/chat/confirm-edit',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          profileId: 'profile-123',
          field: 'displayName',
          newValue: 'New Artist Name',
        }),
      })
    );
  });

  it('invalidates user.profile query key on success', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ success: true }),
    });

    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useConfirmChatEditMutation(), {
      wrapper: TestWrapper,
    });

    await act(async () => {
      await result.current.mutateAsync({
        profileId: 'profile-123',
        field: 'bio',
        newValue: 'Updated bio',
      });
    });

    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: expect.arrayContaining(['user', 'profile']),
      })
    );
  });

  it('invalidates chat.conversations query key on success', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ success: true }),
    });

    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useConfirmChatEditMutation(), {
      wrapper: TestWrapper,
    });

    await act(async () => {
      await result.current.mutateAsync({
        profileId: 'profile-123',
        field: 'displayName',
        newValue: 'Name',
      });
    });

    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: expect.arrayContaining(['chat', 'conversations']),
      })
    );
  });

  it('includes optional conversationId and messageId in the request', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ success: true }),
    });

    const { result } = renderHook(() => useConfirmChatEditMutation(), {
      wrapper: TestWrapper,
    });

    await act(async () => {
      await result.current.mutateAsync({
        profileId: 'profile-123',
        field: 'bio',
        newValue: 'New bio',
        conversationId: 'conv-456',
        messageId: 'msg-789',
      });
    });

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/chat/confirm-edit',
      expect.objectContaining({
        body: JSON.stringify({
          profileId: 'profile-123',
          field: 'bio',
          newValue: 'New bio',
          conversationId: 'conv-456',
          messageId: 'msg-789',
        }),
      })
    );
  });

  it('calls error handler on failure', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ error: 'Failed to apply edit' }),
    });

    const { result } = renderHook(() => useConfirmChatEditMutation(), {
      wrapper: TestWrapper,
    });

    await expect(
      act(async () => {
        await result.current.mutateAsync({
          profileId: 'profile-123',
          field: 'displayName',
          newValue: 'Name',
        });
      })
    ).rejects.toThrow();
  });
});
