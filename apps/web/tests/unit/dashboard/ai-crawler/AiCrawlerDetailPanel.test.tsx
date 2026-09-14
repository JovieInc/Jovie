import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AiCrawlerDetailPanel } from '@/components/features/dashboard/organisms/ai-crawler/AiCrawlerDetailPanel';
import type { AiCrawlerAnalyticsResponse } from '@/types/ai-crawler-analytics';

const hoisted = vi.hoisted(() => ({
  useAiCrawlerAnalyticsQueryMock: vi.fn(),
}));

vi.mock('@/lib/queries/useAiCrawlerAnalyticsQuery', () => ({
  useAiCrawlerAnalyticsQuery: hoisted.useAiCrawlerAnalyticsQueryMock,
}));

vi.mock('@/components/molecules/drawer', () => ({
  DrawerSurfaceCard: ({ children }: { readonly children: ReactNode }) => (
    <div>{children}</div>
  ),
  EntitySidebarShell: ({
    entityHeader,
    children,
    isOpen,
  }: {
    readonly entityHeader?: ReactNode;
    readonly children: ReactNode;
    readonly isOpen: boolean;
  }) =>
    isOpen ? (
      <aside>
        {entityHeader}
        {children}
      </aside>
    ) : null,
  StatTile: ({
    label,
    value,
  }: {
    readonly label: string;
    readonly value: string;
  }) => (
    <div>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  ),
}));

vi.mock('@/components/molecules/drawer-header/DrawerHeaderActions', () => ({
  DrawerHeaderActions: () => <button type='button'>Close</button>,
}));

vi.mock('@/components/molecules/UpgradeButton', () => ({
  UpgradeButton: ({ children }: { readonly children: ReactNode }) => (
    <button type='button'>{children}</button>
  ),
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
  ],
  dailyTrend: [],
  syncedAt: '2026-07-01T12:00:00.000Z',
  isPro: true,
  isTeaser: false,
};

describe('AiCrawlerDetailPanel', () => {
  beforeEach(() => {
    hoisted.useAiCrawlerAnalyticsQueryMock.mockReturnValue({
      data: proAnalytics,
      isLoading: false,
    });
  });

  it('labels crawler activity as a readiness signal and discloses its limits', () => {
    render(<AiCrawlerDetailPanel isOpen onClose={() => undefined} />);

    expect(screen.getByText('AI Crawler Reads')).toBeInTheDocument();
    expect(
      screen.getByTestId('ai-crawler-measurement-disclosure')
    ).toHaveTextContent(
      'Readiness Signal: AI crawler reads show that a service fetched a page. They do not show an AI answer mention, referral, purchase, revenue, or causal lift.'
    );
    expect(screen.getByText('30-Day Reads')).toBeInTheDocument();
    expect(screen.getByText('420')).toBeInTheDocument();
  });

  it('keeps missing crawler telemetry Unknown instead of displaying zero', () => {
    hoisted.useAiCrawlerAnalyticsQueryMock.mockReturnValue({
      data: undefined,
      isLoading: false,
    });

    render(<AiCrawlerDetailPanel isOpen onClose={() => undefined} />);

    expect(screen.getAllByText('Unknown')).toHaveLength(2);
    expect(
      screen.getByText(
        'AI crawler reads are Unknown until telemetry is available.'
      )
    ).toBeInTheDocument();
    expect(
      screen.getByText('Telemetry unavailable; crawler reads remain Unknown.')
    ).toBeInTheDocument();
  });
});
