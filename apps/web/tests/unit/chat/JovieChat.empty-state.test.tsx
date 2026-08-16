import { fireEvent, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { JovieChat } from '@/components/jovie/JovieChat';
import { renderWithQueryClient } from '@/tests/utils/test-utils';

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
  useJovieChat: () => mockChatState,
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
  usePendingOpportunityCardsQuery: () => ({
    data: mockPendingOpportunityCards,
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
    mockSearchParams = new URLSearchParams();
    mockPendingOpportunityCards.length = 0;
    mockChatState.input = '';
    mockChatState.messages = [];
    mockChatState.hasMessages = false;
    mockChatState.isLoading = false;
    mockChatState.isSubmitting = false;
    mockChatState.chipTray.chips = [];
  });

  it('renders a stable docked composer with the centered welcome when no skill is featured', () => {
    const { container, getByTestId, queryByTestId, queryByText } =
      renderWithQueryClient(<JovieChat profileId='profile-1' />);

    expect(queryByTestId('chat-empty-state-top-signals')).toBeNull();
    expect(queryByTestId('chat-empty-thread-ornament')).toBeNull();
    expect(queryByText('What are we working on?')).toBeNull();
    expect(queryByText('Welcome back')).toBeNull();
    expect(queryByText("Hey, I'm Jovie.")).toBeNull();
    const emptyViewport = getByTestId('chat-empty-state-viewport');
    expect(emptyViewport.className).toContain('flex-1');
    expect(emptyViewport).toHaveAttribute('data-empty-affordance', 'none');
    expect(getByTestId('chat-empty-state-composer-region')).toBeTruthy();
    // Clean start screen (JOV-4878): ambient brand logo + action-forward
    // invitation centered above the docked composer.
    expect(getByTestId('chat-empty-state-welcome')).toBeTruthy();
    expect(getByTestId('chat-empty-state-logo')).toBeTruthy();
    expect(getByTestId('chat-empty-state-greeting').textContent).toBe(
      "What's next?"
    );
    expect(getByTestId('chat-empty-state-centered-composer')).toBeTruthy();
    // No action cards and no featured skills: welcome + docked composer only.
    expect(queryByTestId('chat-empty-state-action-card-slot')).toBeNull();
    expect(queryByTestId('chat-composer-dock')).toBeNull();
    expect(queryByTestId('chat-empty-state-soft-suggestions-slot')).toBeNull();
    expect(queryByTestId('suggested-prompts-rail')).toBeNull();
    expect(getByTestId('chat-input')).toBeTruthy();
    expect(getByTestId('chat-input').getAttribute('data-placeholder')).toBe(
      'Ask Jovie to plan your next release...'
    );
    expect(getByTestId('chat-input').getAttribute('data-variant')).toBe('hero');
    const fileInput =
      container.querySelector<HTMLInputElement>('input[type="file"]');
    expect(fileInput).not.toBeNull();
    expect(fileInput).toHaveClass('hidden');
    expect(fileInput).toHaveAttribute('tabindex', '-1');
    expect(queryByText('Share Feedback')).toBeNull();
    // Old task-list-style actions should NOT appear — they belong in the profile switcher.
    expect(queryByText('Preview profile')).toBeNull();
    expect(queryByText('Change photo')).toBeNull();
    expect(queryByText('Release link')).toBeNull();
  });

  it('renders the canonical starter-actions rail without the legacy card map', () => {
    renderWithQueryClient(
      <JovieChat
        profileId='profile-1'
        actionCards={[
          {
            id: 'build-artist-profile',
            title: 'Build Artist Profile',
            body: 'Add Spotify, Apple Music, or YouTube Music so Jovie can plan from real releases.',
            actionLabel: 'Build Profile',
            prompt: 'Help me connect my music catalog.',
          },
          {
            id: 'plan-release',
            title: 'Plan a Release',
            body: 'Map the next release.',
            actionLabel: 'Start Planning',
            prompt: 'Help me plan my next release.',
          },
          {
            id: 'review-signals',
            title: 'Review Signals',
            body: 'Surface traction signals.',
            actionLabel: 'Review Signals',
            prompt: "What's working for me right now?",
          },
        ]}
      />
    );

    expect(screen.getByText('Build Artist Profile')).toBeTruthy();
    expect(screen.getByText(/Add Spotify/)).toBeTruthy();
    expect(
      screen.getByTestId('chat-empty-state-action-card-slot')
    ).toBeTruthy();
    expect(screen.getByTestId('chat-starter-actions-rail')).toBeTruthy();
    expect(screen.getByTestId('chat-empty-state-viewport')).toHaveAttribute(
      'data-empty-affordance',
      'starter-actions'
    );
    expect(
      screen.getByTestId('chat-empty-state-centered-composer')
    ).toBeTruthy();
    expect(screen.getByTestId('chat-empty-state-action-card-slot')).toHaveClass(
      'items-start',
      'sm:items-center'
    );
    // Docked layout: cards scroll above, composer at bottom of usable area.
    const region = screen.getByTestId('chat-empty-state-composer-region');
    expect(region.getAttribute('data-layout')).toBe('docked');
    expect(screen.getByTestId('chat-empty-state-above-scroll')).toBeTruthy();
    expect(
      screen
        .getByTestId('chat-empty-state-centered-composer')
        .getAttribute('data-dock')
    ).toBe('bottom');
    expect(screen.queryByTestId('suggested-prompts-rail')).toBeNull();
    expect(screen.getAllByTestId('chat-action-card')).toHaveLength(1);
    expect(
      within(screen.getByTestId('chat-starter-actions-rail')).getByRole(
        'button',
        { name: 'Show More Starter Actions' }
      )
    ).toBeInTheDocument();
    expect(
      within(screen.getByTestId('chat-starter-actions-rail')).getAllByRole(
        'button',
        { name: /Show Starter Action/ }
      )
    ).toHaveLength(3);
  });

  it('does not resurrect dismissed primary actions as chips or recenter the composer', () => {
    const gtag = vi.fn();
    Object.defineProperty(globalThis.window, 'gtag', {
      configurable: true,
      value: gtag,
    });

    renderWithQueryClient(
      <JovieChat
        profileId='profile-1'
        isProfileComplete
        actionCards={[
          {
            id: 'plan-release',
            title: 'Plan a Release',
            body: 'Map the next release.',
            actionLabel: 'Start Planning',
            prompt: 'Help me plan my next release.',
          },
          {
            id: 'generate-album-art',
            title: 'Generate Album Art',
            body: 'Draft cover concepts.',
            actionLabel: 'Generate Art',
            prompt: 'Generate album art for my latest release.',
          },
          {
            id: 'review-signals',
            title: 'Review Signals',
            body: 'Surface traction signals.',
            actionLabel: 'Review Signals',
            prompt: 'Help me see what is gaining traction.',
          },
        ]}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Plan a Release' }));
    fireEvent.click(
      screen.getByRole('button', { name: 'Dismiss Plan a Release' })
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Dismiss Generate Album Art' })
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Dismiss Review Signals' })
    );

    expect(screen.queryAllByTestId('chat-action-card')).toHaveLength(0);
    expect(
      screen.queryByTestId('chat-empty-state-action-card-slot')
    ).toBeNull();
    expect(
      screen.queryByTestId('chat-empty-state-soft-suggestions-slot')
    ).toBeNull();
    expect(screen.getByTestId('chat-empty-state-viewport')).toHaveAttribute(
      'data-empty-affordance',
      'none'
    );
    expect(
      screen.getByTestId('chat-empty-state-composer-region')
    ).toHaveAttribute('data-layout', 'docked');
    expect(screen.queryByLabelText('Plan a Release')).toBeNull();
    expect(screen.queryByLabelText('Generate Album Art')).toBeNull();
    expect(screen.queryByLabelText('Review Signals')).toBeNull();
    expect(gtag).toHaveBeenCalledWith(
      'event',
      'chat_starter_action_selected',
      expect.objectContaining({ action: 'plan_release', surface: 'card' })
    );
    expect(gtag).toHaveBeenCalledWith(
      'event',
      'chat_starter_action_dismissed',
      expect.objectContaining({ action: 'review_signals', surface: 'card' })
    );
  });

  it('hides scaffolding while typing so the composer owns attention', () => {
    mockChatState.input = 'Help me with';

    const { getByTestId, queryByTestId, queryByText } = renderWithQueryClient(
      <JovieChat
        profileId='profile-1'
        actionCards={[
          {
            id: 'build-artist-profile',
            title: 'Build Artist Profile',
            body: 'Add Spotify, Apple Music, or YouTube Music so Jovie can plan from real releases.',
            actionLabel: 'Build Profile',
            prompt: 'Help me connect my music catalog.',
          },
        ]}
      />
    );

    expect(getByTestId('chat-empty-state-composer-region')).toBeTruthy();
    expect(queryByTestId('chat-empty-state-action-card-slot')).toBeNull();
    expect(queryByTestId('chat-composer-dock')).toBeNull();
    expect(queryByTestId('chat-empty-state-top-signals')).toBeNull();
    // Typing gives the composer full focus: welcome + logo hide too.
    expect(queryByTestId('chat-empty-state-welcome')).toBeNull();
    expect(queryByTestId('chat-empty-state-logo')).toBeNull();
    expect(queryByTestId('chat-empty-state-greeting')).toBeNull();
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
    ).toBe('Ask Jovie to plan your next release...');
    expect(screen.getByTestId('chat-input').getAttribute('data-variant')).toBe(
      'compact'
    );
    expect(
      screen.getByTestId('chat-input').getAttribute('data-quick-actions')
    ).toBeNull();
  });

  it('renders compact opportunity cards instead of suggestion pills when pending', () => {
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

    const { getByTestId, queryByTestId, getByText } = renderWithQueryClient(
      <JovieChat profileId='profile-1' />
    );

    expect(getByTestId('chat-empty-state-opportunity-cards')).toBeTruthy();
    expect(getByText('Detroit listeners up 340%')).toBeTruthy();
    // Pills and the welcome stay hidden when opportunities own the stage.
    expect(queryByTestId('suggested-prompts-rail')).toBeNull();
    expect(queryByTestId('chat-empty-state-soft-suggestions-slot')).toBeNull();
    expect(queryByTestId('chat-empty-state-welcome')).toBeNull();
    expect(queryByTestId('chat-empty-state-logo')).toBeNull();
  });

  it('enters pinned-card mode when an opportunity card is tapped', () => {
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

    const { getByTestId, queryByTestId } = renderWithQueryClient(
      <JovieChat profileId='profile-1' />
    );

    fireEvent.click(getByTestId('chat-empty-opportunity-card-opp-pin'));

    expect(getByTestId('chat-pinned-opportunity-header')).toBeTruthy();
    expect(getByTestId('chat-composer-dock')).toBeTruthy();
    expect(queryByTestId('chat-empty-state-opportunity-cards')).toBeNull();
    expect(queryByTestId('chat-empty-state-viewport')).toBeNull();
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

  it('collapses the pinned header when the unpin affordance is used (JOV-3933)', () => {
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

    const { getByTestId, queryByTestId } = renderWithQueryClient(
      <JovieChat profileId='profile-1' />
    );

    fireEvent.click(getByTestId('chat-empty-opportunity-card-opp-pin'));
    expect(getByTestId('chat-pinned-opportunity-header')).toBeTruthy();

    fireEvent.click(getByTestId('chat-pinned-opportunity-unpin'));

    expect(queryByTestId('chat-pinned-opportunity-header')).toBeNull();
    // Thread scaffolding falls back to the empty-state cards once unpinned.
    expect(getByTestId('chat-empty-state-opportunity-cards')).toBeTruthy();
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
