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
  DashboardSegmentSkeleton: () => (
    <div data-testid='dashboard-segment-skeleton' />
  ),
}));
vi.mock('@/components/shell/LyricsRouteSkeleton', () => ({
  LyricsRouteSkeleton: () => null,
}));
vi.mock('@/components/shell/TasksRouteSkeleton', () => ({
  TasksRouteSkeleton: () => null,
}));
vi.mock('./calendar/LazyCalendarPageClient', () => ({
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
    ['insights', APP_ROUTES.INSIGHTS],
    ['nested admin', APP_ROUTES.ADMIN_ACTIVITY],
  ])('uses the generic skeleton for %s routes', async (_name, pathname) => {
    mockHeaders.mockResolvedValue(new Headers({ 'next-url': pathname }));

    const { getByTestId, queryByTestId } = render(await ShellLoading());

    expect(getByTestId('dashboard-segment-skeleton')).toBeInTheDocument();
    expect(queryByTestId('settings-route-skeleton')).toBeNull();
  });
});
