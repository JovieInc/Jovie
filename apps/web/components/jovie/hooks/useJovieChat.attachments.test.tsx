import { act, renderHook } from '@testing-library/react';
import type { UIMessage } from 'ai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetComposerDraftStoreForTests } from '@/lib/chat/composer-draft-store';
import { PENDING_CHAT_PROMPT_KEY } from '@/lib/chat/open-chat-with-prompt';
import {
  applyCacheScope,
  resetCacheIsolationForTests,
} from '@/lib/queries/cache-isolation';
import {
  resetChatTimelineStateCacheForTests,
  useJovieChat,
} from './useJovieChat';

const h = vi.hoisted(() => ({
  send: vi.fn(),
  stop: vi.fn(),
  onError: undefined as undefined | ((error: Error) => void),
  onData: undefined as
    | undefined
    | ((part: { type: string; data: unknown }) => void),
  onFinish: undefined as
    | undefined
    | ((event: {
        message: UIMessage;
        isAbort?: boolean;
        isError?: boolean;
      }) => void),
  fetch: undefined as undefined | typeof globalThis.fetch,
}));
vi.mock('ai', async importOriginal => ({
  ...(await importOriginal<typeof import('ai')>()),
  DefaultChatTransport: vi.fn().mockImplementation(function (options: {
    fetch: typeof globalThis.fetch;
  }) {
    h.fetch = options.fetch;
    return {};
  }),
}));
vi.mock('@ai-sdk/react', () => ({
  useChat: (options: {
    onError: typeof h.onError;
    onFinish: typeof h.onFinish;
    onData: typeof h.onData;
  }) => {
    h.onError = options.onError;
    h.onFinish = options.onFinish;
    h.onData = options.onData;
    return { messages: [], sendMessage: h.send, stop: h.stop, status: 'ready' };
  },
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));
vi.mock('@tanstack/react-pacer', () => ({
  useAsyncRateLimiter: () => ({
    maybeExecute: vi.fn(),
    getRemainingInWindow: () => 1,
    state: { isExecuting: false },
  }),
}));
vi.mock('@/lib/queries', () => ({
  queryKeys: {
    chat: {
      usage: () => ['usage'],
      conversations: () => ['conversations'],
      conversation: (id: string) => [id],
    },
  },
  useChatConversationQuery: () => ({
    data: undefined,
    isLoading: false,
    isError: false,
    error: null,
  }),
}));

describe('chat attachment recovery', () => {
  beforeEach(() => {
    resetChatTimelineStateCacheForTests();
    resetComposerDraftStoreForTests();
    resetCacheIsolationForTests();
    applyCacheScope({ userId: 'founder', sessionId: 'session-a', ready: true });
    sessionStorage.removeItem(PENDING_CHAT_PROMPT_KEY);
    h.send.mockReset().mockResolvedValue(undefined);
    h.stop.mockReset();
  });
  afterEach(() => vi.unstubAllGlobals());

  it.each(['', 'Review the attached document'])(
    'retries a creator attachment with its original text (%s)',
    async text => {
      const files = [
        {
          type: 'file' as const,
          mediaType: 'application/pdf',
          url: 'https://files.example.test/notes.pdf',
        },
      ];
      const { result } = renderHook(() =>
        useJovieChat({ profileId: 'creator-profile' })
      );
      await act(async () => {
        await result.current.submitMessage(text, files);
      });
      act(() => h.onError?.(new TypeError('Failed to fetch')));
      expect(result.current.chatError?.failedFiles).toEqual(files);
      await act(async () => result.current.handleRetry());
      expect(h.send).toHaveBeenCalledTimes(2);
      expect(h.send.mock.calls[1][0]).toEqual({ text, files });
    }
  );

  it('keeps attachment ownership when the server reserves the current new conversation', async () => {
    const { result, rerender } = renderHook<
      ReturnType<typeof useJovieChat>,
      { conversationId: string | undefined }
    >(
      ({ conversationId }) =>
        useJovieChat({ profileId: 'creator-profile', conversationId }),
      { initialProps: { conversationId: undefined } }
    );
    const initialKey = result.current.conversationResetKey;
    await act(async () => result.current.submitMessage('Start a conversation'));
    act(() =>
      h.onFinish?.({
        message: {
          id: 'reply',
          role: 'assistant',
          parts: [{ type: 'text', text: 'Ready' }],
          metadata: { conversationId: 'reserved-thread' },
        },
      })
    );
    expect(result.current.activeConversationId).toBe('reserved-thread');
    expect(result.current.conversationResetKey).toBe(initialKey);
    rerender({ conversationId: 'reserved-thread' });
    expect(result.current.conversationResetKey).toBe(initialKey);
    rerender({ conversationId: 'different-thread' });
    expect(result.current.conversationResetKey).not.toBe(initialKey);
  });
});
