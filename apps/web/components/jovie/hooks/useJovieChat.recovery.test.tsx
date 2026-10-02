import { act, renderHook } from '@testing-library/react';
import type { UIMessage } from 'ai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  readComposerDraft,
  resetComposerDraftStoreForTests,
} from '@/lib/chat/composer-draft-store';
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
