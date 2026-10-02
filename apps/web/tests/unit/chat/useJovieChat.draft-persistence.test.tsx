import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  resetChatTimelineStateCacheForTests,
  useJovieChat,
} from '@/components/jovie/hooks/useJovieChat';
import {
  readComposerDraft,
  resetComposerDraftStoreForTests,
} from '@/lib/chat/composer-draft-store';

const { routerPush } = vi.hoisted(() => ({ routerPush: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: routerPush,
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
    resetChatTimelineStateCacheForTests();
    sendMessageMock.mockReset();
    maybeExecuteMock.mockReset();
    routerPush.mockReset();
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

  it('preserves the newest draft when leaving before the debounce fires', () => {
    const first = renderHook(() =>
      useJovieChat({ conversationId: 'thread-a' })
    );
    act(() => first.result.current.setInput('Just typed before Command-comma'));
    first.unmount();
    const restored = renderHook(() =>
      useJovieChat({ conversationId: 'thread-a' })
    );
    expect(restored.result.current.input).toBe(
      'Just typed before Command-comma'
    );
    restored.unmount();
  });

  it('preserves an input update batched with unmount', () => {
    const first = renderHook(() =>
      useJovieChat({ conversationId: 'thread-a' })
    );
    act(() => {
      first.result.current.setInput('Latest input before leaving');
      first.unmount();
    });
    expect(readComposerDraft('thread-a')).toBe('Latest input before leaving');
  });

  it('does not restore a sent draft when send and unmount share one batch', () => {
    sendMessageMock.mockResolvedValue(undefined);
    const first = renderHook(() =>
      useJovieChat({ conversationId: 'thread-a' })
    );
    act(() => first.result.current.setInput('Send me'));
    act(() => {
      void first.result.current.submitMessage('Send me');
      first.unmount();
    });
    expect(sendMessageMock).toHaveBeenCalledTimes(1);
    expect(readComposerDraft('thread-a')).toBe('');
  });

  it('does not restore a command draft when its navigation unmounts chat', () => {
    const first = renderHook(() =>
      useJovieChat({ conversationId: 'thread-a' })
    );
    act(() => first.result.current.setInput('Open settings'));
    routerPush.mockImplementation(() => first.unmount());
    act(() => {
      void first.result.current.submitMessage('Open settings');
    });
    expect(routerPush).toHaveBeenCalledTimes(1);
    expect(sendMessageMock).not.toHaveBeenCalled();
    expect(readComposerDraft('thread-a')).toBe('');
  });

  it('flushes the latest value to the active thread without overwriting its predecessor', () => {
    const first = renderHook(
      ({ conversationId }: { conversationId: string }) =>
        useJovieChat({ conversationId }),
      { initialProps: { conversationId: 'thread-a' } }
    );
    act(() => first.result.current.setInput('Draft A'));
    first.rerender({ conversationId: 'thread-b' });
    act(() => {
      first.result.current.setInput('Draft B');
      first.unmount();
    });
    expect(readComposerDraft('thread-a')).toBe('Draft A');
    expect(readComposerDraft('thread-b')).toBe('Draft B');
  });

  it('does not resurrect a sent draft when leaving before the debounce fires', async () => {
    sendMessageMock.mockResolvedValue(undefined);
    const first = renderHook(() =>
      useJovieChat({ conversationId: 'thread-a' })
    );
    act(() => first.result.current.setInput('Send me'));
    await act(async () => {
      await first.result.current.submitMessage('Send me');
    });
    first.unmount();
    const restored = renderHook(() =>
      useJovieChat({ conversationId: 'thread-a' })
    );
    expect(restored.result.current.input).toBe('');
    restored.unmount();
  });
});
