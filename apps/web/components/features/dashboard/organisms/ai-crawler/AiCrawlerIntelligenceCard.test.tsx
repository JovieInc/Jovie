import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AiCrawlerAnalyticsResponse } from '@/types/ai-crawler-analytics';
import { AiCrawlerIntelligenceCard } from './AiCrawlerIntelligenceCard';

const hoisted = vi.hoisted(() => ({
  useAiCrawlerAnalyticsQueryMock: vi.fn(),
}));

vi.mock('@/lib/queries/useAiCrawlerAnalyticsQuery', () => ({
  useAiCrawlerAnalyticsQuery: hoisted.useAiCrawlerAnalyticsQueryMock,
}));

vi.mock('@/lib/analytics', () => ({
  track: vi.fn(),
}));

vi.mock('@/components/molecules/LoadingSkeleton', () => ({
  LoadingSkeleton: () => <span data-testid='loading-skeleton' />,
}));

vi.mock('@/components/molecules/UpgradeButton', () => ({
  UpgradeButton: ({ children }: { readonly children: ReactNode }) => (
    <button type='button'>{children}</button>
  ),
}));

const populatedAnalytics: AiCrawlerAnalyticsResponse = {
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
  syncedAt: '2026-09-01T12:00:00.000Z',
  isPro: true,
  isTeaser: false,
};

describe('AiCrawlerIntelligenceCard', () => {
  beforeEach(() => {
    hoisted.useAiCrawlerAnalyticsQueryMock.mockReturnValue({
      data: populatedAnalytics,
      isLoading: false,
      isError: false,
    });
  });

  it('renders the readiness disclosure in the populated compact row', () => {
    render(<AiCrawlerIntelligenceCard onOpenDetail={() => undefined} />);

    expect(screen.getByTestId('ai-crawler-intelligence-card')).toHaveAttribute(
      'aria-label',
      'View AI crawler read details'
    );
    expect(screen.getByText('AI Crawler Reads')).toBeInTheDocument();
    expect(
      screen.getByText('420 reads · 2 services tracked')
    ).toBeInTheDocument();
    expect(
      screen.getByText(/They do not show an AI answer mention/)
    ).toBeInTheDocument();
  });

  it('preserves the compact skeleton while loading', () => {
    hoisted.useAiCrawlerAnalyticsQueryMock.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    });

    render(<AiCrawlerIntelligenceCard onOpenDetail={() => undefined} />);

    expect(screen.getByTestId('ai-crawler-card-skeleton')).toHaveClass(
      'min-h-12'
    );
    expect(screen.getAllByTestId('loading-skeleton')).toHaveLength(3);
  });

  it('labels teaser activity without implying referrals or revenue', () => {
    hoisted.useAiCrawlerAnalyticsQueryMock.mockReturnValue({
      data: {
        ...populatedAnalytics,
        isPro: false,
        isTeaser: true,
      },
      isLoading: false,
      isError: false,
    });

    render(<AiCrawlerIntelligenceCard />);

    expect(screen.getByTestId('ai-crawler-card-teaser')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Observed machine reads only · no referral or revenue attribution'
      )
    ).toBeInTheDocument();
    expect(screen.getByText('Upgrade to Pro')).toBeInTheDocument();
  });
});
