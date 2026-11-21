import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import type { AiCrawlerAnalyticsResponse } from '@/types/ai-crawler-analytics';
import { AiCrawlerIntelligenceCard } from './AiCrawlerIntelligenceCard';

const hoisted = vi.hoisted(() => ({ query: vi.fn(), track: vi.fn() }));

vi.mock('@/lib/queries/useAiCrawlerAnalyticsQuery', () => ({
  useAiCrawlerAnalyticsQuery: hoisted.query,
}));
vi.mock('@/lib/analytics', () => ({ track: hoisted.track }));
vi.mock('@/components/molecules/UpgradeButton', () => ({
  UpgradeButton: ({ children }: { readonly children: ReactNode }) => (
    <button type='button'>{children}</button>
  ),
}));

const analytics: AiCrawlerAnalyticsResponse = {
  totalRequests: 420,
  weeklyRequests: 88,
  crawlers: [
    {
      id: 'gptbot',
      name: 'GPTBot',
      requests: 200,
      previousPeriodRequests: 150,
    },
  ],
  dailyTrend: [],
  syncedAt: '2026-09-01T12:00:00.000Z',
  isPro: true,
  isTeaser: false,
};

describe('AiCrawlerIntelligenceCard certificate', () => {
  beforeEach(() => {
    hoisted.track.mockClear();
    hoisted.query.mockReturnValue({
      data: analytics,
      isLoading: false,
      isError: false,
    });
  });

  it('opens the detail from the populated row and tracks it', async () => {
    const onOpenDetail = vi.fn();
    const { container } = render(
      <AiCrawlerIntelligenceCard onOpenDetail={onOpenDetail} />
    );
    await userEvent.click(
      screen.getByRole('button', { name: /View AI Crawler Read Details/ })
    );
    expect(onOpenDetail).toHaveBeenCalledOnce();
    expect(hoisted.track).toHaveBeenCalledWith(
      'ai_crawler_card_opened',
      expect.objectContaining({ total_requests: 420 })
    );
    await expectNoA11yViolations(container);
  });

  it('is axe-clean while loading and on error', async () => {
    hoisted.query.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    });
    const loading = render(<AiCrawlerIntelligenceCard />);
    expect(screen.getByTestId('ai-crawler-card-skeleton')).toBeVisible();
    await expectNoA11yViolations(loading.container);
    loading.unmount();

    hoisted.query.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    });
    const failed = render(<AiCrawlerIntelligenceCard />);
    expect(screen.getByTestId('ai-crawler-card-error')).toBeVisible();
    await expectNoA11yViolations(failed.container);
  });

  it('shows the free teaser axe-clean and tracks the view once', async () => {
    hoisted.query.mockReturnValue({
      data: { ...analytics, isPro: false, isTeaser: true },
      isLoading: false,
      isError: false,
    });
    const { container, rerender } = render(<AiCrawlerIntelligenceCard />);
    rerender(<AiCrawlerIntelligenceCard />);
    expect(screen.getByTestId('ai-crawler-card-teaser')).toBeVisible();
    expect(
      hoisted.track.mock.calls.filter(c => c[0] === 'ai_crawler_card_viewed')
    ).toHaveLength(1);
    await expectNoA11yViolations(container);
  });
});
