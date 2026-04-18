import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { AdminFunnelMetrics } from '@/lib/admin/funnel-metrics';

// Mock next/dynamic for WeeklyTrendChart's recharts
vi.mock('next/dynamic', () => ({
  default: (_loader: () => Promise<unknown>, _opts?: unknown) => {
    function DynamicChart() {
      return <div data-testid='recharts-placeholder' />;
    }
    DynamicChart.displayName = 'DynamicChart';
    return DynamicChart;
  },
}));

const hoisted = vi.hoisted(() => ({
  getAdminFunnelMetrics: vi.fn(),
  getWeeklyFunnelTrend: vi.fn(),
  getAllTimeFunnelTotals: vi.fn(),
}));

vi.mock('@/lib/admin/funnel-metrics', () => ({
  getAdminFunnelMetrics: hoisted.getAdminFunnelMetrics,
  getWeeklyFunnelTrend: hoisted.getWeeklyFunnelTrend,
  getAllTimeFunnelTotals: hoisted.getAllTimeFunnelTotals,
}));

const { AdminScoreboardSection, AdminScoreboardSectionSkeleton } = await import(
  '@/app/app/(shell)/admin/_components/AdminScoreboardSection'
);

function buildDefaultMetrics(
  overrides: Partial<AdminFunnelMetrics> = {}
): AdminFunnelMetrics {
  return {
    instagramShareStepViews7d: 0,
    instagramBioCopies7d: 0,
    instagramBioOpenRate7d: null,
    instagramBioActivations7d: 0,
    instagramBioActivationRate7d: null,
    outreachSent7d: 50,
    claimClicks7d: 20,
    claimRate: 0.4,
    signups7d: 10,
    signupRate: 0.5,
    paidConversions7d: 2,
    paidConversionRate: 0.2,
    mrrUsd: 847,
    arrUsd: 10164,
    payingCustomers: 5,
    runwayMonths: null,
    defaultAliveDate: null,
    wowGrowthRate: 0.182,
    momGrowthRate: 0.25,
    churnRate: null,
    retention30d: null,
    retention60d: null,
    retention90d: null,
    engagementActiveProfiles30d: null,
    cacUsd: null,
    ltvUsd: null,
    paybackPeriodMonths: null,
    stripeAvailable: true,
    errors: [],
    outreachToSignupRate: 0.2,
    signupToPaidRate: 0.2,
    dollarPerOutreach: null,
    magicMomentRate: null,
    magicMomentCount: 0,
    enrichmentFailureRate: null,
    ...overrides,
  };
}

function buildDefaultTotals(
  overrides: Partial<{
    scraped: number;
    qualified: number;
    contacted: number;
    claimed: number;
    signedUp: number;
    paid: number;
  }> = {}
) {
  return {
    scraped: 100,
    qualified: 42,
    contacted: 30,
    claimed: 15,
    signedUp: 8,
    paid: 3,
    ...overrides,
  };
}

const defaultTrend = [
  { weekStart: '2026-03-16', scraped: 25, contacted: 10, signups: 3, paid: 1 },
  { weekStart: '2026-03-23', scraped: 30, contacted: 15, signups: 4, paid: 1 },
  { weekStart: '2026-03-30', scraped: 20, contacted: 12, signups: 2, paid: 0 },
  { weekStart: '2026-04-06', scraped: 25, contacted: 13, signups: 1, paid: 0 },
];

describe('AdminScoreboardSection', () => {
  it('renders hero metrics with correct formatting', async () => {
    hoisted.getAdminFunnelMetrics.mockResolvedValue(buildDefaultMetrics());
    hoisted.getWeeklyFunnelTrend.mockResolvedValue(defaultTrend);
    hoisted.getAllTimeFunnelTotals.mockResolvedValue(buildDefaultTotals());

    const Component = await AdminScoreboardSection();
    render(Component);

    // MRR
    expect(screen.getByText('$847.00')).toBeInTheDocument();
    // Paying customers
    expect(screen.getByText('5')).toBeInTheDocument();
    // WoW growth positive
    expect(screen.getByText('+18.2%')).toBeInTheDocument();
  });

  it('renders conversion rate between funnel steps', async () => {
    hoisted.getAdminFunnelMetrics.mockResolvedValue(buildDefaultMetrics());
    hoisted.getWeeklyFunnelTrend.mockResolvedValue(defaultTrend);
    hoisted.getAllTimeFunnelTotals.mockResolvedValue(buildDefaultTotals());

    const Component = await AdminScoreboardSection();
    render(Component);

    // Qualified / Scraped = 42/100 = 42.0%
    expect(screen.getByText('42.0%')).toBeInTheDocument();
  });

  it('shows em dash for conversion rate when denominator is zero', async () => {
    hoisted.getAdminFunnelMetrics.mockResolvedValue(
      buildDefaultMetrics({
        outreachSent7d: 0,
        claimClicks7d: 0,
        signups7d: 0,
        paidConversions7d: 0,
      })
    );
    hoisted.getWeeklyFunnelTrend.mockResolvedValue(defaultTrend);
    hoisted.getAllTimeFunnelTotals.mockResolvedValue(
      buildDefaultTotals({ qualified: 0 })
    );

    const Component = await AdminScoreboardSection();
    render(Component);

    // Multiple em dashes expected (first step has no prev, and zero denominators)
    const emDashes = screen.getAllByText('\u2014');
    expect(emDashes.length).toBeGreaterThan(0);
  });

  it('shows negative WoW growth with error color', async () => {
    hoisted.getAdminFunnelMetrics.mockResolvedValue(
      buildDefaultMetrics({ wowGrowthRate: -0.05 })
    );
    hoisted.getWeeklyFunnelTrend.mockResolvedValue(defaultTrend);
    hoisted.getAllTimeFunnelTotals.mockResolvedValue(buildDefaultTotals());

    const Component = await AdminScoreboardSection();
    render(Component);

    expect(screen.getByText('-5.0%')).toBeInTheDocument();
  });

  it('shows em dash for null WoW growth', async () => {
    hoisted.getAdminFunnelMetrics.mockResolvedValue(
      buildDefaultMetrics({ wowGrowthRate: null })
    );
    hoisted.getWeeklyFunnelTrend.mockResolvedValue(defaultTrend);
    hoisted.getAllTimeFunnelTotals.mockResolvedValue(buildDefaultTotals());

    const Component = await AdminScoreboardSection();
    render(Component);

    // The WoW Growth hero metric should show em dash
    const wowSection = screen.getByLabelText(/week over week growth/i);
    expect(wowSection.querySelector('p')).toHaveTextContent('\u2014');
  });

  it('renders empty state when all data is zero', async () => {
    hoisted.getAdminFunnelMetrics.mockResolvedValue(
      buildDefaultMetrics({
        outreachSent7d: 0,
        claimClicks7d: 0,
        signups7d: 0,
        paidConversions7d: 0,
      })
    );
    hoisted.getWeeklyFunnelTrend.mockResolvedValue([]);
    hoisted.getAllTimeFunnelTotals.mockResolvedValue(
      buildDefaultTotals({
        scraped: 0,
        qualified: 0,
        contacted: 0,
        claimed: 0,
        signedUp: 0,
        paid: 0,
      })
    );

    const Component = await AdminScoreboardSection();
    render(Component);

    expect(screen.getByText('No funnel data yet')).toBeInTheDocument();
  });

  it('shows funnel when only claimClicks7d is non-zero', async () => {
    hoisted.getAdminFunnelMetrics.mockResolvedValue(
      buildDefaultMetrics({
        outreachSent7d: 0,
        claimClicks7d: 5,
        signups7d: 0,
        paidConversions7d: 0,
      })
    );
    hoisted.getWeeklyFunnelTrend.mockResolvedValue([]);
    hoisted.getAllTimeFunnelTotals.mockResolvedValue(
      buildDefaultTotals({
        scraped: 0,
        qualified: 0,
        contacted: 0,
        claimed: 0,
        signedUp: 0,
        paid: 0,
      })
    );

    const Component = await AdminScoreboardSection();
    render(Component);

    expect(screen.queryByText('No funnel data yet')).not.toBeInTheDocument();
    // Claimed step should render with count 5
    expect(screen.getByText('Claimed')).toBeInTheDocument();
  });

  it('renders error state when metrics has errors', async () => {
    hoisted.getAdminFunnelMetrics.mockResolvedValue(
      buildDefaultMetrics({ errors: ['Stripe unavailable'] })
    );
    hoisted.getWeeklyFunnelTrend.mockResolvedValue(defaultTrend);
    hoisted.getAllTimeFunnelTotals.mockResolvedValue(buildDefaultTotals());

    const Component = await AdminScoreboardSection();
    render(Component);

    expect(screen.getByText('Stripe unavailable')).toBeInTheDocument();
  });

  it('renders skeleton without error', () => {
    render(<AdminScoreboardSectionSkeleton />);
    expect(screen.getByTestId('admin-scoreboard-skeleton')).toBeInTheDocument();
  });
});
