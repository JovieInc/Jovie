/**
 * Sibling skeleton-flash regression test for PresencePageClient (JOV-2151).
 *
 * PresencePageClient had the same `if (isLoading && !data)` anti-pattern as
 * ReleasesPageClient. The scan-for-similar-bugs rule in
 * `.claude/rules/code-style.md` requires fixing both in the same pass.
 *
 * Same invariant: skeleton only on `data === undefined`, never on refetch.
 */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const useDspPresenceQueryMock = vi.fn();
const useDashboardDataMock = vi.fn();

vi.mock('@/lib/queries/useDspPresenceQuery', () => ({
  useDspPresenceQuery: (...args: unknown[]) => useDspPresenceQueryMock(...args),
}));

vi.mock('@/app/app/(shell)/dashboard/DashboardDataContext', () => ({
  useDashboardData: () => useDashboardDataMock(),
}));

vi.mock('@/features/dashboard/organisms/dsp-presence/DspPresenceView', () => ({
  DspPresenceView: () => <div data-testid='dsp-presence-view' />,
}));

vi.mock('@/features/feedback/PageErrorState', () => ({
  PageErrorState: () => <div data-testid='page-error-state' />,
}));

vi.mock('@/app/app/(shell)/dashboard/presence/loading', () => ({
  default: () => <div data-testid='presence-loading-skeleton' />,
}));

describe('PresencePageClient — skeleton-flash invariant (JOV-2151)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useDashboardDataMock.mockReturnValue({
      selectedProfile: { id: 'p1' },
    });
  });

  afterEach(() => cleanup());

  async function renderPage() {
    const { PresencePageClient } = await import(
      '@/app/app/(shell)/dashboard/presence/PresencePageClient'
    );
    return render(<PresencePageClient />);
  }

  it('renders the skeleton when data is undefined (cold cache)', async () => {
    useDspPresenceQueryMock.mockReturnValue({
      data: undefined,
      isError: false,
    });
    await renderPage();
    expect(screen.getByTestId('presence-loading-skeleton')).toBeDefined();
  });

  it('does NOT render the skeleton when data is defined (refetch path)', async () => {
    useDspPresenceQueryMock.mockReturnValue({
      data: { items: [] },
      isError: false,
    });
    await renderPage();
    expect(screen.queryByTestId('presence-loading-skeleton')).toBeNull();
    expect(screen.getByTestId('dsp-presence-view')).toBeDefined();
  });

  it('renders the error state on isError when data is defined', async () => {
    useDspPresenceQueryMock.mockReturnValue({
      data: { items: [] },
      isError: true,
    });
    await renderPage();
    expect(screen.getByTestId('page-error-state')).toBeDefined();
    expect(screen.queryByTestId('presence-loading-skeleton')).toBeNull();
  });
});
