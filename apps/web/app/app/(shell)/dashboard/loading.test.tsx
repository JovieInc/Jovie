import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { APP_ROUTES } from '@/constants/routes';

const mockHeaders = vi.hoisted(() => vi.fn());

vi.mock('next/headers', () => ({
  headers: mockHeaders,
}));

vi.mock('@/components/shell/DashboardSegmentSkeleton', () => ({
  DashboardSegmentSkeleton: ({
    variant = 'default',
  }: {
    readonly variant?: string;
  }) => (
    <div
      data-testid='dashboard-segment-skeleton'
      data-skeleton-variant={variant}
    />
  ),
}));

import DashboardLoading from './loading';

describe('DashboardLoading', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    [`${APP_ROUTES.LEGACY_DASHBOARD}/insights`, 'insights'],
    [APP_ROUTES.DASHBOARD_PROFILE, 'default'],
    [APP_ROUTES.DASHBOARD_TOUR_DATES, 'tour'],
    [APP_ROUTES.DASHBOARD_EARNINGS, 'default'],
  ] as const)('dispatches %s to the %s skeleton', async (pathname, expectedVariant) => {
    mockHeaders.mockResolvedValue(new Headers({ 'next-url': pathname }));

    render(await DashboardLoading());

    expect(screen.getByTestId('dashboard-segment-skeleton')).toHaveAttribute(
      'data-skeleton-variant',
      expectedVariant
    );
  });
});
