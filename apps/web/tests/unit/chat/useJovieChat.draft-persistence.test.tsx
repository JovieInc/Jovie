import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useJovieChat } from '@/components/jovie/hooks/useJovieChat';
import { resetComposerDraftStoreForTests } from '@/lib/chat/composer-draft-store';

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

vi.mock('@ai-sdk/react', () => ({
  useChat: () => ({
    messages: [],
    sendMessage: sendMessageMock,
    status: 'ready',
    setMessages: vi.fn(),
    stop: vi.fn(),
  }),
}));

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    invalidateQueries: vi.fn(),
  }),
}));

vi.mock('@tanstack/react-pacer', () => ({
  useAsyncRateLimiter: (
    fn: (args: { text: string }) => Promise<void>,
    _options: { onReject?: () => void }
  ) => ({
    maybeExecute: (args: { text: string }) => {
      maybeExecuteMock(args);
      return fn(args);
    },
    getRemainingInWindow: () => 1,
    state: { isExecuting: false },
  }),
}));

vi.mock('@/lib/queries', () => ({
  queryKeys: {
    chat: {
      usage: () => ['chat', 'usage'],
      conversations: () => ['chat', 'conversations'],
    },
  },
  useChatConversationQuery: () => ({
    data: undefined,
    isLoading: false,
    isError: false,
    error: null,
  }),
}));

vi.mock('@/lib/chat/open-chat-with-prompt', () => ({
  consumePendingChatPrompt: () => null,
}));

describe('useJovieChat draft persistence', () => {
  beforeEach(() => {
    resetComposerDraftStoreForTests();
    sendMessageMock.mockReset();
    maybeExecuteMock.mockReset();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('restores per-thread drafts when switching conversations', () => {
    const { result, rerender } = renderHook(
      ({ conversationId }: { conversationId: string | null }) =>
        useJovieChat({ conversationId }),
      { initialProps: { conversationId: 'thread-a' as string | null } }
    );

    act(() => {
      result.current.setInput('Draft for thread A');
    });

    rerender({ conversationId: 'thread-b' });
    act(() => {
      result.current.setInput('Draft for thread B');
    });

    rerender({ conversationId: 'thread-a' });
    expect(result.current.input).toBe('Draft for thread A');

    rerender({ conversationId: 'thread-b' });
    expect(result.current.input).toBe('Draft for thread B');
  });

  it('clears the active thread draft after a successful send', async () => {
    sendMessageMock.mockResolvedValue(undefined);

    const { result } = renderHook(() =>
      useJovieChat({ conversationId: 'thread-a' })
    );

    act(() => {
      result.current.setInput('Send me');
    });

    await act(async () => {
      await result.current.submitMessage('Send me');
    });

    expect(result.current.input).toBe('');
    expect(sendMessageMock).toHaveBeenCalledTimes(1);
  });
});
