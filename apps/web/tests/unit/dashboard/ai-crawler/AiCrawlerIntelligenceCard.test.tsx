import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import {
  AiCrawlerIntelligenceCard,
  AiCrawlerIntelligenceCardSkeleton,
} from '@/components/features/dashboard/organisms/ai-crawler/AiCrawlerIntelligenceCard';
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
  it('exposes the same canonical row geometry to route loading shells', () => {
    const { rerender } = renderWithQueryClient(
      <AiCrawlerIntelligenceCardSkeleton />
    );
    const loadingClassName = screen.getByTestId(
      'ai-crawler-card-skeleton'
    ).className;

    hoisted.useAiCrawlerAnalyticsQueryMock.mockReturnValue({
      data: proAnalytics,
      isLoading: false,
      isError: false,
    });
    rerender(
      <QueryClientProvider client={createTestQueryClient()}>
        <AiCrawlerIntelligenceCard />
      </QueryClientProvider>
    );

    expect(
      screen.getByTestId('ai-crawler-intelligence-card').className
    ).toContain('min-h-12');
    for (const geometryClass of [
      'flex',
      'min-h-12',
      'w-full',
      'items-center',
      'gap-3',
      'rounded-xl',
      'border',
      'px-3',
      'py-2',
    ]) {
      expect(loadingClassName).toContain(geometryClass);
      expect(
        screen.getByTestId('ai-crawler-intelligence-card').className
      ).toContain(geometryClass);
    }
  });

  it('reserves compact row height while loading', () => {
    hoisted.useAiCrawlerAnalyticsQueryMock.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    });

    renderWithQueryClient(<AiCrawlerIntelligenceCard />);

    const skeleton = screen.getByTestId('ai-crawler-card-skeleton');
    expect(skeleton).toHaveClass('min-h-12');
  });

  it('reserves compact row height on error without layout collapse', () => {
    hoisted.useAiCrawlerAnalyticsQueryMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    });

    renderWithQueryClient(<AiCrawlerIntelligenceCard />);

    const errorCard = screen.getByTestId('ai-crawler-card-error');
    expect(errorCard).toHaveClass('min-h-12');
    expect(
      screen.getByText('AI crawler analytics temporarily unavailable.')
    ).toBeInTheDocument();
  });

  it('renders pro analytics as a compact clickable row', () => {
    hoisted.useAiCrawlerAnalyticsQueryMock.mockReturnValue({
      data: proAnalytics,
      isLoading: false,
      isError: false,
    });

    renderWithQueryClient(<AiCrawlerIntelligenceCard />);

    const row = screen.getByTestId('ai-crawler-intelligence-card');
    expect(row).toHaveClass('min-h-12');
    expect(row.tagName).toBe('BUTTON');
    expect(screen.getByText('AI Visibility')).toBeInTheDocument();
    expect(
      screen.getByText('420 reads · 2 services tracked')
    ).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(
      screen.queryByTestId('ai-crawler-card-teaser')
    ).not.toBeInTheDocument();
  });

  it('opens the detail panel when the row is clicked', async () => {
    const { track } = await import('@/lib/analytics');
    hoisted.useAiCrawlerAnalyticsQueryMock.mockReturnValue({
      data: proAnalytics,
      isLoading: false,
      isError: false,
    });
    const onOpenDetail = vi.fn();

    renderWithQueryClient(
      <AiCrawlerIntelligenceCard onOpenDetail={onOpenDetail} />
    );

    fireEvent.click(screen.getByTestId('ai-crawler-intelligence-card'));

    expect(onOpenDetail).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenCalledWith('ai_crawler_card_opened', {
      total_requests: 420,
      crawler_count: 2,
    });
  });

  it('shows upgrade CTA for free users instead of a dead detail row', () => {
    hoisted.useAiCrawlerAnalyticsQueryMock.mockReturnValue({
      data: teaserAnalytics,
      isLoading: false,
      isError: false,
    });
    const onOpenDetail = vi.fn();

    renderWithQueryClient(
      <AiCrawlerIntelligenceCard onOpenDetail={onOpenDetail} />
    );

    const row = screen.getByTestId('ai-crawler-intelligence-card');
    expect(row).toHaveClass('min-h-12');
    expect(row.tagName).not.toBe('BUTTON');
    const teaser = screen.getByTestId('ai-crawler-card-teaser');
    expect(
      within(teaser).getByText('See which AI services read your pages')
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /upgrade to pro/i })
    ).toBeInTheDocument();
    expect(onOpenDetail).not.toHaveBeenCalled();
  });
});
