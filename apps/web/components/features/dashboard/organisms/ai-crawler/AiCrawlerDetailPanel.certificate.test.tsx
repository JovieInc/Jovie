import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import type { AiCrawlerAnalyticsResponse } from '@/types/ai-crawler-analytics';
import { AiCrawlerDetailPanel } from './AiCrawlerDetailPanel';

const hoisted = vi.hoisted(() => ({
  useAiCrawlerAnalyticsQueryMock: vi.fn(),
}));

vi.mock('@/lib/queries/useAiCrawlerAnalyticsQuery', () => ({
  useAiCrawlerAnalyticsQuery: hoisted.useAiCrawlerAnalyticsQueryMock,
}));

vi.mock('@/components/molecules/drawer', async () => ({
  DrawerSurfaceCard: ({ children }: { readonly children: ReactNode }) => (
    <div>{children}</div>
  ),
  EntitySidebarShell: ({
    entityHeader,
    children,
    isOpen,
    ariaLabel,
  }: {
    readonly entityHeader?: ReactNode;
    readonly children: ReactNode;
    readonly isOpen: boolean;
    readonly ariaLabel?: string;
  }) =>
    isOpen ? (
      <aside aria-label={ariaLabel}>
        {entityHeader}
        {children}
      </aside>
    ) : null,
  ...(await import('@/components/molecules/drawer/StatTile')),
}));

vi.mock('@/components/molecules/drawer-header/DrawerHeaderActions', () => ({
  DrawerHeaderActions: ({ onClose }: { readonly onClose?: () => void }) => (
    <button type='button' onClick={onClose}>
      Close
    </button>
  ),
}));

vi.mock('@/components/molecules/UpgradeButton', () => ({
  UpgradeButton: ({ children }: { readonly children: ReactNode }) => (
    <button type='button'>{children}</button>
  ),
}));

const base: AiCrawlerAnalyticsResponse = {
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

function mockQuery(
  data: AiCrawlerAnalyticsResponse | undefined,
  isLoading = false
) {
  hoisted.useAiCrawlerAnalyticsQueryMock.mockReturnValue({ data, isLoading });
}

describe('AiCrawlerDetailPanel certificate', () => {
  it('calls onClose from the header close action', async () => {
    mockQuery(base);
    const onClose = vi.fn();
    const user = userEvent.setup();
    const { container } = render(
      <AiCrawlerDetailPanel isOpen onClose={onClose} />
    );

    await user.click(screen.getByRole('button', { name: 'Close' }));

    expect(onClose).toHaveBeenCalledTimes(1);
    await expectNoA11yViolations(container);
  });

  it('renders the populated state axe-clean', async () => {
    mockQuery(base);
    const { container } = render(
      <AiCrawlerDetailPanel isOpen onClose={() => undefined} />
    );
    expect(screen.getByText('GPTBot')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('renders the loading state axe-clean', async () => {
    mockQuery(undefined, true);
    const { container } = render(
      <AiCrawlerDetailPanel isOpen onClose={() => undefined} />
    );
    expect(screen.getAllByTestId('stat-tile-value')[0]).toHaveAttribute(
      'aria-busy',
      'true'
    );
    await expectNoA11yViolations(container);
  });

  it('renders the empty state axe-clean', async () => {
    mockQuery({ ...base, totalRequests: 0, weeklyRequests: 0, crawlers: [] });
    const { container } = render(
      <AiCrawlerDetailPanel isOpen onClose={() => undefined} />
    );
    expect(
      screen.getByText('No AI crawler visits recorded yet.')
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('renders the unavailable telemetry state axe-clean', async () => {
    mockQuery(undefined);
    const { container } = render(
      <AiCrawlerDetailPanel isOpen onClose={() => undefined} />
    );
    expect(screen.getAllByText('Unknown')).toHaveLength(2);
    await expectNoA11yViolations(container);
  });

  it('renders the free teaser state axe-clean', async () => {
    mockQuery({ ...base, isPro: false, isTeaser: true });
    const { container } = render(
      <AiCrawlerDetailPanel isOpen onClose={() => undefined} />
    );
    expect(
      screen.getByRole('button', { name: 'Upgrade to Artist Presence' })
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('renders long crawler names axe-clean', async () => {
    mockQuery({
      ...base,
      crawlers: [
        {
          id: 'long',
          name: 'Extremely Long Experimental Research Crawler Name From A Lab',
          requests: 900_000,
          previousPeriodRequests: 450_000,
        },
      ],
    });
    const { container } = render(
      <AiCrawlerDetailPanel isOpen onClose={() => undefined} />
    );
    expect(
      screen.getByText(
        'Extremely Long Experimental Research Crawler Name From A Lab'
      )
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
