/**
 * Skeleton-flash regression test for ReleasesPageClient (JOV-2151).
 *
 * Pre-fix: `if (!releases && isLoading)` showed the skeleton on every
 * background refetch — TanStack's `isLoading` can spike briefly when a
 * mutation invalidates or window-focus refetch fires.
 *
 * Post-fix: `if (releases === undefined)` shows the skeleton only on
 * a true cold cache. Background refetches keep `data` defined via
 * `placeholderData`, so the skeleton never flashes.
 *
 * This test mocks the hooks the page consumes and asserts the
 * skeleton appears only when data is `undefined`.
 */
import { cleanup, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const useReleasesQueryMock = vi.fn();
const useDashboardDataMock = vi.fn();
const useAppFlagMock = vi.fn();

// Mock next/dynamic to bypass async imports; return components directly so
// the page renders the chosen view (not the dynamic loading skeleton).
vi.mock('next/dynamic', () => ({
  default: (
    _loader: () => Promise<unknown>,
    opts?: { loading?: () => unknown }
  ) => {
    // For this test we always exercise the page's terminal render paths,
    // so return a stub that renders one of the mocked view testids based
    // on the eventual import shape. The page uses two dynamic imports
    // (ReleasesExperience and ShellReleasesView); the file mocks below
    // intercept those module paths, but next/dynamic still wraps them.
    // Simplest: synchronously render a passthrough component.
    void opts;
    const Stub: React.FC<Record<string, unknown>> = props => (
      <div data-testid='dynamic-stub' {...(props as Record<string, never>)} />
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

vi.mock('@/lib/flags/client', () => ({
  useAppFlag: (flag: string) => useAppFlagMock(flag),
}));

vi.mock('@/features/dashboard/organisms/release-provider-matrix', () => ({
  ReleasesExperience: ({ releases }: { readonly releases: unknown[] }) => (
    <div data-testid='releases-experience' data-count={releases.length} />
  ),
}));

vi.mock(
  '@/features/dashboard/organisms/release-provider-matrix/shell-releases/ShellReleasesView',
  () => ({
    ShellReleasesView: ({ releases }: { readonly releases: unknown[] }) => (
      <div data-testid='shell-releases-view' data-count={releases.length} />
    ),
  })
);

vi.mock('@/app/app/(shell)/dashboard/releases/loading', () => ({
  ReleaseTableSkeleton: () => <div data-testid='release-table-skeleton' />,
}));

vi.mock('@/features/feedback/PageErrorState', () => ({
  PageErrorState: () => <div data-testid='page-error-state' />,
}));

describe('ReleasesPageClient — skeleton-flash invariant (JOV-2151)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useDashboardDataMock.mockReturnValue({
      selectedProfile: { id: 'p1', settings: {} },
    });
    useAppFlagMock.mockReturnValue(false);
  });

  afterEach(() => cleanup());

  async function renderPage() {
    const { ReleasesPageClient } = await import(
      '@/app/app/(shell)/dashboard/releases/ReleasesPageClient'
    );
    return render(<ReleasesPageClient />);
  }

  it('renders the skeleton when data is undefined (cold cache)', async () => {
    useReleasesQueryMock.mockReturnValue({
      data: undefined,
      isError: false,
    });
    await renderPage();
    expect(screen.getByTestId('release-table-skeleton')).toBeDefined();
    expect(screen.queryByTestId('dynamic-stub')).toBeNull();
  });

  it('does NOT render the skeleton when data is an empty array', async () => {
    // The pre-fix code would have rendered the skeleton here if
    // isLoading spiked during a refetch. The post-fix code does not.
    useReleasesQueryMock.mockReturnValue({
      data: [],
      isError: false,
    });
    await renderPage();
    expect(screen.queryByTestId('release-table-skeleton')).toBeNull();
    // Falls through to one of the populated views (now a next/dynamic stub).
    expect(screen.getByTestId('dynamic-stub')).toBeDefined();
  });

  it('does NOT render the skeleton when populated data is present (refetch)', async () => {
    useReleasesQueryMock.mockReturnValue({
      data: [{ id: 'r1' }, { id: 'r2' }],
      isError: false,
    });
    await renderPage();
    expect(screen.queryByTestId('release-table-skeleton')).toBeNull();
    expect(screen.getByTestId('dynamic-stub')).toBeDefined();
  });

  it('renders the error state on isError regardless of data', async () => {
    useReleasesQueryMock.mockReturnValue({
      data: [],
      isError: true,
    });
    await renderPage();
    expect(screen.getByTestId('page-error-state')).toBeDefined();
    expect(screen.queryByTestId('release-table-skeleton')).toBeNull();
  });
});
