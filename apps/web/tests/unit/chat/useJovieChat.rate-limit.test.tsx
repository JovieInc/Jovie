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
  }: {
    id?: string;
    transport: { body?: { conversationId?: string } };
  }) => {
    if (id && id !== currentChatId) {
      currentChatId = id;
      currentTransportConversationId = transport.body?.conversationId ?? null;
    } else if (!id && currentChatId === 'new-chat') {
      currentTransportConversationId = transport.body?.conversationId ?? null;
    }

    return {
      messages: mockMessages,
      sendMessage: (payload: unknown) =>
        sendMessageMock({
          conversationIdAtSend: currentTransportConversationId,
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

  it('persists tool-only assistant turns and clears submission state on success', async () => {
    let onSuccess:
      | ((data: { messages: unknown[]; titlePending?: boolean }) => void)
      | undefined;

    addMessagesMutateMock.mockImplementation(
      (
        _variables: unknown,
        options?: {
          onSuccess?: (data: {
            messages: unknown[];
            titlePending?: boolean;
          }) => void;
        }
      ) => {
        onSuccess = options?.onSuccess;
      }
    );

    const { result, rerender } = renderHook(() =>
      useJovieChat({ profileId: 'profile_1', conversationId: 'conv_123' })
    );

    await act(async () => {
      await result.current.submitMessage('Generate album art');
    });

    expect(result.current.isSubmitting).toBe(true);
    expect(addMessagesMutateMock).not.toHaveBeenCalled();

    mockMessages = [
      {
        id: 'assistant_1',
        role: 'assistant',
        parts: [
          {
            type: 'dynamic-tool',
            toolName: 'generateAlbumArt',
            toolCallId: 'tool_album',
            state: 'output-available',
            input: { prompt: 'Generate album art' },
            output: {
              success: true,
              state: 'generated',
              generationId: 'generation-1',
              releaseTitle: 'Neon Nights',
              releaseId: 'release-1',
              hasExistingArtwork: false,
              candidates: [
                {
                  id: 'candidate-1',
                  previewUrl: 'https://example.com/cover-1.jpg',
                  styleLabel: 'Cinematic',
                },
              ],
            },
          },
        ],
        createdAt: new Date('2026-01-01T00:00:05.000Z'),
      },
    ] as typeof mockMessages;

    rerender();

    expect(addMessagesMutateMock).toHaveBeenCalledWith(
      {
        conversationId: 'conv_123',
        messages: [
          { role: 'user', content: 'Generate album art' },
          {
            role: 'assistant',
            content: '',
            toolCalls: [
              expect.objectContaining({
                toolCallId: 'tool_album',
                toolName: 'generateAlbumArt',
                state: 'succeeded',
              }),
            ],
          },
        ],
      },
      expect.any(Object)
    );
    expect(result.current.isSubmitting).toBe(true);

    act(() => {
      onSuccess?.({ messages: [], titlePending: false });
    });

    expect(result.current.isSubmitting).toBe(false);
  });

  it('does not persist until an assistant response exists', async () => {
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
