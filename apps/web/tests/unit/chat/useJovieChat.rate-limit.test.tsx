import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useJovieChat } from '@/components/jovie/hooks/useJovieChat';

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn().mockResolvedValue(undefined),
  }),
}));

const sendMessageMock = vi.fn();
const maybeExecuteMock = vi.fn();
const mutateAsyncMock = vi.fn();
const addMessagesMutateMock = vi.fn();
const setMessagesMock = vi.fn();
let onRejectHandler: (() => void) | undefined;
let onFinishHandler:
  | ((options: {
      message: { metadata?: unknown };
      messages: unknown[];
      isAbort: boolean;
      isDisconnect: boolean;
      isError: boolean;
    }) => void)
  | undefined;
let mockStatus: 'ready' | 'streaming' = 'ready';
let currentChatId = 'new-chat';
let currentTransportConversationId: string | null = null;
let mockMessages: Array<{
  id: string;
  role: string;
  parts: Array<Record<string, unknown>>;
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
    id,
    transport,
    onFinish,
  }: {
    id?: string;
    transport: { body?: { conversationId?: string } };
    onFinish?: typeof onFinishHandler;
  }) => {
    onFinishHandler = onFinish;
    if (id && id !== currentChatId) {
      currentChatId = id;
      currentTransportConversationId = transport.body?.conversationId ?? null;
    } else if (!id && currentChatId === 'new-chat') {
      currentTransportConversationId = transport.body?.conversationId ?? null;
    }

    return {
      messages: mockMessages,
      sendMessage: (payload: unknown, options?: unknown) =>
        sendMessageMock({
          conversationIdAtSend: currentTransportConversationId,
          payload,
          options,
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

vi.mock('@tanstack/react-pacer', () => ({
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
    mutate: addMessagesMutateMock,
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
    addMessagesMutateMock.mockReset();
    setMessagesMock.mockReset();
    mutateAsyncMock.mockResolvedValue({
      conversation: { id: 'conv_123' },
    });
    onRejectHandler = undefined;
    onFinishHandler = undefined;
    mockStatus = 'ready';
    currentChatId = 'new-chat';
    currentTransportConversationId = null;
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

  it('sends the first message immediately through the chat turn boundary', async () => {
    const { result } = renderHook(() =>
      useJovieChat({ profileId: 'profile_1' })
    );

    await act(async () => {
      await result.current.submitMessage('Hello Jovie');
    });

    expect(mutateAsyncMock).not.toHaveBeenCalled();
    expect(sendMessageMock).toHaveBeenCalledTimes(1);
    expect(sendMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationIdAtSend: null,
        payload: { text: 'Hello Jovie' },
        options: {
          body: expect.objectContaining({
            clientTurnId: expect.any(String),
            clientMessageId: expect.stringMatching(/:user$/),
            source: 'typed',
          }),
        },
      })
    );
  });

  it('marks album art generation prompts with a tool intent', async () => {
    const { result, rerender } = renderHook(() =>
      useJovieChat({ profileId: 'profile_1', conversationId: 'conv_123' })
    );

    await act(async () => {
      await result.current.submitMessage('Generate album art');
    });

    expect(result.current.isSubmitting).toBe(true);
    expect(addMessagesMutateMock).not.toHaveBeenCalled();

    rerender();

    expect(sendMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        options: {
          body: expect.objectContaining({
            toolIntent: 'album_art_generation',
            source: 'typed',
          }),
        },
      })
    );
    expect(result.current.isSubmitting).toBe(true);
  });

  it('uses stream metadata to adopt the server-created conversation id', async () => {
    const onConversationCreate = vi.fn();
    const { result } = renderHook(() =>
      useJovieChat({
        profileId: 'profile_1',
        onConversationCreate,
      })
    );

    await act(async () => {
      await result.current.submitMessage('Hello Jovie');
    });

    expect(result.current.isSubmitting).toBe(true);

    act(() => {
      onFinishHandler?.({
        message: {
          metadata: {
            conversationId: 'conv_server',
            turnId: 'turn_server',
            requestId: 'req_1',
          },
        },
        messages: [],
        isAbort: false,
        isDisconnect: false,
        isError: false,
      });
    });

    expect(onConversationCreate).toHaveBeenCalledWith(
      'conv_server',
      'completed'
    );
    expect(result.current.isSubmitting).toBe(false);
  });

  it('does not persist messages client-side while waiting for the server stream', async () => {
    const { result, rerender } = renderHook(() =>
      useJovieChat({ profileId: 'profile_1', conversationId: 'conv_123' })
    );

    await act(async () => {
      await result.current.submitMessage('Generate album art');
    });

    expect(addMessagesMutateMock).not.toHaveBeenCalled();

    mockMessages = [
      {
        id: 'user_1',
        role: 'user',
        parts: [{ type: 'text', text: 'Generate album art' }],
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    ];

    rerender();

    expect(addMessagesMutateMock).not.toHaveBeenCalled();
    expect(result.current.isSubmitting).toBe(true);
  });
});
