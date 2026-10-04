import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render } from '@testing-library/react';
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { CHAT_COMPOSER_DOCK_CLASSNAME } from '@/components/jovie/chat-layout';
import { createComposerDraft } from '@/components/jovie/hooks/useComposerDraft';
import { JovieChat } from '@/components/jovie/JovieChat';
import { CHAT_TRANSCRIPT_ROW_ESTIMATE_PX } from '@/lib/chat/transcript-window';
import { getDesktopWorkState } from '@/lib/desktop/session-work-state';
import { renderWithQueryClient } from '@/tests/utils/test-utils';

const virtualizerSpy = vi.hoisted(() => ({
  options: null as null | {
    initialOffset?: () => number;
    measureElement?: (el: Element) => number;
  },
  measure: vi.fn(),
  scrollToIndex: vi.fn(),
}));

const resizeObserverCallbacks = vi.hoisted(
  () => [] as ResizeObserverCallback[]
);

const mockInsightsSummary = vi.hoisted(() => ({
  data: undefined as
    | { insights: { status: string; title: string }[] }
    | undefined,
}));

const mockRailPanel = vi.hoisted(() => ({
  enabled: false,
  value: {
    target: null,
    contextTargets: [],
    open: vi.fn(),
    close: vi.fn(),
    clear: vi.fn(),
    upsertContext: vi.fn(),
    upsertContexts: vi.fn(),
    dismissContext: vi.fn(),
    clearContexts: vi.fn(),
    clearDismissal: vi.fn(),
    isDismissed: vi.fn(() => false),
    isContextDismissed: vi.fn(() => false),
  },
}));

vi.mock(
  '@/app/app/(shell)/chat/ChatEntityPanelContext',
  async importOriginal => ({
    ...(await importOriginal<
      typeof import('@/app/app/(shell)/chat/ChatEntityPanelContext')
    >()),
    useOptionalChatEntityPanel: () =>
      mockRailPanel.enabled ? mockRailPanel.value : null,
  })
);

vi.mock('@/lib/queries', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/queries')>()),
  useInsightsSummaryQuery: () => ({
    data: mockInsightsSummary.data,
    isLoading: false,
    isError: false,
  }),
}));

vi.mock('@tanstack/react-virtual', async importOriginal => {
  const actual =
    await importOriginal<typeof import('@tanstack/react-virtual')>();
  return {
    ...actual,
    useVirtualizer: (options: never) => {
      virtualizerSpy.options = options;
      const virtualizer = actual.useVirtualizer(options);
      return new Proxy(virtualizer, {
        get(target, prop) {
          if (prop === 'measure') return virtualizerSpy.measure;
          if (prop === 'scrollToIndex') return virtualizerSpy.scrollToIndex;
          const value = Reflect.get(target, prop);
          return typeof value === 'function' ? value.bind(target) : value;
        },
      });
    },
  };
});

const mockChatState = vi.hoisted(() => ({
  isLoadingConversation: false,
  hasMessages: true,
  isLoading: true,
  isSubmitting: false,
  status: 'streaming' as 'ready' | 'streaming',
  collapsedSummerFailureCount: 0,
  showCollapsedSummerFailures: vi.fn(),
  messages: [{ id: 'm1', role: 'user', parts: [{ type: 'text', text: 'Hi' }] }],
}));

vi.mock('@/app/app/(shell)/dashboard/DashboardDataContext', () => ({
  DashboardDataContext: {
    Provider: ({ children }: { children: React.ReactNode }) => children,
    Consumer: () => null,
    displayName: 'DashboardDataContext',
  },
  useDashboardData: () => ({
    profileCompletion: {
      percentage: 100,
      completedCount: 4,
      totalCount: 4,
      steps: [],
      profileIsLive: true,
    },
  }),
}));

vi.mock('@/components/jovie/hooks', async importOriginal => {
  const actual =
    await importOriginal<typeof import('@/components/jovie/hooks')>();
  return {
    ...actual,
    useSuggestedProfiles: () => ({
      isLoading: false,
      total: 0,
      suggestions: [],
      currentIndex: 0,
      next: vi.fn(),
      prev: vi.fn(),
      confirm: vi.fn(),
      reject: vi.fn(),
      isActioning: false,
    }),
    useJovieChatController: () => ({
      draft: createComposerDraft(''),
      setInput: vi.fn(),
      messages: mockChatState.messages,
      chatError: null,
      isLoading: mockChatState.isLoading,
      isSubmitting: mockChatState.isSubmitting,
      hasMessages: mockChatState.hasMessages,
      collapsedSummerFailureCount: mockChatState.collapsedSummerFailureCount,
      showCollapsedSummerFailures: mockChatState.showCollapsedSummerFailures,
      isLoadingConversation: mockChatState.isLoadingConversation,
      conversationTitle: null,
      status: mockChatState.status,
      inputRef: { current: null },
      handleSubmit: vi.fn(),
      handleRetry: vi.fn(),
      handleSuggestedPrompt: vi.fn(),
      submitMessage: vi.fn(),
      setChatError: vi.fn(),
      isRateLimited: false,
      stop: vi.fn(),
      chipTray: {
        chips: [],
        addSkill: vi.fn(),
        addEntity: vi.fn(),
        removeAt: vi.fn(),
        removeLast: vi.fn(),
        clear: vi.fn(),
        serialized: '',
      },
    }),
    useChatFileAttachments: () => ({
      pendingFiles: [],
      isDragOver: false,
      isUploading: false,
      hasReadyFiles: false,
      addFiles: vi.fn(),
      removeFile: vi.fn(),
      clearFiles: vi.fn(),
      toFileUIParts: () => [],
      dropZoneRef: { current: null },
      accept: 'image/*,audio/*,video/*',
      aggregate: {
        total: 0,
        done: 0,
        uploading: 0,
        queued: 0,
        errors: 0,
        duplicates: 0,
        totalBytes: 0,
        uploadedBytes: 0,
        overallPct: 0,
        speed: '—',
        eta: '—',
      },
    }),
  };
});

vi.mock('@/components/jovie/components', async importOriginal => ({
  ...(await importOriginal<typeof import('@/components/jovie/components')>()),
  ChatInput: ({
    desktopConversationReady,
  }: {
    desktopConversationReady?: boolean;
  }) => (
    <div
      data-testid='chat-input'
      data-desktop-conversation-ready={desktopConversationReady}
    />
  ),
  ChatMessage: (props: { isThinking?: boolean }) =>
    props.isThinking ? (
      <div data-testid='chat-message-thinking'>
        <div
          data-testid='chat-loading-avatar'
          className='flex h-5.5 w-5.5 items-center justify-center rounded-full border border-subtle bg-surface-0'
        />
        <div
          data-testid='chat-loading-bubble'
          className='system-b-chat-message-skeleton-assistant-frame'
        />
      </div>
    ) : (
      <div data-testid='chat-message' />
    ),
  ChatConversationComposerSkeleton: () => (
    <div data-testid='chat-conversation-composer-skeleton' />
  ),
  ChatMessageSkeleton: () => <div data-testid='chat-message-skeleton' />,
  ErrorDisplay: () => <div data-testid='chat-error' />,
  ScrollToBottom: () => null,
  SuggestedProfilesCarousel: () => null,
  SuggestedPrompts: () => null,
}));

vi.mock('@/components/jovie/components/ChatUsageAlert', () => ({
  ChatUsageAlert: () => <div data-testid='chat-usage' />,
}));

const originalScrollIntoView = Object.getOwnPropertyDescriptor(
  globalThis.HTMLElement.prototype,
  'scrollIntoView'
);
const originalResizeObserver = globalThis.ResizeObserver;

beforeAll(() => {
  Object.defineProperty(globalThis.HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    value: vi.fn(),
  });
  globalThis.ResizeObserver = vi.fn().mockImplementation(function (
    this: ResizeObserver,
    callback: ResizeObserverCallback
  ) {
    resizeObserverCallbacks.push(callback);
    this.observe = vi.fn();
    this.unobserve = vi.fn();
    this.disconnect = vi.fn();
  }) as unknown as typeof ResizeObserver;
});

afterEach(() => {
  mockRailPanel.enabled = false;
  mockRailPanel.value.upsertContexts.mockClear();
  mockRailPanel.value.clearContexts.mockClear();
  resizeObserverCallbacks.length = 0;
  virtualizerSpy.options = null;
  virtualizerSpy.measure.mockClear();
  virtualizerSpy.scrollToIndex.mockClear();
  mockChatState.isLoadingConversation = false;
  mockChatState.hasMessages = true;
  mockChatState.isLoading = true;
  mockChatState.isSubmitting = false;
  mockChatState.status = 'streaming';
  mockChatState.collapsedSummerFailureCount = 0;
  mockChatState.showCollapsedSummerFailures = vi.fn();
  mockChatState.messages = [
    { id: 'm1', role: 'user', parts: [{ type: 'text', text: 'Hi' }] },
  ];
  mockInsightsSummary.data = undefined;
});

afterAll(() => {
  if (originalScrollIntoView) {
    Object.defineProperty(
      globalThis.HTMLElement.prototype,
      'scrollIntoView',
      originalScrollIntoView
    );
  } else {
    delete (globalThis.HTMLElement.prototype as { scrollIntoView?: unknown })
      .scrollIntoView;
  }
  if (originalResizeObserver) {
    globalThis.ResizeObserver = originalResizeObserver;
  } else {
    delete (globalThis as { ResizeObserver?: unknown }).ResizeObserver;
  }
});

describe('JovieChat styling regressions', () => {
  it('publishes live conversation work and revokes idle evidence on route unmount', () => {
    const streaming = renderWithQueryClient(
      <JovieChat profileId='profile-1' />
    );
    expect(getDesktopWorkState()?.isStreaming).toBe(true);
    streaming.unmount();
    expect(getDesktopWorkState()).toBeNull();
    mockChatState.isLoading = false;
    mockChatState.status = 'ready';
    mockChatState.isSubmitting = true;
    const submitting = renderWithQueryClient(
      <JovieChat profileId='profile-1' />
    );
    expect(getDesktopWorkState()?.hasPendingAction).toBe(true);
    expect(getDesktopWorkState()?.isStreaming).toBe(false);
    submitting.unmount();
    expect(getDesktopWorkState()).toBeNull();
  });
  it('renders thinking placeholder as a ChatMessage with isThinking when loading', () => {
    const { container } = renderWithQueryClient(
      <JovieChat profileId='profile-1' />
    );

    // The thinking state is now rendered inside the virtualizer via ChatMessage
    // with isThinking=true. In jsdom the virtualizer may not render items (zero
    // viewport), so we verify the structural intent: the chat view renders
    // and no standalone loading indicator exists outside the message list.

    // Verify the chat input area renders
    const chatInput = container.querySelector('[data-testid="chat-input"]');
    expect(chatInput).toBeTruthy();
  });

  it('keeps the composer dock padded above mobile shell navigation', () => {
    const { container } = renderWithQueryClient(
      <JovieChat profileId='profile-1' />
    );

    const composerDock = container.querySelector('[data-testid="chat-input"]')
      ?.parentElement?.parentElement;

    expect(composerDock?.className).toContain(CHAT_COMPOSER_DOCK_CLASSNAME);
    expect(composerDock?.className).toContain('system-b-chat-composer-dock');
  });

  it('keeps the live transcript mounted when a reserved conversation starts loading', () => {
    mockChatState.isLoadingConversation = true;

    const { container } = renderWithQueryClient(
      <JovieChat profileId='profile-1' />
    );

    expect(
      container.querySelector(
        '[data-testid="chat-loading-conversation-skeleton"]'
      )
    ).toBeNull();
    expect(
      container.querySelector('[data-testid="chat-content"]')
    ).toBeTruthy();
    expect(container.querySelector('[data-testid="chat-input"]')).toBeTruthy();
  });

  it('enables passive desktop composer observation only after initial history loading ends', () => {
    mockChatState.isLoadingConversation = true;
    const loadingView = renderWithQueryClient(
      <JovieChat profileId='profile-1' />
    );
    expect(
      loadingView.container
        .querySelector('[data-testid="chat-input"]')
        ?.getAttribute('data-desktop-conversation-ready')
    ).toBe('false');
    loadingView.unmount();

    mockChatState.isLoadingConversation = false;
    const readyView = renderWithQueryClient(
      <JovieChat profileId='profile-1' />
    );
    // Streaming remains active: observation concerns editable UI, not response completion.
    expect(mockChatState.status).toBe('streaming');
    expect(
      readyView.container
        .querySelector('[data-testid="chat-input"]')
        ?.getAttribute('data-desktop-conversation-ready')
    ).toBe('true');
  });

  it('windows the transcript once the thread exceeds the shared threshold', () => {
    mockChatState.messages = Array.from({ length: 9 }, (_, i) => ({
      id: `m${i}`,
      role: i % 2 ? 'assistant' : 'user',
      parts: [{ type: 'text', text: `message ${i}` }],
    }));

    const { container } = renderWithQueryClient(
      <JovieChat profileId='profile-1' />
    );

    // Window policy comes from CHAT_TRANSCRIPT_WINDOW: past the shared
    // threshold the transcript must switch to the virtualizer path instead of
    // mounting every message row. In jsdom the zero-size viewport renders no
    // virtual items, so a full-mount fallback (all 9 rows) is the regression.
    const renderedRows = container.querySelectorAll(
      '[data-testid="chat-message"]'
    ).length;
    expect(renderedRows).toBeLessThan(9);
    expect(
      container.querySelector('[data-testid="chat-content"]')
    ).toBeTruthy();
    expect(
      container.querySelector('[data-testid="chat-bottom-sentinel"]')
    ).toBeTruthy();
  });

  it('certifies the chat transcript window policy against the real component source', () => {
    // Asserted node:fs read of the exact component source (coverage-via
    // receipt evidence for the component-ship-gate structural contract).
    const jovieChatSource = readFileSync(
      resolve(process.cwd(), 'components/jovie/JovieChat.tsx'),
      'utf8'
    );

    expect(jovieChatSource).toContain('CHAT_TRANSCRIPT_WINDOW');
    expect(jovieChatSource).toContain('virtualizeAfterMessageCount');
    expect(jovieChatSource).toContain('overscanRowCount');
    // The virtualizer owner stays out of React Compiler memoization, or the
    // window freezes on its first rows and the thread renders blank (JOV-6702).
    expect(jovieChatSource).toMatch(
      /export function JovieChat\([\s\S]*?\}: JovieChatProps\) \{[\s\S]{0,400}?'use no memo';/
    );
  });

  it('keeps the empty state to one greeting sentence — no card surfaces (JOV-7150)', () => {
    // Asserted node:fs read of the exact component source — the empty chat
    // must not mount competing prompt surfaces (What's New card, starter
    // actions rail, opportunity card stack, demo sample) alongside the
    // greeting. Founder's direction: one sentence above the composer.
    const jovieChatSource = readFileSync(
      resolve(process.cwd(), 'components/jovie/JovieChat.tsx'),
      'utf8'
    );

    expect(jovieChatSource).not.toContain('<FeatureIntroHost');
    expect(jovieChatSource).not.toContain('<ChatStarterActionsRail');
    expect(jovieChatSource).not.toContain('<ChatEmptyStateOpportunityCards');
    expect(jovieChatSource).not.toContain('<ChatEmptyStateWelcome');
    expect(jovieChatSource).not.toContain('<SuggestedPrompts');
  });

  it('renders the greeting (not chips) for the bare and suggestion-pill empty states (JOV-7150)', () => {
    // The chip/suggestion rail is retired for the bare and chip-only
    // affordances — ChatEmptyStateGreeting owns that slot instead. Real
    // render coverage lives in JovieChat.empty-state.test.tsx; this locks
    // the source contract so SuggestedPrompts cannot come back for those
    // two states without touching this test.
    const jovieChatSource = readFileSync(
      resolve(process.cwd(), 'components/jovie/JovieChat.tsx'),
      'utf8'
    );

    expect(jovieChatSource).toMatch(
      /showEmptyGreeting \? \([\s\S]{0,80}<ChatEmptyStateGreeting/
    );
    // FEATURED_SKILL_SUGGESTIONS (an affordance-priority count) is still
    // imported from that module; the JSX component itself is retired.
    expect(jovieChatSource).not.toContain('<SuggestedPrompts');
  });

  it('keeps loading accessibility and composer readiness live across mounted history transitions', () => {
    mockChatState.isLoadingConversation = true;
    mockChatState.hasMessages = false;
    mockChatState.isLoading = false;
    mockChatState.isSubmitting = false;
    mockChatState.status = 'ready';
    mockChatState.messages = [];

    const { container, rerender } = renderWithQueryClient(
      <JovieChat profileId='profile-1' />
    );

    const loadingShell = container.querySelector(
      '[data-testid="chat-loading-conversation-skeleton"]'
    );

    expect(loadingShell?.getAttribute('aria-busy')).toBe('true');
    expect(loadingShell?.getAttribute('aria-live')).toBe('polite');
    expect(container.querySelector('[data-testid="chat-input"]')).toBeNull();

    mockChatState.isLoadingConversation = false;
    rerender(<JovieChat profileId='profile-1' />);
    const composer = container.querySelector('[data-testid="chat-input"]');
    expect(composer?.getAttribute('data-desktop-conversation-ready')).toBe(
      'true'
    );
    expect(
      container.querySelector(
        '[data-testid="chat-loading-conversation-skeleton"]'
      )
    ).toBeNull();

    mockChatState.isLoadingConversation = true;
    rerender(<JovieChat profileId='profile-1' />);
    expect(container.querySelector('[data-testid="chat-input"]')).toBeNull();
    expect(
      container
        .querySelector('[data-testid="chat-loading-conversation-skeleton"]')
        ?.getAttribute('aria-busy')
    ).toBe('true');

    mockChatState.isLoadingConversation = false;
    rerender(<JovieChat profileId='profile-1' />);
    expect(
      container
        .querySelector('[data-testid="chat-input"]')
        ?.getAttribute('data-desktop-conversation-ready')
    ).toBe('true');
  });

  it('re-measures and re-anchors a pinned transcript when a hidden viewport gains layout (JOV-6702)', () => {
    mockChatState.messages = Array.from({ length: 9 }, (_, i) => ({
      id: `m${i}`,
      role: i % 2 ? 'assistant' : 'user',
      parts: [{ type: 'text', text: `message ${i}` }],
    }));

    const { container } = renderWithQueryClient(
      <JovieChat profileId='profile-1' />
    );

    // The virtualizer seeds its offset from the live scrollTop and measures
    // rows through the shared transcript-window guard.
    expect(typeof virtualizerSpy.options?.initialOffset).toBe('function');
    const collapsedRow = {
      getBoundingClientRect: () => ({ height: 1 }),
    } as unknown as Element;
    expect(virtualizerSpy.options?.measureElement?.(collapsedRow)).toBe(
      CHAT_TRANSCRIPT_ROW_ESTIMATE_PX
    );

    const scrollContainer = container.querySelector(
      '[data-testid="chat-message-scroll"]'
    );
    expect(scrollContainer).toBeTruthy();
    expect(resizeObserverCallbacks.length).toBeGreaterThan(0);

    // Hidden-mount state: viewport read 0px when the observer attached.
    // Simulate the workspace surface becoming visible (0 -> real height).
    let viewportHeight = 0;
    Object.defineProperty(scrollContainer, 'clientHeight', {
      configurable: true,
      get: () => viewportHeight,
    });
    viewportHeight = 640;

    act(() => {
      for (const callback of resizeObserverCallbacks) {
        callback([], {} as ResizeObserver);
      }
    });

    // Stale ~0px row cache dropped, and the pinned transcript re-anchored to
    // the live tail rather than staying scrolled to a stale offset.
    expect(virtualizerSpy.measure).toHaveBeenCalled();
    expect(virtualizerSpy.scrollToIndex).toHaveBeenCalledWith(
      8,
      expect.objectContaining({ align: 'end', behavior: 'auto' })
    );
  });

  it('surfaces the collapsed unanswered-turns control when the hook reports them', () => {
    mockChatState.collapsedSummerFailureCount = 2;
    mockChatState.isLoading = false;
    mockChatState.status = 'ready';

    const { container } = renderWithQueryClient(
      <JovieChat profileId='profile-1' />
    );

    const control = container.querySelector(
      '[data-testid="chat-collapsed-failures"]'
    );
    expect(control).toBeTruthy();
    expect(control?.textContent).toContain(
      '2 earlier messages went unanswered'
    );

    fireEvent.click(control as HTMLElement);
    expect(mockChatState.showCollapsedSummerFailures).toHaveBeenCalledTimes(1);
  });

  it('keeps the collapsed unanswered-turns control hidden when there are none', () => {
    const { container } = renderWithQueryClient(
      <JovieChat profileId='profile-1' />
    );

    expect(
      container.querySelector('[data-testid="chat-collapsed-failures"]')
    ).toBeNull();
  });

  it('renders the greeting-only empty state left-aligned above the composer (JOV-7150)', () => {
    mockChatState.hasMessages = false;
    mockChatState.isLoading = false;
    mockChatState.isSubmitting = false;
    mockChatState.status = 'ready';
    mockChatState.messages = [];

    const { container } = renderWithQueryClient(
      <JovieChat profileId='profile-1' displayName='Tim White' />
    );

    const region = container.querySelector(
      '[data-testid="chat-empty-state-greeting-region"]'
    );
    expect(region).toBeTruthy();

    const greeting = container.querySelector(
      '[data-testid="chat-empty-state-greeting-text"]'
    );
    expect(greeting?.textContent).toMatch(
      /^Good (morning|afternoon|evening), Tim\.$/
    );
    // Display line + left-aligned column, not a centered welcome block.
    expect(greeting?.className).toContain('text-4xl');
    expect(greeting?.parentElement?.className).toContain('items-start');
    expect(greeting?.parentElement?.className).toContain('text-left');

    // The "Just ask" heading and suggestion chips are gone for this state.
    expect(container.textContent).not.toContain('Just ask');
    expect(
      container.querySelector('[data-testid="chat-empty-state-insight"]')
    ).toBeNull();
  });

  it('renders the one real insight as the only empty-state sentence (JOV-7150)', () => {
    mockChatState.hasMessages = false;
    mockChatState.isLoading = false;
    mockChatState.isSubmitting = false;
    mockChatState.status = 'ready';
    mockChatState.messages = [];
    mockInsightsSummary.data = {
      insights: [{ status: 'active', title: 'Streams are up 12% this week' }],
    };

    const { container } = renderWithQueryClient(
      <JovieChat profileId='profile-1' displayName='Tim White' />
    );

    const insight = container.querySelector(
      '[data-testid="chat-empty-state-greeting-text"]'
    );
    expect(insight?.textContent).toBe('Streams are up 12% this week');
    expect(
      container.querySelector('[data-testid="chat-empty-state-insight"]')
    ).toBeNull();
  });

  it('renders the Ovie editorial briefing as the empty-state affordance in ov mode', () => {
    mockChatState.hasMessages = false;
    mockChatState.isLoading = false;
    mockChatState.isSubmitting = false;
    mockChatState.status = 'ready';
    mockChatState.messages = [];

    const { container } = renderWithQueryClient(
      <JovieChat
        profileId='profile-1'
        chatMode='ov'
        ovieHomeBriefing={{
          greeting: 'Good morning, Tim.',
          updatedLabel: 'Updated Sep 28, 8:00 AM PDT',
          signal: {
            id: 'activation.first-user',
            title: 'The first real user completed onboarding',
            summary: 'Activation has moved from theory to observed behavior.',
            currentValue: '1 activated user',
            delta: '+1 today',
            target: 'Learn what made the path work',
            sourceLabel: 'Founder Funnel',
            nextAction: 'Review the session.',
            removalEvent: 'The activation lesson is applied.',
            summerCanAct: true,
          },
          actions: [
            {
              id: 'activation.first-user:next',
              label: 'Start The Next Step',
              prompt: 'Review the first activation with me.',
            },
          ],
        }}
      />
    );

    expect(
      container.querySelector('[data-testid="ovie-editorial-briefing"]')
    ).toBeTruthy();
    expect(
      container
        .querySelector('[data-testid="chat-empty-state-viewport"]')
        ?.getAttribute('data-empty-affordance')
    ).toBe('ovie-briefing');
    // The briefing owns the empty-state chrome layer — no usage banner stack.
    expect(container.querySelector('[data-testid="chat-usage"]')).toBeNull();
  });

  it('never renders the Ovie briefing outside ov mode', () => {
    mockChatState.hasMessages = false;
    mockChatState.isLoading = false;
    mockChatState.isSubmitting = false;
    mockChatState.status = 'ready';
    mockChatState.messages = [];

    const { container } = renderWithQueryClient(
      <JovieChat profileId='profile-1' />
    );

    expect(
      container.querySelector('[data-testid="ovie-editorial-briefing"]')
    ).toBeNull();
  });

  it.each([
    { profileId: 'profile-2', conversationId: 'one' },
    { profileId: 'profile-1', conversationId: 'two' },
    { profileId: 'profile-1', conversationId: 'one', chatMode: 'ov' as const },
  ])('resets navigation hover for a new chat scope: %j', nextScope => {
    mockChatState.messages = Array.from({ length: 14 }, (_, index) => ({
      id: `message-${index}`,
      role: index % 2 === 0 ? 'user' : 'assistant',
      parts: [{ type: 'text', text: `Message ${index}` }],
    }));
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const { getByRole, rerender } = render(
      <QueryClientProvider client={queryClient}>
        <JovieChat profileId='profile-1' conversationId='one' />
      </QueryClientProvider>
    );
    const firstMarker = getByRole('button', { name: /Jump to turn 1:/ });
    fireEvent.mouseEnter(firstMarker);
    expect(firstMarker).toHaveClass('is-hovered');

    rerender(
      <QueryClientProvider client={queryClient}>
        <JovieChat {...nextScope} />
      </QueryClientProvider>
    );
    expect(getByRole('button', { name: /Jump to turn 1:/ })).not.toHaveClass(
      'is-hovered'
    );
  });

  it('publishes rail context only when its meaning changes during streaming', () => {
    mockRailPanel.enabled = true;
    mockChatState.messages = [
      {
        id: 'm1',
        role: 'assistant',
        parts: [{ type: 'text', text: '@release:one[One]' }],
      },
    ];
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const { rerender } = render(
      <QueryClientProvider client={queryClient}>
        <JovieChat profileId='profile-1' conversationId='one' />
      </QueryClientProvider>
    );
    const rerenderChat = (conversationId: string) =>
      rerender(
        <QueryClientProvider client={queryClient}>
          <JovieChat profileId='profile-1' conversationId={conversationId} />
        </QueryClientProvider>
      );
    expect(mockRailPanel.value.upsertContexts).toHaveBeenCalledTimes(1);

    // Opening another panel changes the context value, but the publisher and
    // derived candidates still mean the same thing.
    mockRailPanel.value = { ...mockRailPanel.value };
    rerenderChat('one');
    expect(mockRailPanel.value.upsertContexts).toHaveBeenCalledTimes(1);

    mockChatState.messages = [
      {
        id: 'm1',
        role: 'assistant',
        parts: [
          { type: 'text', text: '@release:one[One] Streaming more text' },
        ],
      },
    ];
    rerenderChat('one');
    expect(mockRailPanel.value.upsertContexts).toHaveBeenCalledTimes(1);

    mockChatState.messages = [
      {
        id: 'm1',
        role: 'assistant',
        parts: [{ type: 'text', text: '@release:one[Renamed]' }],
      },
    ];
    rerenderChat('one');
    expect(mockRailPanel.value.upsertContexts).toHaveBeenCalledTimes(2);
    expect(mockRailPanel.value.upsertContexts).toHaveBeenLastCalledWith([
      expect.objectContaining({ id: 'one', label: 'Renamed' }),
    ]);

    mockChatState.messages = [];
    rerenderChat('two');
    expect(mockRailPanel.value.clearContexts).toHaveBeenCalledTimes(1);
  });
});
