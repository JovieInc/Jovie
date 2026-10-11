import { act, fireEvent, screen } from '@testing-library/react';
import type { UIMessage } from 'ai';
import {
  type ComponentProps,
  type ReactNode,
  useLayoutEffect,
  useState,
} from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetComposerDraftStoreForTests } from '@/lib/chat/composer-draft-store';
import { getDesktopWorkState } from '@/lib/desktop/session-work-state';
import { renderWithQueryClient } from '@/tests/utils/test-utils';
import type { ChatInputProps } from './components/ChatInput';
import type { PendingFile } from './hooks/useChatFileAttachments';
import { createComposerDraft } from './hooks/useComposerDraft';
import { resetChatTimelineStateCacheForTests } from './hooks/useJovieChat';
import { JovieChat } from './JovieChat';
import * as sections from './JovieChatSections';

const h = vi.hoisted(() => ({
  router: { push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() },
  sdkRenders: vi.fn(),
  inputRenders: vi.fn(),
  inputProps: null as ChatInputProps | null,
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
  useRouter: () => h.router,
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
    ChatInput: forwardRef<HTMLTextAreaElement, ChatInputProps>((props, ref) => {
      const { value, onChange, onSubmit } = props;
      h.inputProps = props;
      h.inputRenders();
      return (
        <textarea
          ref={ref}
          aria-label='Draft'
          value={value}
          onChange={event => onChange(event.target.value)}
          onKeyDown={event => {
            if (event.key === 'Enter') onSubmit();
          }}
        />
      );
    }),
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

// Observe the real render body before mounting. The baseline exports a function;
// the optimized version keeps React's real memo object/comparison and spies its type.
function observeComposerRender() {
  const component: unknown = sections.ChatDraftComposerSurface;
  if (typeof component === 'function') {
    return vi.spyOn(sections, 'ChatDraftComposerSurface');
  }
  if (
    component !== null &&
    typeof component === 'object' &&
    'type' in component &&
    typeof component.type === 'function'
  ) {
    return vi.spyOn(
      component as {
        type: (
          props: ComponentProps<typeof sections.ChatDraftComposerSurface>
        ) => ReactNode;
      },
      'type'
    );
  }
  throw new Error('Expected the actual composer render function or memo type');
}

describe('composer draft ownership', () => {
  beforeEach(() => {
    resetChatTimelineStateCacheForTests();
    resetComposerDraftStoreForTests();
    h.loading = false;
    h.sdkSnapshot = { messages: [], status: 'ready' };
    h.sdkRenders.mockClear();
    h.inputRenders.mockClear();
    h.inputProps = null;
    h.router = { push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() };
    h.virtualizerRenders.mockClear();
    h.send.mockReset().mockResolvedValue(undefined);
    h.stop.mockReset();
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
      expect(h.inputProps?.isStreaming).toBe(true);
      expect(h.inputProps?.isLoading).toBe(true);
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
    expect(h.inputProps?.isStreaming).toBe(false);
    expect(h.inputProps?.isLoading).toBe(false);
    act(() => h.inputProps?.onStop?.());
    expect(h.stop).toHaveBeenCalledTimes(1);
    expect(getDesktopWorkState()?.hasDraft).toBe(true);
    expect(input).toHaveValue('Draft during Growing answer complete');
    view.unmount();
    expect(getDesktopWorkState()).toBeNull();
  });

  it('streams twenty assistant revisions without invoking an unchanged composer', async () => {
    const composerRenders = observeComposerRender();
    const view = renderWithQueryClient(
      <JovieChat conversationId='draft-owner-thread' />
    );
    try {
      await act(async () => {});
      const input = screen.getByRole('textbox', { name: 'Draft' });
      await act(async () => {
        fireEvent.change(input, { target: { value: 'Start streaming' } });
        fireEvent.keyDown(input, { key: 'Enter' });
      });
      const publish = (text: string) => {
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
      };
      act(() => publish('First token'));
      expect(screen.getByText('First token')).toBeInTheDocument();
      const before = {
        composer: composerRenders.mock.calls.length,
        input: h.inputRenders.mock.calls.length,
      };
      const transcriptRenders = h.virtualizerRenders.mock.calls.length;
      for (let index = 1; index <= 20; index++) {
        const text = `Assistant ${'word '.repeat(index).trim()}`;
        act(() => publish(text));
        expect(screen.getByText(text)).toBeInTheDocument();
      }
      expect({
        composer: composerRenders.mock.calls.length,
        input: h.inputRenders.mock.calls.length,
      }).toEqual(before);
      expect(h.virtualizerRenders.mock.calls.length).toBeGreaterThan(
        transcriptRenders
      );
      fireEvent.change(input, { target: { value: 'A live new draft' } });
      expect(input).toHaveValue('A live new draft');
      expect(composerRenders.mock.calls.length).toBeGreaterThan(
        before.composer
      );
      expect(h.inputRenders.mock.calls.length).toBeGreaterThan(before.input);
    } finally {
      view.unmount();
      composerRenders.mockRestore();
    }
  });

  it('keeps current router, chip, profile, mode, picker and readiness behavior live', async () => {
    const firstRouter = h.router;
    const view = renderWithQueryClient(
      <JovieChat conversationId='draft-owner-thread' profileId='profile-a' />
    );
    await act(async () => {});
    act(() => h.inputProps?.onAddSkill?.('generateAlbumArt'));
    expect(h.inputProps?.chips?.[0]).toMatchObject({
      type: 'skill',
      id: 'generateAlbumArt',
    });
    act(() => h.inputProps?.onRemoveChipAt?.(0));
    expect(h.inputProps?.chips).toHaveLength(0);
    act(() => h.inputProps?.onPickerOpenChange?.(true));
    expect(screen.getByTestId('chat-content')).toHaveAttribute(
      'data-picker-open',
      'true'
    );
    act(() => h.inputProps?.onPickerOpenChange?.(false));
    expect(screen.getByTestId('chat-content')).not.toHaveAttribute(
      'data-picker-open'
    );

    const firstInterrupt = h.inputProps?.onInterruptAndSend;
    h.router = { push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() };
    view.rerender(
      <JovieChat conversationId='draft-owner-thread' profileId='profile-a' />
    );
    expect(h.inputProps?.onInterruptAndSend).not.toBe(firstInterrupt);
    await act(async () => {
      fireEvent.change(screen.getByRole('textbox', { name: 'Draft' }), {
        target: { value: 'open settings' },
      });
      h.inputProps?.onInterruptAndSend?.();
    });
    expect(h.router.push).toHaveBeenCalledWith('/app/settings');
    expect(firstRouter.push).not.toHaveBeenCalled();
    expect(h.send).not.toHaveBeenCalled();
    view.rerender(<JovieChat chatMode='ov' profileId='profile-b' />);
    await act(async () => {});
    expect(h.inputProps?.profileId).toBe('profile-b');
    expect(h.inputProps?.placeholder).toBe('Ask Ovie...');
    expect(h.inputProps?.desktopConversationReady).toBe(true);
    h.loading = true;
    view.rerender(<JovieChat chatMode='ov' profileId='profile-b' />);
    expect(getDesktopWorkState()?.hasPendingAction).toBe(true);
    expect(
      screen.queryByRole('textbox', { name: 'Draft' })
    ).not.toBeInTheDocument();
    h.loading = false;
    view.rerender(<JovieChat chatMode='ov' profileId='profile-b' />);
    expect(h.inputProps?.desktopConversationReady).toBe(true);
    view.unmount();
  });

  it('updates file progress, upload status and rate guidance through the memo boundary', () => {
    const draft = createComposerDraft('Review upload');
    const file: PendingFile = {
      id: 'upload-1',
      name: 'notes.pdf',
      size: 1024,
      mediaType: 'application/pdf',
      kind: 'document',
      status: 'uploading',
      progress: 25,
      speed: 10,
      kindLabel: 'PDF',
    };
    const props: ComponentProps<typeof sections.ChatDraftComposerSurface> = {
      draft,
      chatInputProps: {
        onChange: draft.set,
        onSubmit: vi.fn(),
        isLoading: false,
        isSubmitting: false,
        isFileProcessing: true,
        pendingFiles: [file],
      },
      showThreadView: true,
      isRateLimited: false,
      showManifest: true,
      manifestCollapsed: false,
      showChips: false,
      pendingFiles: [file],
      aggregate: {
        total: 1,
        done: 0,
        overallPct: 25,
        speed: '10 B/s',
        eta: '1m',
        locked: 0,
      },
      isUploading: true,
      isPro: false,
      onRemoveFile: vi.fn(),
      onCollapseManifest: vi.fn(),
      onExpandManifest: vi.fn(),
    };
    const view = renderWithQueryClient(
      <sections.ChatDraftComposerSurface {...props} />
    );
    expect(
      screen.getByRole('progressbar', { name: 'Upload progress for notes.pdf' })
    ).toHaveAttribute('aria-valuenow', '25');
    const updated = { ...file, progress: 75 };
    view.rerender(
      <sections.ChatDraftComposerSurface
        {...props}
        pendingFiles={[updated]}
        aggregate={{ ...props.aggregate, overallPct: 75 }}
        isRateLimited
      />
    );
    expect(
      screen.getByRole('progressbar', { name: 'Upload progress for notes.pdf' })
    ).toHaveAttribute('aria-valuenow', '75');
    expect(screen.getByText(/Sending too fast/)).toBeInTheDocument();
    view.rerender(
      <sections.ChatDraftComposerSurface
        {...props}
        isUploading={false}
        pendingFiles={[]}
        showManifest={false}
        chatInputProps={{
          ...props.chatInputProps,
          isFileProcessing: false,
          pendingFiles: [],
        }}
      />
    );
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    expect(screen.queryByText(/Sending too fast/)).not.toBeInTheDocument();
    expect(h.inputProps?.isFileProcessing).toBe(false);
    expect(h.inputProps?.pendingFiles).toHaveLength(0);
    expect(screen.getByRole('textbox', { name: 'Draft' })).toHaveValue(
      'Review upload'
    );
    view.unmount();
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
