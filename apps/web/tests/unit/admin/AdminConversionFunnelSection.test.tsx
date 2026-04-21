import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { ConversionFunnelData } from '@/lib/admin/conversion-funnel';

const mockGetConversionFunnelData = vi.hoisted(() => vi.fn());

vi.mock('@/lib/admin/conversion-funnel', () => ({
  getConversionFunnelData: mockGetConversionFunnelData,
}));

function makeFunnelData(
  overrides: Partial<ConversionFunnelData> = {}
): ConversionFunnelData {
  return {
    stages: [
      {
        key: 'total_users',
        label: 'Total Users',
        count: 100,
        conversionRate: null,
        dropOff: null,
      },
      {
        key: 'with_profiles',
        label: 'With Profiles',
        count: 50,
        conversionRate: 0.5,
        dropOff: 50,
      },
      {
        key: 'profile_complete',
        label: 'Profile Complete',
        count: 30,
        conversionRate: 0.6,
        dropOff: 20,
      },
      {
        key: 'has_subscribers',
        label: 'Has Subscribers',
        count: 10,
        conversionRate: 0.333,
        dropOff: 20,
      },
      {
        key: 'paid',
        label: 'Paid',
        count: 5,
        conversionRate: 0.5,
        dropOff: 5,
      },
    ],
    timeRange: 'all',
    errors: [],
    ...overrides,
  };
}

describe('AdminConversionFunnelSection', () => {
  it('renders 5 metric cards', async () => {
    mockGetConversionFunnelData.mockResolvedValue(makeFunnelData());

    const { AdminConversionFunnelSection } = await import(
      '@/app/app/(shell)/admin/_components/AdminConversionFunnelSection'
    );

    const result = await AdminConversionFunnelSection();
    render(result);

    expect(screen.getByText('Total Users')).toBeDefined();
    expect(screen.getByText('With Profiles')).toBeDefined();
    expect(screen.getByText('Profile Complete')).toBeDefined();
    expect(screen.getByText('Has Subscribers')).toBeDefined();
    expect(screen.getByText('Paid')).toBeDefined();
  });

  it('shows "Outbound Funnel" title', async () => {
    mockGetConversionFunnelData.mockResolvedValue(makeFunnelData());

    const { AdminConversionFunnelSection } = await import(
      '@/app/app/(shell)/admin/_components/AdminConversionFunnelSection'
    );

    const result = await AdminConversionFunnelSection();
    render(result);

    expect(screen.getByText('Outbound Funnel')).toBeDefined();
  });

  it('shows error message when funnel has errors', async () => {
    mockGetConversionFunnelData.mockResolvedValue(
      makeFunnelData({ errors: ['Funnel query: connection refused'] })
    );

    const { AdminConversionFunnelSection } = await import(
      '@/app/app/(shell)/admin/_components/AdminConversionFunnelSection'
    );

    const result = await AdminConversionFunnelSection();
    render(result);

    expect(screen.getByText('Funnel query: connection refused')).toBeDefined();
  });
});
