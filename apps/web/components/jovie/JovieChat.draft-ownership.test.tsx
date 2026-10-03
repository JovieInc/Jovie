import { act, fireEvent, screen } from '@testing-library/react';
import type { UIMessage } from 'ai';
import { useLayoutEffect, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetComposerDraftStoreForTests } from '@/lib/chat/composer-draft-store';
import { getDesktopWorkState } from '@/lib/desktop/session-work-state';
import { renderWithQueryClient } from '@/tests/utils/test-utils';
import { resetChatTimelineStateCacheForTests } from './hooks/useJovieChat';
import { JovieChat } from './JovieChat';

const h = vi.hoisted(() => ({
  sdkRenders: vi.fn(),
  virtualizerRenders: vi.fn(),
  send: vi.fn(),
  stop: vi.fn(),
  setMessages: vi.fn(),
  sdkSnapshot: {
    messages: [] as UIMessage[],
    status: 'ready' as 'ready' | 'streaming',
  },
  sdkListeners: new Set<() => void>(),
  loading: false,
  history: {
    conversation: { id: 'draft-owner-thread', title: 'Existing thread' },
    messages: [
      {
        id: 'user-1',
        role: 'user',
        content: 'First question',
        createdAt: '2026-10-01T00:00:00Z',
      },
      {
        id: 'assistant-1',
        role: 'assistant',
        content: 'First answer',
        createdAt: '2026-10-01T00:00:01Z',
      },
    ],
  },
}));

vi.mock('@ai-sdk/react', async () => {
  const { useSyncExternalStore } = await import('react');
  const subscribe = (listener: () => void) => {
    h.sdkListeners.add(listener);
    return () => h.sdkListeners.delete(listener);
  };
  const snapshot = () => h.sdkSnapshot;
  return {
    useChat: (options: { experimental_throttle?: number }) => {
      h.sdkRenders(options);
      const current = useSyncExternalStore(subscribe, snapshot, snapshot);
      return {
        ...current,
        sendMessage: h.send,
        stop: h.stop,
        setMessages: h.setMessages,
      };
    },
  };
});
vi.mock('@tanstack/react-virtual', async importOriginal => {
  const actual =
    await importOriginal<typeof import('@tanstack/react-virtual')>();
  return {
    ...actual,
    useVirtualizer: (options: Parameters<typeof actual.useVirtualizer>[0]) => {
      h.virtualizerRenders();
      return actual.useVirtualizer(options);
    },
  };
});
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/app/chat/draft-owner-thread',
}));
vi.mock('@/lib/queries', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/queries')>()),
  useChatConversationQuery: () => ({
    data: h.loading ? undefined : h.history,
    isLoading: h.loading,
    isError: false,
    error: null,
  }),
  usePlanGate: () => ({ chatFileUploadLimit: 5, isPro: false }),
  usePendingOpportunityCardsQuery: () => ({ data: [] }),
  useInsightsSummaryQuery: () => ({ data: undefined }),
}));
vi.mock('@/lib/flags/client', () => ({ useAppFlag: () => false }));
vi.mock('@/lib/chat/open-chat-with-prompt', () => ({
  consumePendingChatPrompt: () => null,
}));
vi.mock('@/components/jovie/components/ChatUsageAlert', () => ({
  ChatUsageAlert: () => null,
}));
vi.mock('@/components/jovie/components/EntityResolutionProvider', () => ({
  EntityResolutionProvider: ({ children }: { children: React.ReactNode }) =>
    children,
}));
vi.mock('@/components/jovie/components', async importOriginal => {
  const { forwardRef } = await import('react');
  return {
    ...(await importOriginal<typeof import('@/components/jovie/components')>()),
    // The controlled DOM input preserves the real ownership path: no runtime
    // hook, controller, composer surface, or transcript owner is substituted.
    ChatInput: forwardRef<
      HTMLTextAreaElement,
      {
        value: string;
        onChange: (value: string) => void;
        onSubmit: () => void;
      }
    >(({ value, onChange, onSubmit }, ref) => (
      <textarea
        ref={ref}
        aria-label='Draft'
        value={value}
        onChange={event => onChange(event.target.value)}
        onKeyDown={event => {
          if (event.key === 'Enter') onSubmit();
        }}
      />
    )),
    ChatMessage: ({ parts }: { parts: UIMessage['parts'] }) => (
      <p>
        {parts
          .filter(part => part.type === 'text')
          .map(part => part.text)
          .join('')}
      </p>
    ),
    ScrollToBottom: () => null,
  };
});

describe('composer draft ownership', () => {
  beforeEach(() => {
    resetChatTimelineStateCacheForTests();
    resetComposerDraftStoreForTests();
    h.loading = false;
    h.sdkSnapshot = { messages: [], status: 'ready' };
    h.sdkRenders.mockClear();
    h.virtualizerRenders.mockClear();
    h.send.mockReset().mockResolvedValue(undefined);
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      }
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  it('publishes draft safety before a sibling committed layout reads it', async () => {
    const observed: (boolean | undefined)[] = [];
    let commitProbe = () => {};
    function CommitProbe() {
      const [revision, setRevision] = useState(0);
      commitProbe = () => setRevision(value => value + 1);
      useLayoutEffect(() => {
        observed[revision] = getDesktopWorkState()?.hasDraft;
      }, [revision]);
      return null;
    }
    const view = renderWithQueryClient(
      <>
        <JovieChat conversationId='draft-owner-thread' />
        <CommitProbe />
      </>
    );
    await act(async () => {});
    const input = screen.getByRole('textbox', { name: 'Draft' });
    for (const value of ['unsent work', '']) {
      act(() => {
        fireEvent.change(input, { target: { value } });
        commitProbe();
      });
      expect(observed.at(-1)).toBe(Boolean(value));
    }
    expect(observed).toEqual([false, true, false]);
    view.unmount();
    expect(getDesktopWorkState()).toBeNull();
  });

  it('keeps a work owner during history loading and revokes it on unmount', async () => {
    h.loading = true;
    const view = renderWithQueryClient(
      <JovieChat conversationId='draft-owner-thread' />
    );
    expect(
      screen.getByTestId('chat-loading-conversation-skeleton')
    ).toBeVisible();
    expect(getDesktopWorkState()?.hasPendingAction).toBe(true);
    h.loading = false;
    view.rerender(<JovieChat conversationId='draft-owner-thread' />);
    await act(async () => {});
    expect(screen.getByText('First answer')).toBeInTheDocument();
    expect(getDesktopWorkState()?.hasPendingAction).toBe(false);
    fireEvent.change(screen.getByRole('textbox', { name: 'Draft' }), {
      target: { value: 'after history loads' },
    });
    expect(getDesktopWorkState()?.hasDraft).toBe(true);
    view.unmount();
    expect(getDesktopWorkState()).toBeNull();
  });

  it('keeps streamed transcript revisions live while a new draft is composed', async () => {
    const view = renderWithQueryClient(
      <JovieChat conversationId='draft-owner-thread' />
    );
    await act(async () => {});
    const input = screen.getByRole('textbox', { name: 'Draft' });
    await act(async () => {
      fireEvent.change(input, { target: { value: 'A follow-up question' } });
      fireEvent.keyDown(input, { key: 'Enter' });
    });
    expect(h.send).toHaveBeenCalledWith(
      { text: 'A follow-up question' },
      expect.any(Object)
    );
    expect(input).toHaveValue('');
    const virtualizerRenders = h.virtualizerRenders.mock.calls.length;
    for (const text of [
      'Growing',
      'Growing answer',
      'Growing answer complete',
    ]) {
      act(() => {
        h.sdkSnapshot = {
          status: 'streaming',
          messages: [
            {
              id: 'live-response',
              role: 'assistant',
              parts: [{ type: 'text', text }],
            },
          ],
        };
        for (const notify of h.sdkListeners) notify();
      });
      expect(screen.getByText(text)).toBeInTheDocument();
      expect(getDesktopWorkState()?.isStreaming).toBe(true);
      fireEvent.change(input, { target: { value: `Draft during ${text}` } });
      expect(input).toHaveValue(`Draft during ${text}`);
      expect(getDesktopWorkState()?.hasDraft).toBe(true);
    }
    expect(h.virtualizerRenders.mock.calls.length).toBeGreaterThan(
      virtualizerRenders
    );
    expect(h.sdkRenders.mock.lastCall?.[0].experimental_throttle).toBe(50);
    act(() => {
      h.sdkRenders.mock.lastCall?.[0].onFinish({
        message: h.sdkSnapshot.messages[0],
      });
      h.sdkSnapshot = { ...h.sdkSnapshot, status: 'ready' };
      for (const notify of h.sdkListeners) notify();
    });
    expect(getDesktopWorkState()?.isStreaming).toBe(false);
    expect(getDesktopWorkState()?.hasDraft).toBe(true);
    expect(input).toHaveValue('Draft during Growing answer complete');
    view.unmount();
    expect(getDesktopWorkState()).toBeNull();
  });

  it('edits the visible draft without invoking the real runtime or virtualizer owner', async () => {
    const view = renderWithQueryClient(
      <JovieChat conversationId='draft-owner-thread' />
    );
    await act(async () => {});
    expect(screen.getByText('First answer')).toBeInTheDocument();
    const input = screen.getByRole('textbox', { name: 'Draft' });
    const sdkRenders = h.sdkRenders.mock.calls.length;
    const virtualizerRenders = h.virtualizerRenders.mock.calls.length;
    expect(sdkRenders).toBeGreaterThan(0);
    expect(virtualizerRenders).toBeGreaterThan(0);
    for (let index = 1; index <= 20; index++) {
      fireEvent.change(input, { target: { value: 'x'.repeat(index) } });
      expect(input).toHaveValue('x'.repeat(index));
      expect(getDesktopWorkState()?.hasDraft).toBe(true);
    }
    expect(h.sdkRenders).toHaveBeenCalledTimes(sdkRenders);
    expect(h.virtualizerRenders).toHaveBeenCalledTimes(virtualizerRenders);
    expect(h.sdkRenders.mock.lastCall?.[0].experimental_throttle).toBe(50);
    view.unmount();
    expect(getDesktopWorkState()).toBeNull();
  });
});
