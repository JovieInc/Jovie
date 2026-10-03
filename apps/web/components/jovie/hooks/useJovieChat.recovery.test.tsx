import { act, renderHook } from '@testing-library/react';
import type { UIMessage } from 'ai';
import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  readComposerDraft,
  resetComposerDraftStoreForTests,
} from '@/lib/chat/composer-draft-store';
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

function mount() {
  return renderHook(() => useJovieChat({ chatMode: 'ov' }));
}

describe('Summer failed turn recovery', () => {
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

  it.each(['retry', 'composer'] as const)(
    'reconciles an ambiguous failure with the original turn via %s',
    async action => {
      const { result } = mount();
      await act(async () => {
        await result.current.submitMessage('Check triage');
      });
      const firstId = h.send.mock.calls[0][1].body.clientTurnId;
      act(() => h.onError?.(new TypeError('Failed to fetch')));
      expect(result.current.input).toBe('Check triage');
      await act(async () => {
        if (action === 'retry') result.current.handleRetry();
        else await result.current.submitMessage(result.current.input);
      });
      expect(h.send).toHaveBeenCalledTimes(2);
      expect(h.send.mock.calls[1][1].body.clientTurnId).toBe(firstId);
      expect(
        result.current.messages.filter(message => message.role === 'user')
      ).toHaveLength(1);
    }
  );

  it('admits only one send before React commits the busy state', async () => {
    const { result } = mount();
    await act(async () => {
      await Promise.all([
        result.current.submitMessage('Check triage'),
        result.current.submitMessage('Check triage'),
      ]);
    });
    expect(h.send).toHaveBeenCalledTimes(1);
    expect(
      result.current.messages.filter(message => message.role === 'user')
    ).toHaveLength(1);
  });

  it('does not let an aborted completion fail the replacement turn', async () => {
    const { result } = mount();
    await act(async () => {
      await result.current.submitMessage('First question');
    });
    await act(async () => {
      await result.current.submitMessage('Replacement question', undefined, {
        interrupt: true,
      });
    });
    act(() =>
      h.onFinish?.({
        message: { id: 'aborted', role: 'assistant', parts: [] },
        isAbort: true,
      })
    );
    expect(result.current.chatError).toBeNull();
    expect(result.current.isSubmitting).toBe(true);
    expect(result.current.messages.at(-1)?.status).toBe('pending');
  });

  it('waits for the cancelled SDK request to settle before admitting its replacement', async () => {
    let settle!: () => void;
    h.send.mockImplementationOnce(
      () =>
        new Promise<void>(resolve => {
          settle = resolve;
        })
    );
    const { result } = mount();
    await act(async () => {
      await result.current.submitMessage('First question');
    });
    let replacement!: Promise<boolean>;
    act(() => {
      replacement = result.current.submitMessage(
        'Replacement question',
        undefined,
        { interrupt: true }
      );
    });
    expect(h.stop).toHaveBeenCalledTimes(1);
    expect(h.send).toHaveBeenCalledTimes(1);
    await act(async () => {
      expect(
        await result.current.submitMessage('Competing replacement', undefined, {
          interrupt: true,
        })
      ).toBe(false);
      h.onFinish?.({
        message: { id: 'aborted', role: 'assistant', parts: [] },
        isAbort: true,
      });
      settle();
      await replacement;
    });
    expect(h.send).toHaveBeenCalledTimes(2);
    expect(h.send.mock.calls[1][0].text).toBe('Replacement question');
    expect(result.current.chatError).toBeNull();
  });

  it('interrupts with the latest functional draft edit before another render', async () => {
    const { result } = mount();
    await act(async () => {
      await result.current.submitMessage('First question');
    });
    await act(async () => {
      result.current.setInput('Replacement');
      result.current.setInput(current => `${current} question`);
      result.current.handleInterruptAndSubmit();
    });
    expect(h.stop).toHaveBeenCalledTimes(1);
    expect(h.send).toHaveBeenCalledTimes(2);
    expect(h.send.mock.calls[1][0].text).toBe('Replacement question');
    expect(result.current.input).toBe('');
  });

  it('keeps a newer composer draft when the submitted turn fails', async () => {
    const { result } = mount();
    await act(async () => {
      await result.current.submitMessage('First question');
    });
    act(() => result.current.setInput('New draft in progress'));
    act(() => h.onError?.(new TypeError('Failed to fetch')));
    expect(result.current.input).toBe('New draft in progress');
    expect(result.current.chatError?.failedMessage).toBe('First question');
    expect(result.current.chatError?.retryClientTurnId).toBe(
      h.send.mock.calls[0][1].body.clientTurnId
    );
    await act(async () => {
      result.current.handleRetry();
    });
    expect(result.current.input).toBe('New draft in progress');
    expect(h.send.mock.calls[1][0].text).toBe('First question');
    act(() => h.onError?.(new TypeError('Failed to fetch')));
    act(() => result.current.setInput('New draft edited after failure'));
    expect(result.current.chatError).toBeNull();
  });

  it.each([false, true])(
    'handles a failed send and a same-batch draft edit (newer text: %s)',
    async newerText => {
      const { result } = mount();
      await act(async () => {
        await result.current.submitMessage('First question');
      });
      act(() => {
        h.onError?.(new TypeError('Failed to fetch'));
        result.current.setInput(current =>
          newerText ? `${current} edited` : current
        );
      });
      expect(result.current.input).toBe(
        newerText ? 'First question edited' : 'First question'
      );
      if (newerText) expect(result.current.chatError).toBeNull();
      else
        expect(result.current.chatError?.failedMessage).toBe('First question');
    }
  );

  it('retains the response request reference when a stream fails without JSON metadata', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(null, {
          headers: { 'x-request-id': 'incident-reference' },
        })
      )
    );
    const { result } = mount();
    await act(async () => {
      await result.current.submitMessage('Check triage');
      await h.fetch?.('/api/chat');
    });
    act(() => h.onError?.(new Error('stream disconnected')));
    expect(result.current.chatError?.requestId).toBe('incident-reference');
  });

  it('preserves a newer draft through Retry batched with navigation unmount', async () => {
    const first = mount();
    await act(async () => {
      await first.result.current.submitMessage('First question');
    });
    const firstId = h.send.mock.calls[0][1].body.clientTurnId;
    act(() => h.onError?.(new TypeError('Failed to fetch')));

    await act(async () => {
      first.result.current.setInput('New draft before leaving');
      first.result.current.handleRetry();
      first.unmount();
    });

    expect(h.send).toHaveBeenCalledTimes(2);
    expect(h.send.mock.calls[1][0].text).toBe('First question');
    expect(h.send.mock.calls[1][1].body.clientTurnId).toBe(firstId);
    expect(readComposerDraft(null)).toBe('New draft before leaving');
    const restored = mount();
    expect(restored.result.current.input).toBe('New draft before leaving');
  });

  it('discards an interrupted submission after unmount without clearing the saved draft', async () => {
    let settle!: () => void;
    h.send.mockImplementationOnce(
      () =>
        new Promise<void>(resolve => {
          settle = resolve;
        })
    );
    const first = mount();
    await act(async () => {
      await first.result.current.submitMessage('First question');
    });
    let replacement!: Promise<boolean>;
    act(() => {
      first.result.current.setInput('Replacement draft');
      replacement = first.result.current.submitMessage(
        'Replacement draft',
        undefined,
        {
          interrupt: true,
        }
      );
      first.unmount();
    });
    expect(readComposerDraft(null)).toBe('Replacement draft');
    await act(async () => {
      settle();
      expect(await replacement).toBe(false);
    });
    expect(h.send).toHaveBeenCalledTimes(1);
    expect(readComposerDraft(null)).toBe('Replacement draft');
  });

  it('reuses the ambiguous failed turn after navigation remount without automatic resend', async () => {
    const first = mount();
    await act(async () => {
      await first.result.current.submitMessage('Check triage');
    });
    const firstId = h.send.mock.calls[0][1].body.clientTurnId;
    act(() => h.onError?.(new TypeError('Failed to fetch')));
    first.unmount();

    const restored = mount();
    expect(h.send).toHaveBeenCalledTimes(1);
    expect(restored.result.current.input).toBe('Check triage');
    await act(async () => {
      await restored.result.current.submitMessage(
        restored.result.current.input
      );
    });
    expect(h.send).toHaveBeenCalledTimes(2);
    expect(h.send.mock.calls[1][1].body.clientTurnId).toBe(firstId);
  });

  it.each(['same-turn', 'new-turn', 'none'] as const)(
    'retains the explicit %s directive after failure and remount',
    async retry => {
      const first = mount();
      await act(async () => {
        await first.result.current.submitMessage('Check triage');
      });
      const firstId = h.send.mock.calls[0][1].body.clientTurnId;
      const hop =
        retry === 'none' ? 'summer_budget_exhausted' : 'summer_turn_failed';
      act(() => {
        h.onData?.({ type: 'data-summer-failure', data: { hop, retry } });
        h.onError?.(new Error('Summer did not finish'));
      });
      first.unmount();
      const restored = mount();
      expect(h.send).toHaveBeenCalledTimes(1);
      expect(restored.result.current.chatError?.errorCode).toBe(hop);
      await act(async () => {
        restored.result.current.handleRetry();
      });
      if (retry === 'none') {
        expect(
          restored.result.current.chatError?.failedMessage
        ).toBeUndefined();
        expect(h.send).toHaveBeenCalledTimes(1);
      } else {
        expect(h.send).toHaveBeenCalledTimes(2);
        expect(h.send.mock.calls[1][1].body.clientTurnId === firstId).toBe(
          retry === 'same-turn'
        );
      }
    }
  );

  it.each([
    {
      name: 'authentication interruption',
      body: { error: 'Unauthorized', errorCode: 'AUTH_REQUIRED' },
      type: 'unknown',
    },
    {
      name: 'rate limit',
      body: {
        error: 'Too many requests',
        errorCode: 'RATE_LIMITED',
        retryAfter: 60,
      },
      type: 'rate_limit',
    },
  ])('preserves $name guidance after remount', async ({ body, type }) => {
    const first = mount();
    await act(async () => {
      await first.result.current.submitMessage('Check triage');
    });
    act(() =>
      h.onError?.(
        new Error(JSON.stringify({ ...body, requestId: 'request-reference' }))
      )
    );
    const before = first.result.current.chatError;
    expect(before).toMatchObject({ type, errorCode: body.errorCode });
    first.unmount();
    const restored = mount();
    expect(restored.result.current.chatError).toMatchObject({
      type: before?.type,
      message: before?.message,
      errorCode: before?.errorCode,
      retryAfter: before?.retryAfter,
      requestId: before?.requestId,
      suppressComposerPause: before?.suppressComposerPause,
    });
    expect(restored.result.current.chatError?.retryClientTurnId).toBe(
      before?.retryClientTurnId
    );
    expect(restored.result.current.chatError?.failedMessage).toBe(
      before?.failedMessage
    );
    expect(h.send).toHaveBeenCalledTimes(1);
  });

  it('retains a terminal finish directive while preserving a newer draft across remount', async () => {
    const first = mount();
    await act(async () => {
      await first.result.current.submitMessage('Check triage');
    });
    const firstId = h.send.mock.calls[0][1].body.clientTurnId;
    act(() => {
      first.result.current.setInput('New draft');
      h.onFinish?.({
        message: {
          id: 'partial',
          role: 'assistant',
          parts: [{ type: 'text', text: 'Partial answer' }],
          metadata: {
            summerFailure: { hop: 'summer_turn_failed', retry: 'new-turn' },
          },
        },
      });
    });
    first.unmount();
    const restored = mount();
    expect(restored.result.current.input).toBe('New draft');
    await act(async () => {
      restored.result.current.handleRetry();
    });
    expect(h.send.mock.calls[1][0].text).toBe('Check triage');
    expect(h.send.mock.calls[1][1].body.clientTurnId).not.toBe(firstId);
    expect(restored.result.current.input).toBe('New draft');
  });

  it.each(['completion', 'new intent'] as const)(
    'clears saved recovery after %s',
    async outcome => {
      const first = mount();
      await act(async () => {
        await first.result.current.submitMessage('Check triage');
      });
      act(() => h.onError?.(new TypeError('Failed to fetch')));
      await act(async () => {
        if (outcome === 'completion') first.result.current.handleRetry();
        else await first.result.current.submitMessage('A different question');
      });
      if (outcome === 'completion') {
        act(() =>
          h.onFinish?.({
            message: {
              id: 'answer',
              role: 'assistant',
              parts: [{ type: 'text', text: 'Done' }],
            },
          })
        );
      }
      first.unmount();
      const restored = mount();
      expect(restored.result.current.chatError).toBeNull();
      expect(h.send).toHaveBeenCalledTimes(2);
    }
  );

  it.each(['mode', 'profile', 'account', 'session'] as const)(
    'does not restore pending turn identity in another %s context',
    async context => {
      const first = renderHook(() =>
        useJovieChat({ chatMode: 'ov', profileId: 'profile-a' })
      );
      await act(async () => {
        await first.result.current.submitMessage('Check triage');
      });
      const firstId = h.send.mock.calls[0][1].body.clientTurnId;
      act(() => h.onError?.(new TypeError('Failed to fetch')));
      first.unmount();
      if (context === 'account') applyCacheScope({ userId: 'another-user' });
      if (context === 'session')
        applyCacheScope({ sessionId: 'another-session' });
      const restored = renderHook(() =>
        useJovieChat({
          chatMode: context === 'mode' ? undefined : 'ov',
          profileId: context === 'profile' ? 'profile-b' : 'profile-a',
        })
      );
      expect(restored.result.current.chatError).toBeNull();
      await act(async () => {
        await restored.result.current.submitMessage('Check triage');
      });
      expect(h.send.mock.calls[1][1].body.clientTurnId).not.toBe(firstId);
    }
  );

  it('invalidates an interrupted send when the account changes before cancellation settles', async () => {
    let settle!: () => void;
    h.send.mockImplementationOnce(
      () =>
        new Promise<void>(resolve => {
          settle = resolve;
        })
    );
    const first = mount();
    await act(async () => {
      await first.result.current.submitMessage('First question');
    });
    let replacement!: Promise<boolean>;
    act(() => {
      replacement = first.result.current.submitMessage(
        'Private replacement',
        undefined,
        { interrupt: true }
      );
      applyCacheScope({ userId: 'another-user' });
    });
    await act(async () => {
      settle();
      expect(await replacement).toBe(false);
    });
    expect(h.send).toHaveBeenCalledTimes(1);
    expect(first.result.current.chatError).toBeNull();
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

  it('ignores an old request rejection after a new account starts a turn', async () => {
    let rejectOld!: (error: Error) => void;
    h.send.mockImplementationOnce(
      () =>
        new Promise<void>((_resolve, reject) => {
          rejectOld = reject;
        })
    );
    const { result } = mount();
    await act(async () => {
      await result.current.submitMessage('Old account question');
    });
    act(() => applyCacheScope({ userId: 'another-user' }));
    expect(h.stop).toHaveBeenCalledTimes(1);
    await act(async () => {
      expect(await result.current.submitMessage('New account question')).toBe(
        true
      );
    });
    await act(async () => {
      // The SDK suppresses onError after stop and emits an aborted finish.
      h.onFinish?.({
        message: { id: 'old-aborted', role: 'assistant', parts: [] },
        isAbort: true,
      });
      rejectOld(new TypeError('Old request disconnected'));
    });
    expect(h.send).toHaveBeenCalledTimes(2);
    expect(result.current.chatError).toBeNull();
    expect(result.current.isSubmitting).toBe(true);
    expect(result.current.messages.at(-1)?.status).toBe('pending');
  });

  it('keeps a non-retryable Summer failure visible after restoring the draft', async () => {
    const { result } = mount();
    await act(async () => {
      await result.current.submitMessage('Check triage');
    });
    act(() => {
      h.onData?.({
        type: 'data-summer-failure',
        data: { hop: 'summer_budget_exhausted', retry: 'none' },
      });
      h.onError?.(new Error('Daily allowance exhausted'));
    });
    expect(result.current.input).toBe('Check triage');
    expect(result.current.chatError?.failedMessage).toBeUndefined();
    expect(result.current.chatError?.retryClientTurnId).toBeUndefined();
    expect(result.current.chatError?.errorCode).toBe('summer_budget_exhausted');
  });

  it('allows a new conversation to send while the previous SDK request aborts', async () => {
    h.send.mockImplementationOnce(() => new Promise<void>(() => {}));
    const { result, rerender } = renderHook(
      ({ conversationId }) => useJovieChat({ conversationId }),
      { initialProps: { conversationId: 'thread-a' } }
    );
    await act(async () => {
      await result.current.submitMessage('Question A');
    });
    rerender({ conversationId: 'thread-b' });
    expect(result.current.isSubmitting).toBe(false);
    await act(async () => {
      expect(await result.current.submitMessage('Question B')).toBe(true);
    });
    act(() =>
      h.onFinish?.({
        message: { id: 'aborted-a', role: 'assistant', parts: [] },
        isAbort: true,
      })
    );
    expect(h.send).toHaveBeenCalledTimes(2);
    expect(result.current.isSubmitting).toBe(true);
    expect(result.current.chatError).toBeNull();
  });

  it('discards an interrupted submission when its conversation changes during cancellation', async () => {
    let settle!: () => void;
    h.send.mockImplementationOnce(
      () =>
        new Promise<void>(resolve => {
          settle = resolve;
        })
    );
    const { result, rerender } = renderHook(
      ({ conversationId }) => useJovieChat({ conversationId }),
      { initialProps: { conversationId: 'thread-a' } }
    );
    await act(async () => {
      await result.current.submitMessage('Question A');
    });
    let replacement!: Promise<boolean>;
    act(() => {
      replacement = result.current.submitMessage(
        'Stale replacement A',
        undefined,
        { interrupt: true }
      );
    });
    rerender({ conversationId: 'thread-b' });
    await act(async () => {
      expect(await result.current.submitMessage('Question B')).toBe(true);
    });
    await act(async () => {
      settle();
      expect(await replacement).toBe(false);
    });
    expect(h.send).toHaveBeenCalledTimes(2);
    expect(h.send.mock.calls[1][0].text).toBe('Question B');
    expect(result.current.activeConversationId).toBe('thread-b');
  });
});
