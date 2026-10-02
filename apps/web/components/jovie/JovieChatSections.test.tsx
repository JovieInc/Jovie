import { TooltipProvider } from '@jovie/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Virtualizer } from '@tanstack/react-virtual';
import { act, fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps, ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatInput } from '@/components/jovie/components/ChatInput';
import { getDesktopWorkState } from '@/lib/desktop/session-work-state';
import { CHAT_EMPTY_SAMPLE_STORAGE_KEY } from './chat-empty-starters';
import {
  type ComposerDraft,
  createComposerDraft,
} from './hooks/useComposerDraft';
import {
  CHAT_EMPTY_TOP_SPACING_OWNER,
  CHAT_EMPTY_VIEWPORT_CLASSNAME,
  ChatComposerSurface,
  ChatDraftComposerSurface,
  ChatDraftWorkState,
  ChatEmptyStateComposerRegion,
  ChatInlineError,
  ChatLoadingConversationSkeleton,
  ChatThreadMessages,
} from './JovieChatSections';

vi.mock('@/components/jovie/components', async importOriginal => ({
  ...(await importOriginal<typeof import('@/components/jovie/components')>()),
  ChatMessage: ({ id }: { id: string }) => (
    <div data-testid='thread-row'>{id}</div>
  ),
}));

vi.mock('@/components/jovie/components/ChatUsageAlert', () => ({
  ChatUsageAlert: () => <div data-testid='usage-alert-probe'>usage-alert</div>,
}));

vi.mock('motion/react', () => ({
  motion: {
    div: ({
      children,
      initial: _initial,
      animate: _animate,
      layout: _layout,
      layoutId: _layoutId,
      transition: _transition,
      ...props
    }: ComponentProps<'div'> & {
      initial?: unknown;
      animate?: unknown;
      layout?: unknown;
      layoutId?: unknown;
      transition?: unknown;
    }) => <div {...props}>{children}</div>,
    textarea: ({
      children,
      initial: _initial,
      animate: _animate,
      transition: _transition,
      ...props
    }: ComponentProps<'textarea'> & {
      initial?: unknown;
      animate?: unknown;
      transition?: unknown;
    }) => <textarea {...props}>{children}</textarea>,
    span: ({
      children,
      initial: _initial,
      animate: _animate,
      exit: _exit,
      layout: _layout,
      transition: _transition,
      ...props
    }: ComponentProps<'span'> & {
      initial?: unknown;
      animate?: unknown;
      exit?: unknown;
      layout?: unknown;
      transition?: unknown;
    }) => <span {...props}>{children}</span>,
    output: ({
      children,
      initial: _initial,
      animate: _animate,
      exit: _exit,
      transition: _transition,
      ...props
    }: ComponentProps<'output'> & {
      initial?: unknown;
      animate?: unknown;
      exit?: unknown;
      transition?: unknown;
    }) => <output {...props}>{children}</output>,
  },
  AnimatePresence: ({ children }: { children: ReactNode }) => <>{children}</>,
  useReducedMotion: () => true,
}));

describe('JovieChatSections', () => {
  beforeEach(() => {
    sessionStorage.removeItem(CHAT_EMPTY_SAMPLE_STORAGE_KEY);
  });

  it('exports the empty-chat viewport owner so nested shells cannot add a second top gap', () => {
    expect(CHAT_EMPTY_TOP_SPACING_OWNER).toBe('chat-empty-viewport');
    expect(CHAT_EMPTY_VIEWPORT_CLASSNAME).toContain('pt-0');
    expect(CHAT_EMPTY_VIEWPORT_CLASSNAME).toContain(
      'px-(--app-shell-header-padding-x)'
    );
  });

  it('renders the conversation loading skeleton without shifting the composer dock', () => {
    render(<ChatLoadingConversationSkeleton />);

    expect(
      screen.getByTestId('chat-loading-conversation-skeleton')
    ).toHaveAttribute('aria-busy', 'true');
  });

  it('re-exports the Just ask empty region as the shared conversation entry', () => {
    render(
      <ChatEmptyStateComposerRegion>
        <button type='button'>Composer</button>
      </ChatEmptyStateComposerRegion>
    );

    expect(screen.getByTestId('chat-empty-state-greeting')).toHaveTextContent(
      'Just ask'
    );
    expect(
      screen.getByRole('button', { name: 'Composer' })
    ).toBeInTheDocument();
  });
});

describe('ChatInlineError', () => {
  const chatError = {
    type: 'server' as const,
    message: 'We encountered a temporary issue. Please try again.',
    failedMessage: 'What matters now?',
  };

  function renderInlineError(chatMode?: 'ov') {
    return render(
      <ChatInlineError
        chatError={chatError}
        onRetry={vi.fn()}
        isLoading={false}
        isSubmitting={false}
        chatMode={chatMode}
      />
    );
  }

  it('uses the default paused-message presentation outside ov mode', () => {
    renderInlineError();

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Message paused');
    expect(alert).not.toHaveTextContent('Summer Didn’t Finish That Reply');
  });

  it('uses the operator presentation in ov chat mode', () => {
    renderInlineError('ov');

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Summer Didn’t Finish That Reply');
    expect(alert).toHaveTextContent(
      'Your briefing is still current. Retry this message or ask something else.'
    );
    expect(alert).not.toHaveTextContent('Message paused');
  });
});

function renderThreadMessages({
  collapsedFailureCount = 0,
  onShowCollapsedFailures,
}: {
  readonly collapsedFailureCount?: number;
  readonly onShowCollapsedFailures?: () => void;
} = {}) {
  return render(
    <ChatThreadMessages
      messages={[]}
      shouldVirtualizeMessages={false}
      virtualizer={{} as Virtualizer<HTMLDivElement, Element>}
      virtualizedMessageViewportHeight={0}
      virtualizedMinHeight={0}
      messageViewportPaddingBottom={undefined}
      totalSizeRef={() => undefined}
      bottomSentinelRef={() => undefined}
      isStreaming={false}
      lastAssistantIndex={-1}
      knownMessageIds={new Set()}
      inlineChatError={null}
      isStuckToBottom
      onScrollToBottom={() => undefined}
      collapsedFailureCount={collapsedFailureCount}
      onShowCollapsedFailures={onShowCollapsedFailures}
    />
  );
}

describe('ChatThreadMessages collapsed summer failures', () => {
  it('hides the control when there are no collapsed failures', () => {
    renderThreadMessages({
      collapsedFailureCount: 0,
      onShowCollapsedFailures: vi.fn(),
    });

    expect(
      screen.queryByTestId('chat-collapsed-failures')
    ).not.toBeInTheDocument();
  });

  it('uses singular copy for one earlier unanswered message and reveals it on click', () => {
    const onShowCollapsedFailures = vi.fn();
    renderThreadMessages({ collapsedFailureCount: 1, onShowCollapsedFailures });

    const control = screen.getByTestId('chat-collapsed-failures');
    expect(control).toHaveTextContent(
      '1 earlier message went unanswered. Show it'
    );

    fireEvent.click(control);
    expect(onShowCollapsedFailures).toHaveBeenCalledTimes(1);
  });

  it('uses plural copy for multiple earlier unanswered messages', () => {
    renderThreadMessages({
      collapsedFailureCount: 3,
      onShowCollapsedFailures: vi.fn(),
    });

    expect(screen.getByTestId('chat-collapsed-failures')).toHaveTextContent(
      '3 earlier messages went unanswered. Show them'
    );
  });
});

function renderComposerSurface({
  suppressUsageAlert = false,
  draft,
}: {
  readonly suppressUsageAlert?: boolean;
  readonly draft?: ComposerDraft;
} = {}) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  const chatInputProps: ComponentProps<typeof ChatInput> = {
    value: '',
    onChange: draft?.set ?? (() => undefined),
    onSubmit: () => undefined,
    isLoading: false,
    isSubmitting: false,
    onFileAttach: () => undefined,
    onAudioAttach: () => undefined,
    pendingFiles: [],
    onRemoveFile: () => undefined,
  };

  const surfaceProps: ComponentProps<typeof ChatComposerSurface> = {
    chatInputProps,
    showThreadView: false,
    suppressUsageAlert,
    isRateLimited: false,
    showManifest: false,
    manifestCollapsed: false,
    showChips: false,
    pendingFiles: [],
    aggregate: {
      total: 0,
      done: 0,
      overallPct: 0,
      speed: '0 B/s',
      eta: '—',
      locked: 0,
    },
    isUploading: false,
    isPro: true,
    onRemoveFile: () => undefined,
    onCollapseManifest: () => undefined,
    onExpandManifest: () => undefined,
  };

  const content = (currentProps = surfaceProps) => (
    <QueryClientProvider client={client}>
      <TooltipProvider>
        {draft ? (
          <>
            <ChatDraftWorkState
              draft={draft}
              hasAttachments={false}
              isUploading={false}
              isLoading={false}
              isSubmitting={false}
              isLoadingConversation={false}
              status='ready'
              messages={[]}
            />
            <ChatDraftComposerSurface {...currentProps} draft={draft} />
          </>
        ) : (
          <ChatComposerSurface {...currentProps} />
        )}
      </TooltipProvider>
    </QueryClientProvider>
  );
  const view = render(content());
  return {
    ...view,
    rerenderSurface: (updates: Partial<typeof surfaceProps> = {}) =>
      view.rerender(content({ ...surfaceProps, ...updates })),
  };
}

describe('draft-connected composer sections', () => {
  it('skips unchanged parent props but keeps draft and control changes live through memo', () => {
    const memoSurface =
      ChatDraftComposerSurface as typeof ChatDraftComposerSurface & {
        type: (
          props: ComponentProps<typeof ChatDraftComposerSurface>
        ) => ReactNode;
      };
    expect(typeof memoSurface.type).toBe('function');
    const renders = vi.spyOn(memoSurface, 'type');
    const draft = createComposerDraft('Before');
    const view = renderComposerSurface({ draft });
    try {
      const input = screen.getByRole('textbox', { name: 'Chat Message Input' });
      const initialRenders = renders.mock.calls.length;
      view.rerenderSurface();
      expect(renders).toHaveBeenCalledTimes(initialRenders);

      act(() => draft.set('After'));
      expect(input).toHaveValue('After');
      expect(renders.mock.calls.length).toBeGreaterThan(initialRenders);
      const draftRenders = renders.mock.calls.length;

      view.rerenderSurface({ isRateLimited: true });
      expect(
        screen.getByText(
          'Sending too fast. Please wait a second before your next message.'
        )
      ).toBeVisible();
      expect(renders.mock.calls.length).toBeGreaterThan(draftRenders);
      view.rerenderSurface({ isRateLimited: false });
      expect(
        screen.queryByText(
          'Sending too fast. Please wait a second before your next message.'
        )
      ).not.toBeInTheDocument();
      expect(screen.getByRole('textbox', { name: 'Chat Message Input' })).toBe(
        input
      );
      expect(input).toHaveValue('After');
    } finally {
      view.unmount();
      renders.mockRestore();
    }
  });

  it('keeps the real input and committed work state current without a parent rerender', () => {
    const draft = createComposerDraft('Restored draft');
    const view = renderComposerSurface({ draft });
    const input = screen.getByRole('textbox', { name: 'Chat Message Input' });
    expect(input).toHaveValue('Restored draft');
    expect(getDesktopWorkState()?.hasDraft).toBe(true);

    act(() => draft.set(previous => `${previous} plus an edit`));
    expect(input).toHaveValue('Restored draft plus an edit');

    fireEvent.change(input, {
      target: { value: 'Typed through the real input' },
    });
    expect(draft.getSnapshot()).toBe('Typed through the real input');
    expect(getDesktopWorkState()?.hasDraft).toBe(true);

    act(() => draft.set(''));
    expect(input).toHaveValue('');
    expect(getDesktopWorkState()?.hasDraft).toBe(false);
    view.unmount();
    expect(getDesktopWorkState()).toBeNull();
  });
});

describe('ChatComposerSurface one-chrome-layer wiring', () => {
  it('renders the single usage banner slot by default', () => {
    renderComposerSurface();

    expect(screen.getByTestId('usage-alert-probe')).toBeInTheDocument();
    expect(
      screen.getByRole('textbox', { name: 'Chat Message Input' })
    ).toBeInTheDocument();
  });

  it('suppressUsageAlert hides the banner while the composer stays mounted', () => {
    renderComposerSurface({ suppressUsageAlert: true });

    expect(screen.queryByTestId('usage-alert-probe')).not.toBeInTheDocument();
    expect(
      screen.getByRole('textbox', { name: 'Chat Message Input' })
    ).toBeInTheDocument();
  });
});

describe('ChatThreadMessages virtualized window', () => {
  it('renders the rows the virtualizer reports on every render, not the first window', () => {
    const messages = Array.from({ length: 6 }, (_, index) => ({
      id: `m${index}`,
      role: index % 2 ? ('assistant' as const) : ('user' as const),
      parts: [],
    }));
    let window = [0, 1];
    // One stable object whose state changes between renders, like TanStack Virtual.
    const virtualizer = {
      getVirtualItems: () =>
        window.map(index => ({ index, start: index * 80, key: index })),
      measureElement: () => undefined,
    } as unknown as Virtualizer<HTMLDivElement, Element>;
    const props = {
      messages,
      shouldVirtualizeMessages: true,
      virtualizer,
      virtualizedMessageViewportHeight: 480,
      virtualizedMinHeight: 0,
      messageViewportPaddingBottom: undefined,
      totalSizeRef: () => undefined,
      bottomSentinelRef: () => undefined,
      isStreaming: false,
      lastAssistantIndex: 5,
      knownMessageIds: new Set<string>(),
      inlineChatError: null,
      isStuckToBottom: true,
      onScrollToBottom: () => undefined,
    };
    const view = render(<ChatThreadMessages {...props} />);
    expect(
      screen.getAllByTestId('thread-row').map(row => row.textContent)
    ).toEqual(['m0', 'm1']);

    window = [4, 5];
    view.rerender(<ChatThreadMessages {...props} />);
    expect(
      screen.getAllByTestId('thread-row').map(row => row.textContent)
    ).toEqual(['m4', 'm5']);
  });
});
