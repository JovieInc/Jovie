import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useChatConversationQuery } from '@/lib/queries/useChatConversationQuery';

const mockFetch = vi.fn();
global.fetch = mockFetch;

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      gcTime: 0,
    },
  },
});

function TestWrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

const mockConversationResponse = {
  conversation: {
    id: 'conv-1',
    title: 'Test Conversation',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  messages: [
    {
      id: 'msg-1',
      role: 'user',
      content: 'Hello',
      createdAt: new Date().toISOString(),
    },
  ],
  hasMore: false,
};

describe('useChatConversationQuery', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    queryClient.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should fetch conversation when conversationId is provided', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockConversationResponse),
    });

    const { result } = renderHook(
      () => useChatConversationQuery({ conversationId: 'conv-1' }),
      { wrapper: TestWrapper }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.conversation.id).toBe('conv-1');
    expect(result.current.data?.conversation.title).toBe('Test Conversation');
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/chat/conversations/conv-1',
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
  });

  it('should not fetch when conversationId is null', () => {
    const { result } = renderHook(
      () => useChatConversationQuery({ conversationId: null }),
      { wrapper: TestWrapper }
    );

    expect(result.current.fetchStatus).toBe('idle');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('should not fetch when enabled is false', () => {
    const { result } = renderHook(
      () =>
        useChatConversationQuery({
          conversationId: 'conv-1',
          enabled: false,
        }),
      { wrapper: TestWrapper }
    );

    expect(result.current.fetchStatus).toBe('idle');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('should respect refetchInterval when provided', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockConversationResponse),
    });

    vi.useFakeTimers();

    renderHook(
      () =>
        useChatConversationQuery({
          conversationId: 'conv-1',
          refetchInterval: 2000,
        }),
      { wrapper: TestWrapper }
    );

    // Wait for initial fetch
    await vi.waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));

    // Advance timers to trigger refetch
    await vi.advanceTimersByTimeAsync(2000);
    await vi.waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(2));

    vi.useRealTimers();
  });

  it('should not refetch when refetchInterval is false', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockConversationResponse),
    });

    vi.useFakeTimers();

    const { result } = renderHook(
      () =>
        useChatConversationQuery({
          conversationId: 'conv-1',
          refetchInterval: false,
        }),
      { wrapper: TestWrapper }
    );

    await vi.waitFor(() => expect(result.current.isSuccess).toBe(true));

    // Should only have the initial fetch
    const initialCallCount = mockFetch.mock.calls.length;

    // Advance time - no additional fetches expected
    await vi.advanceTimersByTimeAsync(5000);
    expect(mockFetch).toHaveBeenCalledTimes(initialCallCount);

    vi.useRealTimers();
  });
});
