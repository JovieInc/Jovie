import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { CalendarPageClient } from '@/app/app/(shell)/calendar/CalendarPageClient';

const mocks = vi.hoisted(() => ({
  loadReleaseMatrix: vi.fn(),
  loadTourDates: vi.fn(),
  useDashboardData: vi.fn(),
}));

vi.mock('@/app/app/(shell)/dashboard/DashboardDataContext', () => ({
  useDashboardData: mocks.useDashboardData,
}));

vi.mock('@/app/app/(shell)/dashboard/tour-dates/events-actions', () => ({
  confirmEvent: vi.fn(),
  confirmEvents: vi.fn(),
  loadTourDates: mocks.loadTourDates,
  rejectEvent: vi.fn(),
  rejectEvents: vi.fn(),
  undoRejectEvent: vi.fn(),
}));

vi.mock('@/components/features/dashboard/NavigationDestinationReady', () => ({
  NavigationDestinationReady: () => null,
}));

vi.mock('@/lib/releases/release-matrix-loader', () => ({
  loadReleaseMatrix: mocks.loadReleaseMatrix,
}));

vi.mock('@/lib/queries/useEventsQuery', async () => {
  const { useQuery } = await import('@tanstack/react-query');
  const { queryKeys, STANDARD_NO_REMOUNT_CACHE } = await import(
    '@/lib/queries'
  );

  return {
    useEventsQuery: (profileId: string) =>
      useQuery({
        queryKey: queryKeys.events.list(profileId),
        queryFn: ({ signal: _signal }) => mocks.loadTourDates(profileId),
        ...STANDARD_NO_REMOUNT_CACHE,
        enabled: Boolean(profileId),
      }),
  };
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(next => {
    resolve = next;
  });
  return { promise, resolve };
}

function QueryHarness({ children }: { readonly children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('CalendarPageClient query loading', () => {
  it('renders the stable workspace before client-owned data queries settle', async () => {
    const releases = deferred<[]>();
    const events = deferred<[]>();
    mocks.loadReleaseMatrix.mockReturnValueOnce(releases.promise);
    mocks.loadTourDates.mockReturnValueOnce(events.promise);
    mocks.useDashboardData.mockReturnValue({
      selectedProfile: { id: 'profile-1' },
    });

    render(<CalendarPageClient />, { wrapper: QueryHarness });

    expect(screen.getByTestId('calendar-workspace')).toBeInTheDocument();
    expect(screen.getByText('Loading calendar…')).not.toHaveClass('invisible');

    await waitFor(() => {
      expect(mocks.loadReleaseMatrix).toHaveBeenCalledWith('profile-1');
      expect(mocks.loadTourDates).toHaveBeenCalledWith('profile-1');
    });

    releases.resolve([]);
    events.resolve([]);

    await waitFor(() => {
      expect(screen.getByText('Loading calendar…')).toHaveClass('invisible');
    });
  });
});
