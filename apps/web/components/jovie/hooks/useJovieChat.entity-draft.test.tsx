import { act, renderHook } from '@testing-library/react';
import type { UIMessage } from 'ai';
import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  readComposerDraft,
  resetComposerDraftStoreForTests,
  saveComposerDraft,
} from '@/lib/chat/composer-draft-store';
import {
  openChatWithDraft,
  PENDING_CHAT_PROMPT_KEY,
} from '@/lib/chat/open-chat-with-prompt';
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

function mount() {
  return renderHook(() => useJovieChat({ chatMode: 'ov' }));
}

describe('Entity draft handoff and ownership', () => {
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

  it('appends pending entity context to the existing draft once without sending', async () => {
    applyCacheScope({ profileId: 'profile-a' });
    saveComposerDraft(null, 'My unfinished question');
    const context = 'Help with link link-123 in profile-a: https://example.com';
    expect(openChatWithDraft(context, { push: vi.fn() })).toBe(true);
    const first = renderHook(() => useJovieChat({ profileId: 'profile-a' }), {
      wrapper: StrictMode,
    });
    await act(async () => {});
    expect(first.result.current.input).toBe(
      `My unfinished question\n\n${context}`
    );
    expect(h.send).not.toHaveBeenCalled();
    expect(first.result.current.messages).toEqual([]);
    first.rerender();
    await act(async () => {});
    expect(first.result.current.input).toBe(
      `My unfinished question\n\n${context}`
    );
    expect(h.send).not.toHaveBeenCalled();
  });

  it('turns a leading profile token into a composer chip, not text', async () => {
    applyCacheScope({ profileId: 'profile-a' });
    expect(
      openChatWithDraft('@profile:profile-a[Tim White]', { push: vi.fn() })
    ).toBe(true);
    const view = renderHook(() => useJovieChat({ profileId: 'profile-a' }));
    await act(async () => {});
    expect(view.result.current.input).toBe('');
    expect(view.result.current.chipTray.chips).toEqual([
      expect.objectContaining({
        type: 'entity',
        kind: 'profile',
        id: 'profile-a',
        label: 'Tim White',
      }),
    ]);
    expect(h.send).not.toHaveBeenCalled();
    act(() => applyCacheScope({ profileId: 'profile-b' }));
    expect(view.result.current.chipTray.chips).toEqual([]);
  });

  it('keeps the readable ask as text beside the profile chip', async () => {
    applyCacheScope({ profileId: 'profile-a' });
    openChatWithDraft(
      '@profile:profile-a[Tim White] Help me with my Instagram (instagram.com/tim).',
      { push: vi.fn() }
    );
    const view = renderHook(() => useJovieChat({ profileId: 'profile-a' }));
    await act(async () => {});
    expect(view.result.current.input).toBe(
      'Help me with my Instagram (instagram.com/tim).'
    );
    expect(view.result.current.chipTray.chips).toHaveLength(1);
  });

  it.each([
    { profileId: 'profile-b' },
    { userId: 'another-user' },
    { sessionId: 'session-b' },
    { impersonationSubject: 'another-subject' },
  ])(
    'rejects consumed and edited entity drafts after fence %j',
    async change => {
      applyCacheScope({ profileId: 'profile-a' });
      openChatWithDraft('Private A context', { push: vi.fn() });
      const first = renderHook(() => useJovieChat({ profileId: 'profile-a' }));
      await act(async () => {});
      act(() => first.result.current.setInput(value => `${value} edited`));
      first.unmount();
      expect(readComposerDraft(null)).toContain('Private A context');
      act(() => applyCacheScope(change));
      const next = renderHook(() => useJovieChat({ profileId: 'profile-b' }));
      expect(next.result.current.input).toBe('');
      act(() => next.result.current.setInput('Fresh ordinary draft'));
      next.unmount();
      expect(readComposerDraft(null)).toBe('Fresh ordinary draft');
      expect(h.send).not.toHaveBeenCalled();
    }
  );

  it('clears a consumed live draft and rejects stale unmount saves after a fence', async () => {
    applyCacheScope({ profileId: 'profile-a' });
    openChatWithDraft('Private A context', { push: vi.fn() });
    const first = renderHook(() => useJovieChat({ profileId: 'profile-a' }));
    await act(async () => {});
    act(() => applyCacheScope({ profileId: 'profile-b' }));
    expect(first.result.current.input).toBe('');
    saveComposerDraft(null, 'Fresh B draft');
    first.unmount();
    expect(readComposerDraft(null)).toBe('Fresh B draft');
    applyCacheScope({ profileId: 'profile-a' });
    expect(readComposerDraft(null)).not.toContain('Private A context');
    expect(h.send).not.toHaveBeenCalled();
  });

  it.each(['clear', 'send', 'fence'] as const)(
    'releases scoped ownership for fresh ordinary edits after %s',
    async action => {
      applyCacheScope({ profileId: 'profile-a' });
      openChatWithDraft('Private A context', { push: vi.fn() });
      const first = renderHook(() => useJovieChat({ profileId: 'profile-a' }));
      await act(async () => {});
      if (action === 'send') {
        await act(async () => {
          await first.result.current.submitMessage(first.result.current.input);
        });
      } else if (action === 'fence') {
        act(() => applyCacheScope({ profileId: 'profile-b' }));
      } else {
        act(() => first.result.current.setInput(''));
      }
      act(() => first.result.current.setInput('Fresh ordinary draft'));
      first.unmount();
      expect(readComposerDraft(null)).toBe('Fresh ordinary draft');
      applyCacheScope({ profileId: 'profile-c' });
      expect(readComposerDraft(null)).toBe('Fresh ordinary draft');
    }
  );

  it('retains origin scope when a failed send restores entity text', async () => {
    applyCacheScope({ profileId: 'profile-a' });
    openChatWithDraft('Private A context', { push: vi.fn() });
    const first = renderHook(() => useJovieChat({ profileId: 'profile-a' }));
    await act(async () => {});
    h.send.mockRejectedValueOnce(new Error('Network unavailable'));
    await act(async () => {
      await first.result.current.submitMessage(first.result.current.input);
    });
    expect(first.result.current.input).toBe('Private A context');
    first.unmount();
    applyCacheScope({ profileId: 'profile-b' });
    expect(readComposerDraft(null)).toBe('');
  });

  it('keeps failed entity ownership through clear and Retry', async () => {
    applyCacheScope({ profileId: 'profile-a' });
    openChatWithDraft('Private A context', { push: vi.fn() });
    const first = renderHook(() => useJovieChat({ profileId: 'profile-a' }));
    await act(async () => {});
    h.send.mockRejectedValue(new Error('Network unavailable'));
    await act(async () => {
      await first.result.current.submitMessage(first.result.current.input);
    });
    act(() => first.result.current.setInput(''));
    await act(async () => {
      first.result.current.handleRetry();
    });
    expect(first.result.current.input).toBe('Private A context');
    first.unmount();
    applyCacheScope({ profileId: 'profile-b' });
    expect(readComposerDraft(null)).toBe('');
  });

  it('does not restore or carry enriched creator drafts into Ovie', async () => {
    applyCacheScope({ profileId: 'profile-a' });
    openChatWithDraft('Private A context', { push: vi.fn() });
    const first = renderHook(
      ({ chatMode }) => useJovieChat({ profileId: 'profile-a', chatMode }),
      { initialProps: { chatMode: undefined as 'ov' | undefined } }
    );
    await act(async () => {});
    first.rerender({ chatMode: 'ov' });
    expect(first.result.current.input).toBe('');
    first.unmount();
    expect(mount().result.current.input).toBe('');
    expect(h.send).not.toHaveBeenCalled();
  });

  it('discards entity context after a profile switch without sending or changing the draft', async () => {
    applyCacheScope({ profileId: 'profile-a' });
    openChatWithDraft('Private profile-a context', { push: vi.fn() });
    applyCacheScope({ profileId: 'profile-b' });
    saveComposerDraft(null, 'Keep my draft');
    const next = renderHook(() => useJovieChat({ profileId: 'profile-b' }));
    await act(async () => {});
    expect(next.result.current.input).toBe('Keep my draft');
    expect(h.send).not.toHaveBeenCalled();
  });

  it('sends a pending initial prompt once after StrictMode effect replay', async () => {
    sessionStorage.setItem(PENDING_CHAT_PROMPT_KEY, 'Initial question');
    const first = renderHook(() => useJovieChat({ chatMode: 'ov' }), {
      wrapper: StrictMode,
    });
    await act(async () => {});
    expect(h.send).toHaveBeenCalledTimes(1);
    expect(first.result.current.isSubmitting).toBe(true);
    act(() =>
      h.onFinish?.({
        message: {
          id: 'answer',
          role: 'assistant',
          parts: [{ type: 'text', text: 'Initial answer' }],
        },
      })
    );
    expect(first.result.current.isSubmitting).toBe(false);
    expect(first.result.current.chatError).toBeNull();
    expect(first.result.current.messages.at(-1)?.parts).toEqual([
      { type: 'text', text: 'Initial answer' },
    ]);
  });
});
