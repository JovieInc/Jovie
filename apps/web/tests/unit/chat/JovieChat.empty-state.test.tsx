import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createComposerDraft } from '@/components/jovie/hooks/useComposerDraft';

import { JovieChat } from '@/components/jovie/JovieChat';
import type { OvieHomeBriefing } from '@/lib/ovie/home-briefing';
import { renderWithQueryClient } from '@/tests/utils/test-utils';

const ovieHomeBriefing: OvieHomeBriefing = {
  greeting: 'Good morning, Tim.',
  updatedLabel: 'Updated Sep 28, 8:00 AM PDT',
  signal: {
    id: 'activation.first-user',
    title: 'The first real user completed onboarding',
    summary: 'Activation moved from theory to observed behavior.',
    currentValue: '1 activated user',
    delta: '+1 today',
    target: 'Preserve the shortest successful path',
    sourceLabel: 'Founder Funnel',
    nextAction: 'Review the session.',
    removalEvent: 'The activation lesson is recorded.',
    summerCanAct: true,
  },
  actions: [
    {
      id: 'activation.first-user:next',
      label: 'Start The Next Step',
      prompt: 'Review the first activation with me.',
    },
    {
      id: 'activation.first-user:evidence',
      label: 'Show The Evidence',
      prompt: 'Show the activation evidence.',
    },
    {
      id: 'activation.first-user:clear',
      label: 'Review The Clear Condition',
      prompt: 'Review the activation clear condition.',
    },
  ],
};

const mockChatState = {
  input: '',
  setInput: vi.fn(),
  messages: [],
  chatError: null,
  isLoading: false,
  isSubmitting: false,
  hasMessages: false,
  isLoadingConversation: false,
  conversationTitle: null,
  status: 'ready',
  inputRef: { current: null },
  handleSubmit: vi.fn(),
  handleRetry: vi.fn(),
  handleSuggestedPrompt: vi.fn(),
  submitMessage: vi.fn(),
  setChatError: vi.fn(),
  isRateLimited: false,
  stop: vi.fn(),
  chipTray: {
    chips: [] as Array<{ type: 'skill'; id: string; uid: string }>,
    addSkill: vi.fn(),
    addEntity: vi.fn(),
    removeAt: vi.fn(),
    removeLast: vi.fn(),
    clear: vi.fn(),
    serialized: '',
  },
};

let mockSearchParams = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn().mockResolvedValue(undefined),
  }),
  usePathname: () => '/app/chat',
  useSearchParams: () => mockSearchParams,
  useParams: () => ({}),
  redirect: vi.fn(),
  notFound: vi.fn(),
}));

vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: ({ count }: { count: number }) => ({
    getTotalSize: () => count * 80,
    getVirtualItems: () =>
      Array.from({ length: count }, (_, index) => ({
        index,
        key: index,
        start: index * 80,
      })),
    measureElement: () => undefined,
    scrollToIndex: vi.fn(),
  }),
}));

vi.mock('@/components/jovie/hooks', () => ({
  useJovieChatController: () => ({
    ...mockChatState,
    draft: createComposerDraft(mockChatState.input),
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
  useStickToBottom: () => ({
    isStuckToBottom: true,
    setStuckToBottom: vi.fn(),
    onScroll: vi.fn(),
    totalSizeRef: vi.fn(),
    scrollContainerRef: { current: null },
    bottomSentinelRef: vi.fn(),
  }),
  useChatJankMonitor: () => ({
    onSend: vi.fn(),
    getSummary: () => ({
      conversationId: null,
      jankEventCount: 0,
      messageDisappearCount: 0,
      duplicateCount: 0,
      reorderCount: 0,
      tokenRollbackCount: 0,
      streamStallCount: 0,
      unexpectedScrollJumpCount: 0,
      noVisibleFeedbackCount: 0,
      isJankFree: true,
    }),
  }),
}));

const mockPendingOpportunityCards: Array<{
  readonly id: string;
  readonly typeLabel: string;
  readonly createdAt: string;
  readonly title: string;
  readonly why: string;
  readonly primaryActionLabel: string;
  readonly status: 'pending';
  readonly category: 'suggestion';
}> = [];

const mockOpportunityQueryOptions = vi.fn();

let mockInsightsSummary: {
  readonly insights: Array<{ readonly status: string; readonly title: string }>;
  readonly totalActive: number;
  readonly lastGeneratedAt: string | null;
} = { insights: [], totalActive: 0, lastGeneratedAt: null };

vi.mock('@/lib/queries', () => ({
  queryKeys: {
    releases: {
      matrix: (profileId: string) => ['releases', 'matrix', profileId],
    },
    events: {
      list: (profileId: string) => ['events', 'list', profileId],
    },
  },
  usePlanGate: () => ({
    isPro: true,
    chatFileUploadLimit: null,
    isLoading: false,
    isError: false,
  }),
  usePendingOpportunityCardsQuery: (options: { enabled?: boolean }) => {
    mockOpportunityQueryOptions(options);
    return {
      data: mockPendingOpportunityCards,
      isLoading: false,
      isError: false,
    };
  },
  useInsightsSummaryQuery: () => ({
    data: mockInsightsSummary,
    isLoading: false,
    isError: false,
  }),
}));

vi.mock('@/components/jovie/components', async () => {
  const actual = await vi.importActual<
    typeof import('@/components/jovie/components')
  >('@/components/jovie/components');

  return {
    ...actual,
    ChatInput: ({
      placeholder,
      quickActions,
      variant,
    }: {
      readonly placeholder?: string;
      readonly quickActions?: readonly { readonly label: string }[];
      readonly variant?: string;
    }) => (
      <div
        data-placeholder={placeholder}
        data-quick-actions={quickActions?.map(action => action.label).join('|')}
        data-variant={variant}
        data-testid='chat-input'
      />
    ),
    ChatMessage: () => <div data-testid='chat-message' />,
    ChatMessageSkeleton: () => <div data-testid='chat-message-skeleton' />,
    ErrorDisplay: () => <div data-testid='chat-error' />,
    ScrollToBottom: () => null,
  };
});

vi.mock('@/components/jovie/components/ChatUsageAlert', () => ({
  ChatUsageAlert: () => <div data-testid='chat-usage' />,
}));

describe('JovieChat empty state', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    window.sessionStorage.clear();
    mockSearchParams = new URLSearchParams();
    mockPendingOpportunityCards.length = 0;
    mockInsightsSummary = {
      insights: [],
      totalActive: 0,
      lastGeneratedAt: null,
    };
    mockChatState.input = '';
    mockChatState.messages = [];
    mockChatState.hasMessages = false;
    mockChatState.isLoading = false;
    mockChatState.isSubmitting = false;
    mockChatState.chipTray.chips = [];
  });

  it('renders a stable docked composer with the greeting-only empty state when no skill is featured (JOV-7150)', () => {
    // 9am fixed clock: the greeting is time-of-day-dependent ("Good
    // morning"/"afternoon"/"evening"), so pin the system time to assert the
    // exact text without the test being time-of-day flaky.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T09:00:00'));
    const { container, getByTestId, queryByTestId, queryByText } =
      renderWithQueryClient(
        <JovieChat profileId='profile-1' displayName='Tim White' />
      );

    expect(queryByTestId('chat-empty-state-top-signals')).toBeNull();
    expect(queryByTestId('chat-empty-thread-ornament')).toBeNull();
    expect(queryByText('What are we working on?')).toBeNull();
    expect(queryByText('Welcome back')).toBeNull();
    expect(queryByText("Hey, I'm Jovie.")).toBeNull();
    const emptyViewport = getByTestId('chat-empty-state-viewport');
    expect(emptyViewport.className).toContain('flex-1');
    expect(emptyViewport).toHaveAttribute('data-empty-affordance', 'greeting');
    // one-chrome-layer-v1: no suggest/card chrome layer is showing, so the
    // single banner slot is allowed to render on the bare welcome.
    expect(getByTestId('chat-usage')).toBeTruthy();
    expect(getByTestId('chat-empty-state-composer-region')).toBeTruthy();
    // JOV-7150: greeting + first name, no insight (none supplied) — no "Just
    // ask" heading, no sample conversation, no chips, no cards.
    expect(queryByTestId('chat-empty-state-welcome')).toBeNull();
    expect(queryByTestId('chat-empty-state-logo')).toBeNull();
    expect(getByTestId('chat-empty-state-greeting-text').textContent).toBe(
      'Good morning, Tim.'
    );
    expect(queryByTestId('chat-empty-state-insight')).toBeNull();
    expect(queryByText('Just ask')).toBeNull();
    expect(queryByTestId('chat-empty-state-sample')).toBeNull();
    expect(queryByText(/artist/i)).toBeNull();
    expect(getByTestId('chat-empty-state-viewport')).toHaveAttribute(
      'data-top-spacing-owner',
      'chat-empty-viewport'
    );
    expect(getByTestId('chat-empty-state-viewport')).toHaveAttribute(
      'data-grid-anchor',
      'desktop-content'
    );
    // The greeting now fills the composer region's `above` slot (like the
    // other empty-state affordances), so the region no longer claims top
    // spacing for itself — the above content owns it, same as starter-
    // actions/opportunity-cards.
    expect(getByTestId('chat-empty-state-composer-region')).not.toHaveAttribute(
      'data-top-spacing-owner'
    );
    expect(queryByText("What's next?")).toBeNull();
    expect(getByTestId('chat-empty-state-centered-composer')).toBeTruthy();
    expect(getByTestId('chat-message-scroll').className).toContain('pt-0');
    // JOV-7150: the greeting sentence is the only surface above the composer —
    // no What's New card, no starter actions, no prompt rails.
    expect(queryByTestId('feature-intro-card')).toBeNull();
    expect(queryByTestId('chat-empty-state-action-card-slot')).toBeNull();
    expect(queryByTestId('chat-composer-dock')).toBeNull();
    expect(queryByTestId('chat-empty-state-soft-suggestions-slot')).toBeNull();
    expect(queryByTestId('suggested-prompts-rail')).toBeNull();
    expect(getByTestId('chat-input')).toBeTruthy();
    expect(getByTestId('chat-input').getAttribute('data-placeholder')).toBe('');
    expect(getByTestId('chat-input').getAttribute('data-variant')).toBe('hero');
    const fileInput =
      container.querySelector<HTMLInputElement>('input[type="file"]');
    expect(fileInput).not.toBeNull();
    expect(fileInput).toHaveClass('hidden');
    expect(fileInput).toHaveAttribute('tabindex', '-1');
    const audioInput = container.querySelector<HTMLInputElement>(
      '[data-testid="chat-audio-file-input"]'
    );
    expect(audioInput).not.toBeNull();
    expect(audioInput).toHaveClass('hidden');
    expect(audioInput?.accept).toContain('audio/mpeg');
    expect(queryByText('Share Feedback')).toBeNull();
    // Old task-list-style actions should NOT appear — they belong in the profile switcher.
    expect(queryByText('Preview profile')).toBeNull();
    expect(queryByText('Change photo')).toBeNull();
    expect(queryByText('Release link')).toBeNull();
    vi.useRealTimers();
  });

  it('renders the insight sentence when a real active insight exists (JOV-7150)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T09:00:00'));
    mockInsightsSummary = {
      insights: [
        { status: 'active', title: 'Your streams are up 320% today.' },
        { status: 'dismissed', title: 'Ignore me, not active.' },
      ],
      totalActive: 1,
      lastGeneratedAt: '2026-09-29T00:00:00.000Z',
    };
    const { getByTestId, queryByText, queryByTestId } = renderWithQueryClient(
      <JovieChat profileId='profile-1' displayName='Tim White' />
    );

    expect(getByTestId('chat-empty-state-greeting-text').textContent).toBe(
      'Your streams are up 320% today.'
    );
    expect(queryByText('Good morning, Tim.')).toBeNull();
    expect(queryByTestId('chat-empty-state-insight')).toBeNull();
    vi.useRealTimers();
  });

  it('never fabricates an insight when there is no real one (JOV-7150)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T09:00:00'));
    mockInsightsSummary = {
      insights: [],
      totalActive: 0,
      lastGeneratedAt: null,
    };
    const { getByTestId, queryByTestId } = renderWithQueryClient(
      <JovieChat
        profileId='profile-1'
        displayName='Tim White'
        isFirstSession={false}
        isProfileComplete={false}
      />
    );

    expect(getByTestId('chat-empty-state-greeting-text').textContent).toBe(
      'Good morning, Tim.'
    );
    expect(queryByTestId('chat-empty-state-insight')).toBeNull();
    vi.useRealTimers();
  });

  it('uses Ovie composer copy when chatMode is ov', () => {
    const { getByTestId, queryByText } = renderWithQueryClient(
      <JovieChat profileId='profile-1' chatMode='ov' />
    );

    expect(getByTestId('chat-input').getAttribute('data-placeholder')).toBe(
      'Ask Ovie...'
    );
    expect(queryByText('Ask Jovie to plan your next release...')).toBeNull();
  });

  it('renders Ovie as a full-bleed editorial briefing instead of the generic chat welcome', () => {
    const { getByRole, getByTestId, queryByText } = renderWithQueryClient(
      <JovieChat
        profileId='profile-1'
        chatMode='ov'
        ovieHomeBriefing={ovieHomeBriefing}
      />
    );

    expect(getByTestId('chat-empty-state-viewport')).toHaveAttribute(
      'data-empty-affordance',
      'ovie-briefing'
    );
    expect(getByTestId('chat-empty-state-composer-region')).toHaveClass(
      'w-full'
    );
    expect(getByTestId('ovie-home-greeting')).toHaveTextContent(
      'Good morning, Tim.'
    );
    expect(
      getByRole('heading', {
        name: 'The first real user completed onboarding',
      })
    ).toBeInTheDocument();
    expect(queryByText('Just ask')).toBeNull();
    expect(queryByText('Plan my next release')).toBeNull();
    expect(getByTestId('chat-input')).toBeInTheDocument();
    expect(screen.queryByTestId('chat-usage')).not.toBeInTheDocument();

    fireEvent.click(getByRole('button', { name: 'Show The Evidence' }));
    expect(mockChatState.handleSuggestedPrompt).toHaveBeenCalledExactlyOnceWith(
      'Show the activation evidence.'
    );
  });

  it('renders exactly one empty-state thought even when card data is pending (JOV-7150)', () => {
    // Regression fixture: the empty state must never stack competing prompt
    // surfaces — no "Just ask" welcome, no sample exchange, no starter-action
    // carousel, no opportunity cards — only the greeting + composer.
    mockPendingOpportunityCards.push({
      id: 'opp-1',
      typeLabel: 'Suggestion',
      createdAt: '2026-07-01T12:00:00.000Z',
      title: 'Detroit listeners up 340%',
      why: 'Promoter at Magic Stick reached out.',
      primaryActionLabel: 'Review pitch',
      status: 'pending',
      category: 'suggestion',
    });

    renderWithQueryClient(
      <JovieChat profileId='profile-1' displayName='Tim White' />
    );

    expect(screen.getByTestId('chat-empty-state-greeting-text')).toBeTruthy();
    expect(screen.getByTestId('chat-input')).toBeTruthy();
    // Every retired surface stays off.
    expect(screen.queryByTestId('chat-empty-state-welcome')).toBeNull();
    expect(screen.queryByTestId('chat-empty-state-sample')).toBeNull();
    expect(screen.queryByText('Just ask')).toBeNull();
    expect(screen.queryByTestId('chat-starter-actions-rail')).toBeNull();
    expect(
      screen.queryByTestId('chat-empty-state-action-card-slot')
    ).toBeNull();
    expect(
      screen.queryByTestId('chat-empty-state-opportunity-cards')
    ).toBeNull();
    expect(screen.queryByTestId('feature-intro-card')).toBeNull();
    expect(screen.queryByTestId('suggested-prompts-rail')).toBeNull();
    expect(screen.queryAllByTestId('chat-action-card')).toHaveLength(0);
    // Docked layout: greeting above, composer at bottom of the usable area.
    const region = screen.getByTestId('chat-empty-state-composer-region');
    expect(region.getAttribute('data-layout')).toBe('docked');
    expect(
      screen
        .getByTestId('chat-empty-state-centered-composer')
        .getAttribute('data-dock')
    ).toBe('bottom');
  });

  it('hides the greeting while typing so the composer owns attention', () => {
    mockChatState.input = 'Help me with';

    const { getByTestId, queryByTestId, queryByText } = renderWithQueryClient(
      <JovieChat profileId='profile-1' />
    );

    expect(getByTestId('chat-empty-state-composer-region')).toBeTruthy();
    expect(queryByTestId('chat-empty-state-action-card-slot')).toBeNull();
    expect(queryByTestId('chat-composer-dock')).toBeNull();
    expect(queryByTestId('chat-empty-state-top-signals')).toBeNull();
    // Typing gives the composer full focus: welcome + logo hide too.
    expect(queryByTestId('chat-empty-state-welcome')).toBeNull();
    expect(queryByTestId('chat-empty-state-logo')).toBeNull();
    expect(queryByTestId('chat-empty-state-greeting')).toBeNull();
    expect(queryByTestId('feature-intro-card')).toBeNull();
    expect(getByTestId('chat-input')).toBeTruthy();
    expect(queryByText('Connect Your Music Catalog')).toBeNull();
    expect(queryByTestId('suggested-prompts-rail')).toBeNull();
  });

  it('hides empty-state suggestions when skill chips are present', () => {
    mockChatState.chipTray.chips = [
      {
        type: 'skill',
        id: 'generateAlbumArt',
        uid: 'chip-skill-1',
      },
    ];

    const { getByTestId, queryByTestId } = renderWithQueryClient(
      <JovieChat profileId='profile-1' />
    );

    expect(getByTestId('chat-empty-state-centered-composer')).toBeTruthy();
    expect(getByTestId('chat-input')).toBeTruthy();
    expect(queryByTestId('chat-empty-state-soft-suggestions-slot')).toBeNull();
    expect(queryByTestId('suggested-prompts-rail')).toBeNull();
    expect(queryByTestId('chat-empty-state-welcome')).toBeNull();
    expect(queryByTestId('chat-empty-state-greeting')).toBeNull();
    expect(queryByTestId('feature-intro-card')).toBeNull();
  });

  it('does not render first-session welcome copy in the empty state', () => {
    const { queryByText } = renderWithQueryClient(
      <JovieChat profileId='profile-1' isFirstSession />
    );

    expect(queryByText("Hey, I'm Jovie.")).toBeNull();
  });

  it('does not render returning-user welcome copy in the empty state', () => {
    const { queryByText } = renderWithQueryClient(
      <JovieChat profileId='profile-1' displayName='Tim White' />
    );

    expect(queryByText('What are we working on, Tim?')).toBeNull();
    expect(queryByText('What are we working on?')).toBeNull();
    expect(queryByText('Welcome back')).toBeNull();
    expect(queryByText('Welcome back, Tim')).toBeNull();
    expect(queryByText('Welcome back, Tim White')).toBeNull();
  });

  it('renders chat messages after in-place message array updates', () => {
    const messages = mockChatState.messages;
    const { getAllByTestId, queryByText, rerender } = renderWithQueryClient(
      <JovieChat profileId='profile-1' />
    );

    expect(queryByText('What are we working on?')).toBeNull();
    expect(queryByText('Welcome back')).toBeNull();

    messages.push(
      {
        id: 'cmd-user-1',
        role: 'user',
        parts: [{ type: 'text', text: 'Preview my profile.' }],
        createdAt: new Date('2026-03-08T00:00:00.000Z'),
      },
      {
        id: 'cmd-assistant-1',
        role: 'assistant',
        parts: [{ type: 'text', text: 'Opening your profile in a new tab.' }],
        createdAt: new Date('2026-03-08T00:00:01.000Z'),
      }
    );
    mockChatState.hasMessages = true;

    rerender(<JovieChat profileId='profile-1' />);

    expect(queryByText('What are we working on?')).toBeNull();
    expect(queryByText('Welcome back')).toBeNull();
    expect(getAllByTestId('chat-message')).toHaveLength(2);
    expect(
      screen.getByTestId('chat-input').getAttribute('data-placeholder')
    ).toBe('');
    expect(screen.getByTestId('chat-input').getAttribute('data-variant')).toBe(
      'compact'
    );
    expect(
      screen.getByTestId('chat-input').getAttribute('data-quick-actions')
    ).toBeNull();
  });

  it('does not stack opportunity cards on the empty state (JOV-7150)', () => {
    mockPendingOpportunityCards.push({
      id: 'opp-1',
      typeLabel: 'Suggestion',
      createdAt: '2026-07-01T12:00:00.000Z',
      title: 'Detroit listeners up 340%',
      why: 'Promoter at Magic Stick reached out.',
      primaryActionLabel: 'Review pitch',
      status: 'pending',
      category: 'suggestion',
    });

    const { getByTestId, queryByTestId } = renderWithQueryClient(
      <JovieChat profileId='profile-1' displayName='Tim White' />
    );

    // Pending opportunities no longer own the empty state — the greeting
    // sentence and composer stand alone.
    expect(queryByTestId('chat-empty-state-opportunity-cards')).toBeNull();
    expect(getByTestId('chat-empty-state-greeting-text')).toBeTruthy();
    expect(queryByTestId('suggested-prompts-rail')).toBeNull();
    expect(queryByTestId('chat-empty-state-welcome')).toBeNull();
  });

  it('reproduces pinned-card mode from the ?opportunityId= deep link (JOV-3933)', () => {
    mockPendingOpportunityCards.push({
      id: 'opp-deep',
      typeLabel: 'YouTube',
      createdAt: '2026-07-01T12:00:00.000Z',
      title: 'Refresh weak YouTube thumbnails',
      why: '4 videos still use auto-generated thumbs',
      primaryActionLabel: 'Generate variants',
      status: 'pending',
      category: 'suggestion',
    });
    mockSearchParams = new URLSearchParams('opportunityId=opp-deep');

    const { getByTestId, queryByTestId } = renderWithQueryClient(
      <JovieChat profileId='profile-1' />
    );

    expect(getByTestId('chat-pinned-opportunity-header')).toBeTruthy();
    expect(getByTestId('chat-composer-dock')).toBeTruthy();
    expect(queryByTestId('chat-empty-state-opportunity-cards')).toBeNull();
  });

  it('collapses the pinned header back to the greeting when unpinned (JOV-3933)', () => {
    mockPendingOpportunityCards.push({
      id: 'opp-pin',
      typeLabel: 'Suggestion',
      createdAt: '2026-07-01T12:00:00.000Z',
      title: 'Playlist window this week',
      why: 'Your latest single is peaking.',
      primaryActionLabel: 'Draft pitch',
      status: 'pending',
      category: 'suggestion',
    });
    mockSearchParams = new URLSearchParams('opportunityId=opp-pin');

    const { getByTestId, queryByTestId } = renderWithQueryClient(
      <JovieChat profileId='profile-1' />
    );

    expect(getByTestId('chat-pinned-opportunity-header')).toBeTruthy();

    fireEvent.click(getByTestId('chat-pinned-opportunity-unpin'));

    expect(queryByTestId('chat-pinned-opportunity-header')).toBeNull();
    expect(mockOpportunityQueryOptions).toHaveBeenLastCalledWith({
      enabled: false,
    });
    // Unpinning returns to the one-sentence greeting, not a card stack.
    expect(queryByTestId('chat-empty-state-opportunity-cards')).toBeNull();
    expect(getByTestId('chat-empty-state-greeting-text')).toBeTruthy();
  });

  it('handles a revisited opportunity link after navigation without remounting', () => {
    mockPendingOpportunityCards.push({
      id: 'opp-revisit',
      typeLabel: 'Suggestion',
      createdAt: '2026-07-01T12:00:00.000Z',
      title: 'Review this opportunity',
      why: 'A new booking inquiry arrived.',
      primaryActionLabel: 'Review inquiry',
      status: 'pending',
      category: 'suggestion',
    });
    mockSearchParams = new URLSearchParams('opportunityId=opp-revisit');
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const { getByTestId, queryByTestId, rerender } = render(
      <JovieChat profileId='profile-1' />,
      {
        wrapper: ({ children }) => (
          <QueryClientProvider client={queryClient}>
            {children}
          </QueryClientProvider>
        ),
      }
    );
    expect(getByTestId('chat-pinned-opportunity-header')).toBeTruthy();
    fireEvent.click(getByTestId('chat-pinned-opportunity-unpin'));
    expect(queryByTestId('chat-pinned-opportunity-header')).toBeNull();

    mockSearchParams = new URLSearchParams();
    rerender(<JovieChat profileId='profile-1' />);
    expect(queryByTestId('chat-pinned-opportunity-header')).toBeNull();
    mockSearchParams = new URLSearchParams('opportunityId=opp-revisit');
    rerender(<JovieChat profileId='profile-1' />);
    expect(getByTestId('chat-pinned-opportunity-header')).toBeTruthy();
  });

  it('does not render opportunity cards when there are none pending', () => {
    const { queryByTestId } = renderWithQueryClient(
      <JovieChat profileId='profile-1' />
    );

    expect(queryByTestId('chat-empty-state-opportunity-cards')).toBeNull();
    expect(queryByTestId('suggested-prompts-rail')).toBeNull();
    expect(queryByTestId('chat-empty-state-soft-suggestions-slot')).toBeNull();
  });
});
