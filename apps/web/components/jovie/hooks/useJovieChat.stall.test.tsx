import { act, renderHook } from '@testing-library/react';
import type { UIMessage } from 'ai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CHAT_STREAM_STALLED_USER_MESSAGE } from '@/lib/ai/gateway-errors';
import { resetComposerDraftStoreForTests } from '@/lib/chat/composer-draft-store';
import { PENDING_CHAT_PROMPT_KEY } from '@/lib/chat/open-chat-with-prompt';
import {
  applyCacheScope,
  resetCacheIsolationForTests,
} from '@/lib/queries/cache-isolation';
import {
  CHAT_CLIENT_STALL_TIMEOUT_MS,
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
    return {
      messages: [],
      sendMessage: h.send,
      stop: h.stop,
      status: 'ready',
    };
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

function mount() {
  return renderHook(() => useJovieChat({ chatMode: 'ov' }));
}

describe('chat stream stall watchdog', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetChatTimelineStateCacheForTests();
    resetComposerDraftStoreForTests();
    resetCacheIsolationForTests();
    applyCacheScope({ userId: 'founder', sessionId: 'session-a', ready: true });
    sessionStorage.removeItem(PENDING_CHAT_PROMPT_KEY);
    h.send.mockReset().mockResolvedValue(undefined);
    h.stop.mockReset();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('replaces endless typing dots with an honest retry error when nothing streams', async () => {
    const { result } = mount();
    await act(async () => {
      await result.current.submitMessage(
        'What should I do this week to get more listeners?'
      );
    });
    expect(result.current.isSubmitting).toBe(true);
    expect(result.current.chatError).toBeNull();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(CHAT_CLIENT_STALL_TIMEOUT_MS + 1);
    });

    expect(h.stop).toHaveBeenCalledTimes(1);
    expect(result.current.chatError?.message).toBe(
      CHAT_STREAM_STALLED_USER_MESSAGE
    );
    expect(result.current.input).toBe(
      'What should I do this week to get more listeners?'
    );
  });

  it('does not fire before the bound', async () => {
    const { result } = mount();
    await act(async () => {
      await result.current.submitMessage('Check triage');
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(CHAT_CLIENT_STALL_TIMEOUT_MS - 1_000);
    });
    expect(h.stop).not.toHaveBeenCalled();
    expect(result.current.chatError).toBeNull();
  });
});
