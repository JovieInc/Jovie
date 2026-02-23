import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useJovieChat } from '@/components/jovie/hooks/useJovieChat';

const sendMessageMock = vi.fn();
const maybeExecuteMock = vi.fn();
const mutateAsyncMock = vi.fn();
const setMessagesMock = vi.fn();
let onRejectHandler: (() => void) | undefined;
let mockStatus: 'ready' | 'streaming' = 'ready';
let mockMessages: Array<{
  id: string;
  role: string;
  parts: Array<{ type: 'text'; text: string }>;
  createdAt: Date;
}> = [];
let mockConversationData:
  | {
      conversation?: { title: string | null };
      messages?: Array<{
        id: string;
        role: string;
        content: string;
        createdAt: string;
      }>;
    }
  | undefined;

vi.mock('@ai-sdk/react', () => ({
  useChat: ({
    transport,
  }: {
    transport: { body?: { conversationId?: string } };
  }) => {
    const currentConversationId = transport.body?.conversationId;
    return {
      messages: mockMessages,
      sendMessage: (payload: unknown) =>
        sendMessageMock({
          conversationIdAtSend: currentConversationId ?? null,
          payload,
        }),
      status: mockStatus,
      setMessages: setMessagesMock,
    };
  },
}));

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    invalidateQueries: vi.fn(),
  }),
}));

vi.mock('@/lib/pacer', () => ({
  useAsyncRateLimiter: (_fn: unknown, options: { onReject?: () => void }) => {
    onRejectHandler = options.onReject;
    return {
      maybeExecute: maybeExecuteMock,
      getRemainingInWindow: () => 1,
      state: { isExecuting: false },
    };
  },
}));

vi.mock('@/lib/queries/useChatConversationQuery', () => ({
  useChatConversationQuery: () => ({
    data: mockConversationData,
    isLoading: false,
  }),
}));

vi.mock('@/lib/queries/useChatMutations', () => ({
  useAddMessagesMutation: () => ({
    mutate: vi.fn(),
  }),
  useCreateConversationMutation: () => ({
    mutateAsync: mutateAsyncMock,
  }),
}));

describe('useJovieChat', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    sendMessageMock.mockReset();
    maybeExecuteMock.mockReset();
    mutateAsyncMock.mockReset();
    setMessagesMock.mockReset();
    mutateAsyncMock.mockResolvedValue({
      conversation: { id: 'conv_123' },
    });
    onRejectHandler = undefined;
    mockStatus = 'ready';
    mockMessages = [];
    mockConversationData = undefined;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('routes submissions through async rate limiter and surfaces rate-limit feedback', () => {
    const { result } = renderHook(() =>
      useJovieChat({ profileId: 'profile_1' })
    );

    act(() => {
      result.current.setInput('Hello Jovie');
    });

    act(() => {
      result.current.handleSubmit();
    });

    expect(maybeExecuteMock).toHaveBeenCalledWith({
      text: 'Hello Jovie',
      files: undefined,
    });

    act(() => {
      result.current.setInput('');
    });

    act(() => {
      onRejectHandler?.();
    });

    expect(result.current.isRateLimited).toBe(true);
    expect(result.current.chatError?.type).toBe('rate_limit');
    expect(result.current.chatError?.message).toContain('too quickly');

    act(() => {
      vi.runAllTimers();
    });

    expect(result.current.isRateLimited).toBe(false);
  });

  it('does not overwrite in-flight first message with loaded conversation sync while streaming', () => {
    mockConversationData = {
      messages: [
        {
          id: 'db_1',
          role: 'user',
          content: 'Persisted message',
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    };
    mockStatus = 'streaming';
    mockMessages = [
      {
        id: 'local_1',
        role: 'user',
        parts: [{ type: 'text', text: 'Hello Jovie' }],
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    ];

    renderHook(() =>
      useJovieChat({ profileId: 'profile_1', conversationId: 'conv_123' })
    );

    expect(setMessagesMock).not.toHaveBeenCalled();
  });

  it('queues first message until conversation id is active before sending', async () => {
    const { result } = renderHook(() =>
      useJovieChat({ profileId: 'profile_1' })
    );

    await act(async () => {
      await result.current.submitMessage('Hello Jovie');
    });

    expect(mutateAsyncMock).toHaveBeenCalledWith({
      initialMessage: 'Hello Jovie',
    });
    expect(sendMessageMock).toHaveBeenCalledTimes(1);
    expect(sendMessageMock).toHaveBeenCalledWith({
      conversationIdAtSend: 'conv_123',
      payload: { text: 'Hello Jovie' },
    });
  });
});
