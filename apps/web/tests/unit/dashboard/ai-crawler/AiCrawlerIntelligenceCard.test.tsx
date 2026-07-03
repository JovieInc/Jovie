import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AiCrawlerIntelligenceCard } from '@/components/features/dashboard/organisms/ai-crawler/AiCrawlerIntelligenceCard';
import type { AiCrawlerAnalyticsResponse } from '@/types/ai-crawler-analytics';

vi.mock('@/lib/analytics', () => ({
  track: vi.fn(),
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

    render(<AiCrawlerIntelligenceCard />);

    const skeleton = screen.getByTestId('ai-crawler-card-skeleton');
    expect(skeleton).toHaveClass('min-h-45');
  });

  it('reserves min-height on error without layout collapse', () => {
    hoisted.useAiCrawlerAnalyticsQueryMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    });

    render(<AiCrawlerIntelligenceCard />);

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

    render(<AiCrawlerIntelligenceCard />);

    expect(screen.getByTestId('ai-crawler-intelligence-card')).toHaveClass(
      'min-h-45'
    );
    expect(screen.getByTestId('ai-crawler-entity-card')).toBeInTheDocument();
    expect(screen.getByText('420 reads')).toBeInTheDocument();
    expect(screen.queryByTestId('ai-crawler-card-teaser')).not.toBeInTheDocument();
  });

  it('shows teaser overlay for free users while keeping card footprint', () => {
    hoisted.useAiCrawlerAnalyticsQueryMock.mockReturnValue({
      data: teaserAnalytics,
      isLoading: false,
      isError: false,
    });

    render(<AiCrawlerIntelligenceCard />);

    expect(screen.getByTestId('ai-crawler-intelligence-card')).toHaveClass(
      'min-h-45'
    );
    expect(screen.getByTestId('ai-crawler-card-teaser')).toBeInTheDocument();
    expect(
      screen.getByText('42 AI reads in 30 days')
    ).toBeInTheDocument();
    expect(screen.getByText('Upgrade to Pro')).toBeInTheDocument();
  });
});