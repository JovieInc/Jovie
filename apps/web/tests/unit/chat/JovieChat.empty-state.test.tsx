import { screen } from '@testing-library/react';
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
  useChatImageAttachments: () => ({
    pendingImages: [],
    isDragOver: false,
    isProcessing: false,
    addFiles: vi.fn(),
    removeImage: vi.fn(),
    clearImages: vi.fn(),
    toFileUIParts: () => [],
    dropZoneRef: { current: null },
  }),
  useStickToBottom: () => ({
    isStuckToBottom: true,
    setStuckToBottom: vi.fn(),
    onScroll: vi.fn(),
    totalSizeRef: vi.fn(),
    scrollContainerRef: { current: null },
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

vi.mock('@/lib/queries', () => ({
  queryKeys: {
    releases: {
      matrix: (profileId: string) => ['releases', 'matrix', profileId],
    },
    events: {
      list: (profileId: string) => ['events', 'list', profileId],
    },
  },
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
    mockChatState.input = '';
    mockChatState.messages = [];
    mockChatState.hasMessages = false;
    mockChatState.isLoading = false;
    mockChatState.isSubmitting = false;
    mockChatState.chipTray.chips = [];
  });

  it('renders only the logo and simple composer when empty', () => {
    const { getByTestId, queryByTestId, queryByText } = renderWithQueryClient(
      <JovieChat profileId='profile-1' />
    );

    expect(queryByTestId('chat-empty-state-top-signals')).toBeNull();
    expect(queryByTestId('chat-empty-thread-ornament')).toBeNull();
    expect(queryByText('Release plan')).toBeNull();
    expect(queryByText('Asset brief')).toBeNull();
    expect(queryByText('Context')).toBeNull();
    expect(queryByText('What are we working on?')).toBeNull();
    expect(queryByText('Welcome back')).toBeNull();
    expect(queryByText('Welcome back, Tim')).toBeNull();
    expect(queryByText("Hey, I'm Jovie.")).toBeNull();
    expect(queryByText('Jovie Assistant')).toBeNull();
    expect(queryByText('Ask anything or tell Jovie what you need')).toBeNull();
    expect(getByTestId('chat-empty-state-composer-region')).toBeTruthy();
    expect(getByTestId('chat-empty-state-logo')).toBeTruthy();
    expect(getByTestId('chat-empty-state-centered-composer')).toBeTruthy();
    expect(queryByTestId('chat-empty-state-action-card-slot')).toBeNull();
    expect(queryByTestId('chat-composer-dock')).toBeNull();
    expect(queryByTestId('chat-empty-state-soft-suggestions-slot')).toBeNull();
    expect(queryByTestId('suggested-prompts-rail')).toBeNull();
    expect(getByTestId('chat-input')).toBeTruthy();
    expect(getByTestId('chat-input').getAttribute('data-placeholder')).toBe(
      'Ask Jovie...'
    );
    expect(getByTestId('chat-input').getAttribute('data-variant')).toBe('hero');
    expect(
      getByTestId('chat-input').getAttribute('data-quick-actions')
    ).toBeNull();
    expect(queryByText('Plan a release')).toBeNull();
    expect(queryByText('Generate album art')).toBeNull();
    expect(queryByText('Pitch playlists')).toBeNull();
    // Old task-list-style actions should NOT appear — they belong in the profile switcher.
    expect(queryByText('Preview profile')).toBeNull();
    expect(queryByText('Change photo')).toBeNull();
    expect(queryByText('Release link')).toBeNull();
  });

  it('does not render empty-state action cards by default', () => {
    renderWithQueryClient(
      <JovieChat
        profileId='profile-1'
        actionCards={[
          {
            id: 'connect-music-catalog',
            title: 'Connect Your Music Catalog',
            body: 'Add Spotify, Apple Music, or YouTube Music so Jovie can plan from real releases.',
            actionLabel: 'Plan Setup',
            prompt: 'Help me connect my music catalog.',
          },
        ]}
      />
    );

    expect(screen.queryByText('Connect Your Music Catalog')).toBeNull();
    expect(screen.queryByText(/Add Spotify/)).toBeNull();
    expect(screen.queryByText('What are we working on?')).toBeNull();
    expect(
      screen.queryByTestId('chat-empty-state-action-card-slot')
    ).toBeNull();
    expect(
      screen.getByTestId('chat-empty-state-centered-composer')
    ).toBeTruthy();
    expect(screen.queryByTestId('chat-composer-dock')).toBeNull();
    expect(screen.queryByTestId('suggested-prompts-rail')).toBeNull();
  });

  it('keeps typed empty chat on the simple composer', () => {
    mockChatState.input = 'Help me with';

    const { getByTestId, queryByTestId, queryByText } = renderWithQueryClient(
      <JovieChat
        profileId='profile-1'
        actionCards={[
          {
            id: 'connect-music-catalog',
            title: 'Connect Your Music Catalog',
            body: 'Add Spotify, Apple Music, or YouTube Music so Jovie can plan from real releases.',
            actionLabel: 'Plan Setup',
            prompt: 'Help me connect my music catalog.',
          },
        ]}
      />
    );

    expect(getByTestId('chat-empty-state-composer-region')).toBeTruthy();
    expect(queryByTestId('chat-empty-state-action-card-slot')).toBeNull();
    expect(queryByTestId('chat-composer-dock')).toBeNull();
    expect(queryByTestId('chat-empty-state-top-signals')).toBeNull();
    expect(getByTestId('chat-input')).toBeTruthy();
    expect(queryByText('Connect Your Music Catalog')).toBeNull();
    expect(queryByTestId('suggested-prompts-rail')).toBeNull();
  });

  it('preserves the chip-enabled composer without empty-state suggestions', () => {
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
    ).toBe('Ask Jovie...');
    expect(screen.getByTestId('chat-input').getAttribute('data-variant')).toBe(
      'compact'
    );
    expect(
      screen.getByTestId('chat-input').getAttribute('data-quick-actions')
    ).toBeNull();
  });
});
