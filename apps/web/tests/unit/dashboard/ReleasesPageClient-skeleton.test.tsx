import { cleanup, render, screen } from '@testing-library/react';
import type { FC } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const useReleasesQueryMock = vi.fn();
const useDashboardDataMock = vi.fn();

vi.mock('next/dynamic', () => ({
  default: (
    _loader: () => Promise<unknown>,
    opts?: { loading?: () => unknown }
  ) => {
    void opts;
    const Stub: FC<Record<string, unknown>> = () => (
      <div data-testid='dynamic-stub' />
    );
    return Stub;
  },
}));

vi.mock('@/lib/queries/useReleasesQuery', () => ({
  useReleasesQuery: (...args: unknown[]) => useReleasesQueryMock(...args),
}));

vi.mock('@/app/app/(shell)/dashboard/DashboardDataContext', () => ({
  useDashboardData: () => useDashboardDataMock(),
}));

vi.mock('@/features/dashboard/organisms/release-provider-matrix', () => ({
  ReleasesExperience: ({ releases }: { readonly releases: unknown[] }) => (
    <div data-testid='releases-experience' data-count={releases.length} />
  ),
}));

vi.mock(
  '@/components/features/dashboard/organisms/release-provider-matrix/shell-releases/ShellReleasesView',
  () => ({
    ShellReleasesView: () => <div data-testid='shell-releases-view' />,
  })
);

vi.mock('@/app/app/(shell)/dashboard/releases/loading', () => ({
  ReleaseTableSkeleton: () => <div data-testid='release-table-skeleton' />,
}));

vi.mock('@/features/feedback/PageErrorState', () => ({
  PageErrorState: () => <div data-testid='page-error-state' />,
}));

vi.mock('@/lib/flags/client', () => ({
  useAppFlag: () => false,
}));

describe('ReleasesPageClient skeleton behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useDashboardDataMock.mockReturnValue({
      selectedProfile: { id: 'p1', settings: {} },
    });
  });

  afterEach(() => cleanup());

  async function renderPage() {
    const { ReleasesPageClient } = await import(
      '@/app/app/(shell)/dashboard/releases/ReleasesPageClient'
    );
    return render(<ReleasesPageClient />);
  }

  it('renders the skeleton when data is undefined', async () => {
    useReleasesQueryMock.mockReturnValue({
      data: undefined,
      isError: false,
    });

    await renderPage();

    expect(screen.getByTestId('release-table-skeleton')).toBeDefined();
    expect(screen.queryByTestId('dynamic-stub')).toBeNull();
  });

  it('keeps the releases view mounted when data is an empty array', async () => {
    useReleasesQueryMock.mockReturnValue({
      data: [],
      isError: false,
    });

    await renderPage();

    expect(screen.queryByTestId('release-table-skeleton')).toBeNull();
    expect(screen.getByTestId('dynamic-stub')).toBeDefined();
  });

  it('keeps the releases view mounted when populated data is present', async () => {
    useReleasesQueryMock.mockReturnValue({
      data: [{ id: 'r1' }, { id: 'r2' }],
      isError: false,
    });

    await renderPage();

    expect(screen.queryByTestId('release-table-skeleton')).toBeNull();
    expect(screen.getByTestId('dynamic-stub')).toBeDefined();
  });

  it('renders the error state when isError and no data are present', async () => {
    useReleasesQueryMock.mockReturnValue({
      data: undefined,
      isError: true,
    });

    await renderPage();

    expect(screen.getByTestId('page-error-state')).toBeDefined();
    expect(screen.queryByTestId('release-table-skeleton')).toBeNull();
  });

  it('keeps the releases view mounted during background refetch errors', async () => {
    useReleasesQueryMock.mockReturnValue({
      data: [],
      isError: true,
    });

    await renderPage();

    expect(screen.queryByTestId('page-error-state')).toBeNull();
    expect(screen.getByTestId('dynamic-stub')).toBeDefined();
  });
});
