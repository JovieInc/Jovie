import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { AiCrawlerIntelligenceCard } from '@/components/features/dashboard/organisms/ai-crawler/AiCrawlerIntelligenceCard';
import type { AiCrawlerAnalyticsResponse } from '@/types/ai-crawler-analytics';

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

function renderWithQueryClient(ui: ReactElement) {
  const queryClient = createTestQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
  );
}

vi.mock('@/lib/analytics', () => ({
  track: vi.fn(),
  useFeatureFlag: vi.fn().mockReturnValue(false),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), prefetch: vi.fn() }),
}));

const hoisted = vi.hoisted(() => ({
  useAiCrawlerAnalyticsQueryMock: vi.fn(),
}));

vi.mock('@/lib/queries/useAiCrawlerAnalyticsQuery', () => ({
  useAiCrawlerAnalyticsQuery: hoisted.useAiCrawlerAnalyticsQueryMock,
}));

const proAnalytics: AiCrawlerAnalyticsResponse = {
  totalRequests: 420,
  weeklyRequests: 88,
  crawlers: [
    {
      id: 'gptbot',
      name: 'GPTBot',
      requests: 200,
      previousPeriodRequests: 150,
    },
    {
      id: 'claudebot',
      name: 'ClaudeBot',
      requests: 120,
      previousPeriodRequests: 90,
    },
  ],
  dailyTrend: [],
  syncedAt: '2026-07-01T12:00:00.000Z',
  isPro: true,
  isTeaser: false,
};

const teaserAnalytics: AiCrawlerAnalyticsResponse = {
  totalRequests: 42,
  weeklyRequests: 10,
  crawlers: [
    {
      id: 'teaser-1',
      name: 'AI Crawler',
      requests: 0,
      previousPeriodRequests: 0,
    },
  ],
  dailyTrend: [],
  syncedAt: '2026-07-01T12:00:00.000Z',
  isPro: false,
  isTeaser: true,
};

describe('AiCrawlerIntelligenceCard', () => {
  it('reserves min-height while loading', () => {
    hoisted.useAiCrawlerAnalyticsQueryMock.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    });

    renderWithQueryClient(<AiCrawlerIntelligenceCard />);

    const skeleton = screen.getByTestId('ai-crawler-card-skeleton');
    expect(skeleton).toHaveClass('min-h-45');
  });

  it('reserves min-height on error without layout collapse', () => {
    hoisted.useAiCrawlerAnalyticsQueryMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    });

    renderWithQueryClient(<AiCrawlerIntelligenceCard />);

    const errorCard = screen.getByTestId('ai-crawler-card-error');
    expect(errorCard).toHaveClass('min-h-45');
    expect(
      screen.getByText('AI crawler analytics temporarily unavailable.')
    ).toBeInTheDocument();
  });

  it('renders pro analytics without teaser overlay', () => {
    hoisted.useAiCrawlerAnalyticsQueryMock.mockReturnValue({
      data: proAnalytics,
      isLoading: false,
      isError: false,
    });

    renderWithQueryClient(<AiCrawlerIntelligenceCard />);

    expect(screen.getByTestId('ai-crawler-intelligence-card')).toHaveClass(
      'min-h-45'
    );
    expect(screen.getByTestId('ai-crawler-entity-card')).toBeInTheDocument();
    expect(screen.getByText('420 reads')).toBeInTheDocument();
    expect(
      screen.queryByTestId('ai-crawler-card-teaser')
    ).not.toBeInTheDocument();
  });

  it('shows teaser overlay for free users while keeping card footprint', () => {
    hoisted.useAiCrawlerAnalyticsQueryMock.mockReturnValue({
      data: teaserAnalytics,
      isLoading: false,
      isError: false,
    });

    renderWithQueryClient(<AiCrawlerIntelligenceCard />);

    expect(screen.getByTestId('ai-crawler-intelligence-card')).toHaveClass(
      'min-h-45'
    );
    const teaser = screen.getByTestId('ai-crawler-card-teaser');
    expect(teaser).toBeInTheDocument();
    expect(
      within(teaser).getByText('42 AI reads in 30 days')
    ).toBeInTheDocument();
    expect(within(teaser).getByText('Upgrade to Pro')).toBeInTheDocument();
  });
});
