import { beforeEach, describe, expect, it, vi } from 'vitest';

import { JovieChat } from '@/components/jovie/JovieChat';
import { renderWithQueryClient } from '@/tests/utils/test-utils';

const mockDashboardData = {
  profileCompletion: {
    percentage: 100,
    completedCount: 4,
    totalCount: 4,
    steps: [],
    profileIsLive: true,
  },
  tippingStats: {
    tipClicks: 0,
    tipsSubmitted: 0,
    totalReceivedCents: 0,
    monthReceivedCents: 0,
  },
};

const mockSuggestedProfilesState = {
  isLoading: false,
  total: 0,
  suggestions: [],
  currentIndex: 0,
  next: vi.fn(),
  prev: vi.fn(),
  confirm: vi.fn(),
  reject: vi.fn(),
  isActioning: false,
  starterContext: {
    conversationCount: 1,
    latestReleaseTitle: null,
  },
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
};

const mockPlanGateState = {
  aiCanUseTools: false,
};

vi.mock('@/app/app/(shell)/dashboard/DashboardDataContext', () => ({
  useDashboardData: () => mockDashboardData,
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

vi.mock('@/lib/queries', () => ({
  usePlanGate: () => mockPlanGateState,
}));

vi.mock('@/components/jovie/hooks', () => ({
  useSuggestedProfiles: () => mockSuggestedProfilesState,
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
}));

vi.mock('@/components/jovie/components', async () => {
  const actual = await vi.importActual<
    typeof import('@/components/jovie/components')
  >('@/components/jovie/components');

  return {
    ...actual,
    ChatInput: () => <div data-testid='chat-input' />,
    ChatMessage: () => <div data-testid='chat-message' />,
    ChatMessageSkeleton: () => <div data-testid='chat-message-skeleton' />,
    ErrorDisplay: () => <div data-testid='chat-error' />,
    ScrollToBottom: () => null,
    SuggestedProfilesCarousel: () => (
      <div data-testid='suggested-profiles-carousel' />
    ),
  };
});

vi.mock('@/components/jovie/components/ChatUsageAlert', () => ({
  ChatUsageAlert: () => <div data-testid='chat-usage' />,
}));

vi.mock('@/features/dashboard/molecules/ProfileCompletionCard', () => ({
  ProfileCompletionCard: () => <div data-testid='profile-completion-card' />,
}));

describe('JovieChat empty state', () => {
  beforeEach(() => {
    mockChatState.messages = [];
    mockChatState.hasMessages = false;
    mockChatState.isLoading = false;
    mockChatState.isSubmitting = false;
    mockDashboardData.profileCompletion.percentage = 100;
    mockDashboardData.tippingStats.tipClicks = 0;
    mockDashboardData.tippingStats.tipsSubmitted = 0;
    mockDashboardData.tippingStats.totalReceivedCents = 0;
    mockDashboardData.tippingStats.monthReceivedCents = 0;
    mockSuggestedProfilesState.total = 0;
    mockSuggestedProfilesState.suggestions = [];
    mockSuggestedProfilesState.isLoading = false;
    mockSuggestedProfilesState.starterContext.conversationCount = 1;
    mockPlanGateState.aiCanUseTools = false;
  });

  it('renders the authenticated home hero with a compact prompt rail', () => {
    const { getByTestId, getByText } = renderWithQueryClient(
      <JovieChat profileId='profile-1' displayName='Tim' />
    );

    expect(getByText('Welcome to Jovie')).toBeTruthy();
    expect(getByText('Ask anything or tell Jovie what you need')).toBeTruthy();
    expect(getByText('Preview profile')).toBeTruthy();
    expect(getByText('Change photo')).toBeTruthy();
    expect(getByText('Release link')).toBeTruthy();
    expect(getByTestId('suggested-prompts-rail')).toBeTruthy();
  });

  it('keeps prompt cards skill-based without extra helper copy', () => {
    const { getByText, queryByRole, queryByText } = renderWithQueryClient(
      <JovieChat profileId='profile-1' displayName='Tim' username='timwhite' />
    );

    expect(getByText('Welcome to Jovie')).toBeTruthy();
    expect(getByText('Preview profile')).toBeTruthy();
    expect(getByText('Change photo')).toBeTruthy();
    expect(getByText('Release link')).toBeTruthy();
    expect(queryByRole('heading', { name: 'Welcome back' })).toBeNull();
    expect(
      queryByText("You've received 2 tips since your last check-in.")
    ).toBeNull();
  });

  it('keeps the first-session prompt rail focused on setup actions', () => {
    const { getByText, queryByRole } = renderWithQueryClient(
      <JovieChat
        profileId='profile-1'
        displayName='Tim'
        username='timwhite'
        isFirstSession
      />
    );

    expect(getByText('Preview profile')).toBeTruthy();
    expect(getByText('Getting paid')).toBeTruthy();
    expect(queryByRole('link', { name: 'jov.ie/timwhite' })).toBeNull();
  });

  it('keeps the profile completion card for incomplete profiles', () => {
    mockDashboardData.profileCompletion.percentage = 75;

    const { getByTestId, queryByText } = renderWithQueryClient(
      <JovieChat profileId='profile-1' displayName='Tim' />
    );

    expect(getByTestId('profile-completion-card')).toBeTruthy();
    expect(queryByText('Welcome back')).toBeNull();
  });

  it('keeps the suggested profiles carousel when matches are available', () => {
    mockSuggestedProfilesState.total = 2;
    mockSuggestedProfilesState.suggestions = [
      {
        kind: 'profile',
        id: 'suggestion-1',
      },
    ];

    const { getByTestId, queryByText } = renderWithQueryClient(
      <JovieChat profileId='profile-1' displayName='Tim' />
    );

    expect(getByTestId('suggested-profiles-carousel')).toBeTruthy();
    expect(queryByText('Welcome back')).toBeNull();
  });

  it('renders chat messages after in-place message array updates', () => {
    const messages = mockChatState.messages;
    const { getAllByTestId, queryByText, rerender } = renderWithQueryClient(
      <JovieChat profileId='profile-1' displayName='Tim' />
    );

    expect(queryByText('Welcome to Jovie')).toBeTruthy();

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

    rerender(<JovieChat profileId='profile-1' displayName='Tim' />);

    expect(queryByText('Welcome to Jovie')).toBeNull();
    expect(getAllByTestId('chat-message')).toHaveLength(2);
  });
});
