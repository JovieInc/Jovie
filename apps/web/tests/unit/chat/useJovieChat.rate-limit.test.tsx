import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useJovieChat } from '@/components/jovie/hooks/useJovieChat';

const sendMessageMock = vi.fn();
const maybeExecuteMock = vi.fn();
const mutateAsyncMock = vi.fn();
let onRejectHandler: (() => void) | undefined;

vi.mock('@ai-sdk/react', () => ({
  useChat: ({
    transport,
  }: {
    transport: { body?: { conversationId?: string } };
  }) => {
    const currentConversationId = transport.body?.conversationId;
    return {
      messages: [],
      sendMessage: (payload: unknown) =>
        sendMessageMock({
          conversationIdAtSend: currentConversationId ?? null,
          payload,
        }),
      status: 'ready',
      setMessages: vi.fn(),
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
    data: undefined,
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
    mutateAsyncMock.mockResolvedValue({
      conversation: { id: 'conv_123' },
    });
    onRejectHandler = undefined;
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
