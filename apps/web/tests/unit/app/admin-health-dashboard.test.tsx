import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  getAdminFunnelMetrics: vi.fn(),
  getAdminReliabilitySummary: vi.fn(),
  getWaitlistMetrics: vi.fn(),
}));

vi.mock('@/lib/admin/funnel-metrics', () => ({
  getAdminFunnelMetrics: hoisted.getAdminFunnelMetrics,
}));

vi.mock('@/lib/admin/overview', () => ({
  getAdminReliabilitySummary: hoisted.getAdminReliabilitySummary,
}));

vi.mock('@/lib/admin/waitlist', () => ({
  getWaitlistMetrics: hoisted.getWaitlistMetrics,
}));

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
    [key: string]: unknown;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const { AdminHealthDashboard, AdminHealthDashboardSkeleton } = await import(
  '@/app/app/(shell)/admin/_components/AdminHealthDashboard'
);

describe('AdminHealthDashboard', () => {
  it('renders one linked health tile per primary admin area', async () => {
    hoisted.getAdminFunnelMetrics.mockResolvedValue({
      signups7d: 12,
      mrrUsd: 847,
      stripeAvailable: true,
      errors: [],
    });
    hoisted.getAdminReliabilitySummary.mockResolvedValue({
      errorRatePercent: 0.1,
      reliabilityScorePercent: 99.9,
      p95LatencyMs: 40,
      incidents24h: 0,
      lastIncidentAt: null,
      unresolvedSentryIssues24h: 0,
      redisAvailable: true,
      deploymentAvailability: 'available',
      deploymentState: 'success',
    });
    hoisted.getWaitlistMetrics.mockResolvedValue({
      total: 40,
      waitlisted: 18,
      invited: 10,
      signedUp: 12,
      emailFailures: 0,
    });

    const ui = await AdminHealthDashboard();
    render(ui);

    expect(screen.getByTestId('admin-health-dashboard')).toBeInTheDocument();

    const business = screen.getByTestId('admin-health-business');
    expect(business).toHaveAttribute('href', '/app/ov/revenue-lift');
    expect(business).toHaveTextContent('Business');
    expect(business).toHaveTextContent('Monthly Recurring Revenue');

    const growth = screen.getByTestId('admin-health-growth');
    expect(growth).toHaveAttribute('href', '/app/ov/growth');
    expect(growth).toHaveTextContent('Weekly Signups');
    expect(growth).toHaveTextContent('12');

    const ops = screen.getByTestId('admin-health-ops');
    expect(ops).toHaveAttribute('href', '/app/ov/ops');
    expect(ops).toHaveTextContent('Healthy');

    const people = screen.getByTestId('admin-health-people');
    expect(people).toHaveAttribute('href', '/app/ov/people?view=waitlist');
    expect(people).toHaveTextContent('18');
  });

  it('reserves tile height in the loading skeleton', () => {
    render(<AdminHealthDashboardSkeleton />);
    expect(
      screen.getByTestId('admin-health-dashboard-skeleton')
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('admin-health-dashboard-skeleton').children
    ).toHaveLength(4);
  });
});
