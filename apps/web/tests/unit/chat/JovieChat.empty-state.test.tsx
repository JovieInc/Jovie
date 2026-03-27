import { beforeEach, describe, expect, it, vi } from 'vitest';

import { JovieChat } from '@/components/jovie/JovieChat';
import { renderWithQueryClient } from '@/tests/utils/test-utils';
import type { InsightResponse } from '@/types/insights';

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
};

const mockInsightsSummaryState: {
  data?: { insights: InsightResponse[] };
} = {};

const mockPlanGateState = {
  aiCanUseTools: false,
};

vi.mock('@/app/app/(shell)/dashboard/DashboardDataContext', () => ({
  useDashboardData: () => mockDashboardData,
}));

vi.mock('@/lib/queries', () => ({
  useInsightsSummaryQuery: () => mockInsightsSummaryState,
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

function createInsight(
  overrides: Partial<InsightResponse> = {}
): InsightResponse {
  return {
    id: 'insight-1',
    insightType: 'subscriber_surge',
    category: 'growth',
    priority: 'high',
    title: 'Your subscribers jumped 23% in LA this week',
    description: 'Insight description',
    actionSuggestion: null,
    confidence: '0.92',
    status: 'active',
    periodStart: '2026-03-01T00:00:00.000Z',
    periodEnd: '2026-03-08T00:00:00.000Z',
    createdAt: '2026-03-08T00:00:00.000Z',
    expiresAt: '2026-03-15T00:00:00.000Z',
    ...overrides,
  };
}

describe('JovieChat empty state', () => {
  beforeEach(() => {
    mockDashboardData.profileCompletion.percentage = 100;
    mockDashboardData.tippingStats.tipClicks = 0;
    mockDashboardData.tippingStats.tipsSubmitted = 0;
    mockDashboardData.tippingStats.totalReceivedCents = 0;
    mockDashboardData.tippingStats.monthReceivedCents = 0;
    mockSuggestedProfilesState.total = 0;
    mockSuggestedProfilesState.suggestions = [];
    mockSuggestedProfilesState.isLoading = false;
    mockSuggestedProfilesState.starterContext.conversationCount = 1;
    mockInsightsSummaryState.data = { insights: [] };
    mockPlanGateState.aiCanUseTools = false;
  });

  it('shows the top insight in the greeting and keeps prompt cards skill-based', () => {
    mockInsightsSummaryState.data = {
      insights: [createInsight()],
    };

    const { getByText, queryByRole } = renderWithQueryClient(
      <JovieChat profileId='profile-1' displayName='Tim' username='timwhite' />
    );

    expect(getByText('Welcome back')).toBeTruthy();
    expect(
      getByText(
        'Welcome back, Tim. Your subscribers jumped 23% in LA this week.'
      )
    ).toBeTruthy();
    expect(getByText('Preview my profile')).toBeTruthy();
    expect(getByText('Change profile photo')).toBeTruthy();
    expect(getByText('Set up a release link')).toBeTruthy();
    expect(
      queryByRole('button', {
        name: 'Your subscribers jumped 23% in LA this week',
      })
    ).toBeNull();
  });

  it('falls back to tip activity when no insights are available', () => {
    mockDashboardData.tippingStats.tipsSubmitted = 2;

    const { getByText } = renderWithQueryClient(
      <JovieChat profileId='profile-1' displayName='Tim' />
    );

    expect(
      getByText(
        "Welcome back, Tim. You've received 2 tips since you last checked in."
      )
    ).toBeTruthy();
  });

  it('preserves the first-session profile link greeting', () => {
    const { getByRole, getByText } = renderWithQueryClient(
      <JovieChat
        profileId='profile-1'
        displayName='Tim'
        username='timwhite'
        isFirstSession
      />
    );

    expect(getByText('Artist ready')).toBeTruthy();
    expect(
      getByRole('link', { name: 'jov.ie/timwhite' }).getAttribute('href')
    ).toBe('https://jov.ie/timwhite');
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
});
