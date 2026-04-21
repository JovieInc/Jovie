import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { AdminProductFunnelDashboard } from '@/lib/admin/product-funnel';

const mockGetAdminProductFunnelDashboard = vi.hoisted(() => vi.fn());

vi.mock('@/lib/admin/product-funnel', () => ({
  getAdminProductFunnelDashboard: mockGetAdminProductFunnelDashboard,
}));

function makeDashboard(
  overrides: Partial<AdminProductFunnelDashboard> = {}
): AdminProductFunnelDashboard {
  return {
    timeRange: '24h',
    stages: [
      {
        key: 'visit',
        label: 'Visit',
        count: 20,
        conversionRate: null,
        dropOff: null,
      },
      {
        key: 'signup_started',
        label: 'Signup Started',
        count: 10,
        conversionRate: 0.5,
        dropOff: 10,
      },
      {
        key: 'signup_completed',
        label: 'Signup Completed',
        count: 5,
        conversionRate: 0.5,
        dropOff: 5,
      },
      {
        key: 'email_verified',
        label: 'Email Verified',
        count: 4,
        conversionRate: 0.8,
        dropOff: 1,
      },
      {
        key: 'onboarding_started',
        label: 'Onboarding Started',
        count: 4,
        conversionRate: 1,
        dropOff: 0,
      },
      {
        key: 'onboarding_completed',
        label: 'Onboarding Completed',
        count: 3,
        conversionRate: 0.75,
        dropOff: 1,
      },
      {
        key: 'activated',
        label: 'Activated',
        count: 3,
        conversionRate: 1,
        dropOff: 0,
      },
      {
        key: 'checkout_started',
        label: 'Checkout Started',
        count: 2,
        conversionRate: 0.667,
        dropOff: 1,
      },
      {
        key: 'payment_succeeded',
        label: 'Payment Succeeded',
        count: 1,
        conversionRate: 0.5,
        dropOff: 1,
      },
      {
        key: 'retained_day_1',
        label: 'Retained Day 1',
        count: 1,
        conversionRate: 1,
        dropOff: 0,
      },
      {
        key: 'retained_day_7',
        label: 'Retained Day 7',
        count: 0,
        conversionRate: 0,
        dropOff: 1,
      },
    ],
    activeAlerts: [],
    externalEngagement: {
      profileEngagedDay1: 2,
      profileEngagedDay7: 1,
    },
    syntheticMonitor: {
      monitorKey: 'synthetic_signup',
      status: 'success',
      lastStartedAt: new Date('2026-04-18T12:00:00Z'),
      lastFinishedAt: new Date('2026-04-18T12:01:00Z'),
      error: null,
      consecutiveFailures: 0,
    },
    latestPaymentSucceededAt: new Date('2026-04-18T08:00:00Z'),
    latestRetentionMaterializedAt: new Date('2026-04-18T09:00:00Z'),
    dataCollectionStartedAt: new Date('2026-04-17T09:00:00Z'),
    sentryReliabilityNote:
      '10-minute production error-rate alerting is managed in Sentry.',
    errors: [],
    ...overrides,
  };
}

describe('AdminProductFunnelSection', () => {
  it('renders the funnel stages and external engagement metrics', async () => {
    mockGetAdminProductFunnelDashboard.mockResolvedValue(makeDashboard());

    const { AdminProductFunnelSection } = await import(
      '@/app/app/(shell)/admin/_components/AdminProductFunnelSection'
    );

    const result = await AdminProductFunnelSection({});
    render(result);

    expect(screen.getByText('Product Funnel')).toBeInTheDocument();
    expect(screen.getByText('Signup Started')).toBeInTheDocument();
    expect(screen.getByText('Payment Succeeded')).toBeInTheDocument();
    expect(screen.getByText('Profile Engaged Day 1')).toBeInTheDocument();
    expect(screen.getByText('Profile Engaged Day 7')).toBeInTheDocument();
  });

  it('renders active alerts and synthetic monitor state', async () => {
    mockGetAdminProductFunnelDashboard.mockResolvedValue(
      makeDashboard({
        activeAlerts: [
          {
            ruleName: 'signup_completion_stalled',
            severity: 'critical',
            reason:
              'Signup started is 6 in the last 24h and signup completed is 0.',
            lastTriggeredAt: new Date('2026-04-18T11:00:00Z'),
          },
        ],
        syntheticMonitor: {
          monitorKey: 'synthetic_signup',
          status: 'failure',
          lastStartedAt: new Date('2026-04-18T12:00:00Z'),
          lastFinishedAt: new Date('2026-04-18T12:01:00Z'),
          error: 'Synthetic signup failed',
          consecutiveFailures: 2,
        },
      })
    );

    const { AdminProductFunnelSection } = await import(
      '@/app/app/(shell)/admin/_components/AdminProductFunnelSection'
    );

    const result = await AdminProductFunnelSection({});
    render(result);

    expect(
      screen.getByText(
        'Signup started is 6 in the last 24h and signup completed is 0.'
      )
    ).toBeInTheDocument();
    expect(screen.getByText(/Synthetic Signup: failure/i)).toBeInTheDocument();
    expect(
      screen.getByText(
        '10-minute production error-rate alerting is managed in Sentry.'
      )
    ).toBeInTheDocument();
  });
});
