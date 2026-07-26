import { render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { APP_ROUTES } from '@/constants/routes';

const mockHeaders = vi.hoisted(() => vi.fn());

vi.mock('next/headers', () => ({
  headers: mockHeaders,
}));

vi.mock(
  '@/components/features/dashboard/organisms/dashboard-audience-table/AudienceTableLoadingShell',
  () => ({ AudienceTableLoadingShell: () => null })
);
vi.mock('@/components/organisms/PageShell', () => ({
  PageShell: ({
    children,
    'data-testid': testId,
  }: {
    readonly children: ReactNode;
    readonly 'data-testid'?: string;
  }) => <section data-testid={testId}>{children}</section>,
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
vi.mock('@/components/shell/LyricsRouteSkeleton', () => ({
  LyricsRouteSkeleton: () => null,
}));
vi.mock('@/components/shell/TasksRouteSkeleton', () => ({
  TasksRouteSkeleton: () => null,
}));
vi.mock('./calendar/CalendarRouteSkeleton', () => ({
  CalendarRouteSkeleton: () => null,
}));
vi.mock('./chat/loading', () => ({ default: () => null }));
vi.mock('./dashboard/releases/loading', () => ({
  ReleaseTableSkeleton: () => null,
}));
vi.mock('./library/LibrarySurface', () => ({
  LibraryLoadingState: () => null,
}));

import ShellLoading from './loading';

describe('ShellLoading', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses the settings skeleton for the presence redirect route', async () => {
    mockHeaders.mockResolvedValue(
      new Headers({ 'next-url': APP_ROUTES.PRESENCE })
    );

    const { getByTestId, queryByTestId } = render(await ShellLoading());

    expect(getByTestId('settings-route-skeleton')).toBeInTheDocument();
    expect(getByTestId('settings-loading-skeleton')).toBeInTheDocument();
    expect(queryByTestId('presence-loading-skeleton')).toBeNull();
  });

  it.each([
    ['insights', APP_ROUTES.INSIGHTS, 'insights'],
    ['legacy insights', `${APP_ROUTES.LEGACY_DASHBOARD}/insights`, 'insights'],
    ['nested admin', APP_ROUTES.ADMIN_ACTIVITY, 'admin'],
    ['profiles workspace', APP_ROUTES.PROFILES, 'profile'],
  ])('uses the %s route-shaped skeleton', async (_name, pathname, expectedVariant) => {
    mockHeaders.mockResolvedValue(new Headers({ 'next-url': pathname }));

    const { getByTestId, queryByTestId } = render(await ShellLoading());

    expect(getByTestId('dashboard-segment-skeleton')).toHaveAttribute(
      'data-skeleton-variant',
      expectedVariant
    );
    expect(queryByTestId('settings-route-skeleton')).toBeNull();
  });

  it.each([
    ['canonical tour alias', APP_ROUTES.TOUR_DATES],
    ['legacy dashboard tour alias', APP_ROUTES.DASHBOARD_TOUR_DATES],
  ])('uses the tour table-workspace skeleton for %s', async (_name, pathname) => {
    mockHeaders.mockResolvedValue(new Headers({ 'next-url': pathname }));

    const { getByTestId, queryByTestId } = render(await ShellLoading());

    expect(getByTestId('dashboard-segment-skeleton')).toHaveAttribute(
      'data-skeleton-variant',
      'tour'
    );
    expect(queryByTestId('settings-route-skeleton')).toBeNull();
  });

  it('keeps touring settings on the settings form skeleton', async () => {
    mockHeaders.mockResolvedValue(
      new Headers({ 'next-url': APP_ROUTES.SETTINGS_TOURING })
    );

    const { getByTestId, queryByTestId } = render(await ShellLoading());

    expect(getByTestId('settings-route-skeleton')).toBeInTheDocument();
    expect(queryByTestId('dashboard-segment-skeleton')).toBeNull();
  });
});
