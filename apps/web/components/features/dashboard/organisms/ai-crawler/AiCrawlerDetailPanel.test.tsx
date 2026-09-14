import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AiCrawlerAnalyticsResponse } from '@/types/ai-crawler-analytics';
import { AiCrawlerDetailPanel } from './AiCrawlerDetailPanel';

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
  ],
  dailyTrend: [],
  syncedAt: '2026-09-01T12:00:00.000Z',
  isPro: true,
  isTeaser: false,
};

describe('AiCrawlerDetailPanel', () => {
  beforeEach(() => {
    hoisted.useAiCrawlerAnalyticsQueryMock.mockReturnValue({
      data: populatedAnalytics,
      isLoading: false,
    });
  });

  it('renders the long readiness disclosure with populated telemetry', () => {
    render(<AiCrawlerDetailPanel isOpen onClose={() => undefined} />);

    expect(screen.getByText('AI Crawler Reads')).toBeInTheDocument();
    expect(
      screen.getByTestId('ai-crawler-measurement-disclosure')
    ).toHaveTextContent('They do not show an AI answer mention');
    expect(screen.getByText('420')).toBeInTheDocument();
    expect(screen.getByText('GPTBot')).toBeInTheDocument();
  });

  it('keeps missing telemetry Unknown rather than treating it as zero', () => {
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
  });

  it('shows a real zero separately from missing telemetry', () => {
    hoisted.useAiCrawlerAnalyticsQueryMock.mockReturnValue({
      data: {
        ...populatedAnalytics,
        totalRequests: 0,
        weeklyRequests: 0,
        crawlers: [],
        syncedAt: null,
      },
      isLoading: false,
    });

    render(<AiCrawlerDetailPanel isOpen onClose={() => undefined} />);

    expect(screen.getAllByText('0')).toHaveLength(2);
    expect(
      screen.getByText('No AI crawler visits recorded yet.')
    ).toBeInTheDocument();
    expect(screen.queryByText('Unknown')).not.toBeInTheDocument();
  });

  it('keeps the drawer content in a loading state while telemetry resolves', () => {
    hoisted.useAiCrawlerAnalyticsQueryMock.mockReturnValue({
      data: undefined,
      isLoading: true,
    });

    render(<AiCrawlerDetailPanel isOpen onClose={() => undefined} />);

    expect(screen.getByText('30-Day Reads')).toBeInTheDocument();
    expect(screen.queryByText('Unknown')).not.toBeInTheDocument();
    expect(
      screen.queryByText(
        'AI crawler reads are Unknown until telemetry is available.'
      )
    ).not.toBeInTheDocument();
  });
});
