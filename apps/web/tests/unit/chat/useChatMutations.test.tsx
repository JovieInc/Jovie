import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  useAddMessagesMutation,
  useCreateConversationMutation,
  useDeleteConversationMutation,
  useUpdateConversationMutation,
} from '@/lib/queries/useChatMutations';

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

describe('useCreateConversationMutation', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    queryClient.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should create a conversation and invalidate conversations query', async () => {
    const conversation = {
      id: 'conv-new',
      title: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ conversation }),
    });

    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useCreateConversationMutation(), {
      wrapper: TestWrapper,
    });

    await act(async () => {
      await result.current.mutateAsync({ initialMessage: 'Hello' });
    });

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/chat/conversations',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ initialMessage: 'Hello' }),
      })
    );

    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: expect.arrayContaining(['chat', 'conversations']),
      })
    );
  });
});

describe('useAddMessagesMutation', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    queryClient.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should add messages and return titlePending flag', async () => {
    const response = {
      messages: [
        {
          id: 'msg-1',
          role: 'user',
          content: 'Test',
          createdAt: new Date().toISOString(),
        },
      ],
      titlePending: true,
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(response),
    });

    const { result } = renderHook(() => useAddMessagesMutation(), {
      wrapper: TestWrapper,
    });

    let data: typeof response | undefined;
    await act(async () => {
      data = await result.current.mutateAsync({
        conversationId: 'conv-1',
        messages: [{ role: 'user', content: 'Test' }],
      });
    });

    expect(data?.titlePending).toBe(true);
    expect(data?.messages).toHaveLength(1);
  });

  it('should return titlePending=false when title already exists', async () => {
    const response = {
      messages: [
        {
          id: 'msg-2',
          role: 'assistant',
          content: 'Response',
          createdAt: new Date().toISOString(),
        },
      ],
      titlePending: false,
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(response),
    });

    const { result } = renderHook(() => useAddMessagesMutation(), {
      wrapper: TestWrapper,
    });

    let data: typeof response | undefined;
    await act(async () => {
      data = await result.current.mutateAsync({
        conversationId: 'conv-1',
        messages: [{ role: 'assistant', content: 'Response' }],
      });
    });

    expect(data?.titlePending).toBe(false);
  });

  it('should invalidate both conversation and conversations queries on success', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          messages: [],
          titlePending: false,
        }),
    });

    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useAddMessagesMutation(), {
      wrapper: TestWrapper,
    });

    await act(async () => {
      await result.current.mutateAsync({
        conversationId: 'conv-1',
        messages: [{ role: 'user', content: 'Test' }],
      });
    });

    // Should invalidate specific conversation
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: expect.arrayContaining(['chat', 'conversation', 'conv-1']),
      })
    );

    // Should invalidate conversations list
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: expect.arrayContaining(['chat', 'conversations']),
      })
    );
  });
});

describe('useUpdateConversationMutation', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    queryClient.clear();
  });

  it('should update conversation title', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          conversation: {
            id: 'conv-1',
            title: 'New Title',
            updatedAt: new Date().toISOString(),
          },
        }),
    });

    const { result } = renderHook(() => useUpdateConversationMutation(), {
      wrapper: TestWrapper,
    });

    await act(async () => {
      await result.current.mutateAsync({
        conversationId: 'conv-1',
        title: 'New Title',
      });
    });

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/chat/conversations/conv-1',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ title: 'New Title' }),
      })
    );
  });
});

describe('useDeleteConversationMutation', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    queryClient.clear();
  });

  it('should delete conversation and invalidate conversations query', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ success: true }),
    });

    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useDeleteConversationMutation(), {
      wrapper: TestWrapper,
    });

    await act(async () => {
      await result.current.mutateAsync({ conversationId: 'conv-1' });
    });

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/chat/conversations/conv-1',
      expect.objectContaining({ method: 'DELETE' })
    );

    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: expect.arrayContaining(['chat', 'conversations']),
      })
    );
  });
});
