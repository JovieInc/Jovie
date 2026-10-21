import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CHAT_CONVERSATION_FETCH_TIMEOUT_MS,
  useChatConversationQuery,
} from '@/lib/queries';

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
      '/api/chat/conversations/conv-1?limit=40',
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
  });

  it('uses a cold-route-safe timeout budget for conversation loads', () => {
    expect(CHAT_CONVERSATION_FETCH_TIMEOUT_MS).toBeGreaterThanOrEqual(30_000);
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

  it('treats missing Summer history as a valid empty first-use session', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ error: 'No Summer history was found yet.' }),
        {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        }
      )
    );

    const { result } = renderHook(
      () =>
        useChatConversationQuery({
          conversationId: null,
          chatMode: 'ov',
        }),
      { wrapper: TestWrapper }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toMatchObject({
      chatMode: 'ov',
      conversation: { title: 'Summer' },
      messages: [],
      hasMore: false,
    });
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

it('loads older pages through before while keeping chronological history', async () => {
  queryClient.clear();
  mockFetch.mockReset();
  const message = (id: string, createdAt: string) => ({
    ...mockConversationResponse.messages[0],
    id,
    createdAt,
  });
  const newer = message('newer', '2026-07-23T00:01:00.000Z');
  const older = message('older', '2026-07-23T00:00:00.000Z');
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({
      ...mockConversationResponse,
      messages: [newer],
      hasMore: true,
    }),
  });
  const { result } = renderHook(
    () => useChatConversationQuery({ conversationId: 'paged' }),
    { wrapper: TestWrapper }
  );
  await waitFor(() => expect(result.current.hasOlderMessages).toBe(true));
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({
      ...mockConversationResponse,
      messages: [older],
      hasMore: false,
    }),
  });
  await act(async () => {
    await result.current.loadOlderMessages();
  });
  expect(mockFetch).toHaveBeenLastCalledWith(
    '/api/chat/conversations/paged?limit=40&before=2026-07-23T00%3A01%3A00.000Z',
    expect.objectContaining({ signal: expect.any(AbortSignal) })
  );
  await waitFor(() =>
    expect(result.current.data?.messages.map(row => row.id)).toEqual([
      'older',
      'newer',
    ])
  );
  expect(result.current.hasOlderMessages).toBe(false);
});

it('preserves loaded history after a page failure and allows retry', async () => {
  queryClient.clear();
  mockFetch.mockReset();
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({ ...mockConversationResponse, hasMore: true }),
  });
  const { result } = renderHook(
    () => useChatConversationQuery({ conversationId: 'retry' }),
    { wrapper: TestWrapper }
  );
  await waitFor(() => expect(result.current.hasOlderMessages).toBe(true));
  mockFetch.mockResolvedValueOnce(
    new Response(JSON.stringify({ error: 'Temporarily unavailable' }), {
      status: 503,
    })
  );
  await act(async () => {
    await result.current.loadOlderMessages();
  });
  await waitFor(() => expect(result.current.isFetchNextPageError).toBe(true));
  expect(result.current.data?.messages).toEqual(
    mockConversationResponse.messages
  );
  expect(result.current.hasOlderMessages).toBe(true);
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({
      ...mockConversationResponse,
      messages: [],
      hasMore: false,
    }),
  });
  await act(async () => {
    await result.current.loadOlderMessages();
  });
  await waitFor(() => expect(result.current.hasOlderMessages).toBe(false));
  expect(result.current.data?.messages).toEqual(
    mockConversationResponse.messages
  );
});

it('does not offer the previous conversation cursor while a new conversation loads', async () => {
  queryClient.clear();
  mockFetch.mockReset();
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({ ...mockConversationResponse, hasMore: true }),
  });
  const { result, rerender } = renderHook(
    ({ id }) => useChatConversationQuery({ conversationId: id }),
    { initialProps: { id: 'first' }, wrapper: TestWrapper }
  );
  await waitFor(() => expect(result.current.hasOlderMessages).toBe(true));
  mockFetch.mockImplementationOnce(
    (_url, init) =>
      new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () =>
          reject(new DOMException('Aborted', 'AbortError'))
        );
      })
  );
  rerender({ id: 'second' });
  await waitFor(() => expect(result.current.isPlaceholderData).toBe(true));
  expect(result.current.hasOlderMessages).toBe(false);
});
