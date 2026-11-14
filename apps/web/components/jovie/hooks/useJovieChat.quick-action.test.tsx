import { act, renderHook } from '@testing-library/react';
import type { UIMessage } from 'ai';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetComposerDraftStoreForTests } from '@/lib/chat/composer-draft-store';
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
  useAsyncRateLimiter: (fn: (args: unknown) => Promise<void>) => ({
    maybeExecute: (args: unknown) => fn(args),
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

describe('quick actions keep the composer', () => {
  beforeEach(() => {
    resetChatTimelineStateCacheForTests();
    resetComposerDraftStoreForTests();
    resetCacheIsolationForTests();
    applyCacheScope({ userId: 'founder', sessionId: 'session-a', ready: true });
    h.send.mockReset().mockResolvedValue(undefined);
  });

  it('sends a tapped next move without dropping typed text or staged chips', async () => {
    applyCacheScope({ profileId: 'profile-a' });
    const view = renderHook(() => useJovieChat({ profileId: 'profile-a' }));
    await act(async () => {});
    act(() => {
      view.result.current.setInput('Half-written thought');
      view.result.current.chipTray.addEntity({
        kind: 'release',
        id: 'rel-1',
        label: 'Midnight Drive',
      });
    });

    await act(async () => {
      view.result.current.handleSuggestedPrompt('Tighten my bio.');
    });

    expect(h.send).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(h.send.mock.calls[0])).toContain('Tighten my bio.');
    expect(view.result.current.input).toBe('Half-written thought');
    expect(view.result.current.chipTray.chips).toEqual([
      expect.objectContaining({ kind: 'release', id: 'rel-1' }),
    ]);
  });
});
