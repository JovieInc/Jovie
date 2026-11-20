import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdminLead } from '@/lib/queries';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { LeadTable } from './LeadTable';

const leadsQuery = vi.fn();
const mutateAsync = vi.fn();
const toast = vi.hoisted(() => ({
  success: vi.fn(),
  warning: vi.fn(),
  error: vi.fn(),
}));

vi.mock('@/lib/queries', async () => {
  const [fetchQueries, { queryKeys }] = await Promise.all([
    vi.importActual<typeof import('@/lib/queries/fetch')>(
      '@/lib/queries/fetch'
    ),
    vi.importActual<typeof import('@/lib/queries/keys')>('@/lib/queries/keys'),
  ]);
  return {
    isForbiddenError: fetchQueries.isForbiddenError,
    queryKeys,
    useLeadsInfiniteQuery: (...args: unknown[]) => leadsQuery(...args),
    useUpdateLeadStatusMutation: () => ({ mutateAsync }),
  };
});

vi.mock('@/components/feedback', () => ({ toast }));

// The real search action needs a Tooltip provider; a labelled input stands in.
vi.mock('@/components/molecules/HeaderSearchAction', () => ({
  HeaderSearchAction: ({
    searchValue,
    onSearchValueChange,
    ariaLabel,
  }: {
    readonly searchValue: string;
    readonly onSearchValueChange: (value: string) => void;
    readonly ariaLabel: string;
  }) => (
    <input
      aria-label={ariaLabel}
      value={searchValue}
      onChange={event => onSearchValueChange(event.target.value)}
    />
  ),
}));

vi.mock('@/hooks/useSearchUrlSync', () => ({ useSearchUrlSync: vi.fn() }));

vi.mock('@/features/admin/AdminStepUp', () => ({
  AdminStepUp: () => <button type='button'>Verify with passkey</button>,
}));

const lead: AdminLead = {
  id: 'lead-1',
  linktreeHandle: 'testartist',
  linktreeUrl: 'https://linktr.ee/testartist',
  displayName: 'Test Artist',
  status: 'qualified',
  fitScore: 85,
  sourcePlatform: 'linktree',
  hasPaidTier: true,
  hasSpotifyLink: true,
  hasInstagram: false,
  hasTrackingPixels: false,
  trackingPixelPlatforms: [],
  musicToolsDetected: ['DistroKid'],
  contactEmail: 'test@example.com',
  createdAt: '2026-01-01T00:00:00Z',
};

const second: AdminLead = {
  ...lead,
  id: 'lead-2',
  linktreeHandle: 'northernlights',
  linktreeUrl: 'https://linktr.ee/northernlights',
  displayName: 'Northern Lights',
  status: 'approved',
};

function answer(overrides: Record<string, unknown> = {}) {
  const result = {
    data: { pages: [{ rows: [lead, second], total: 2 }], pageParams: [1] },
    error: null,
    isLoading: false,
    isError: false,
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: vi.fn().mockResolvedValue(undefined),
    refetch: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  leadsQuery.mockReturnValue(result);
  return result;
}

function renderTable(props: Parameters<typeof LeadTable>[0] = {}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const invalidate = vi.spyOn(client, 'invalidateQueries');
  const view = render(
    <QueryClientProvider client={client}>
      <LeadTable {...props} />
    </QueryClientProvider>
  );
  return { ...view, invalidate, client };
}

describe('LeadTable', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mutateAsync.mockReset();
  });

  it('renders leads with counts on the status tabs, axe-clean', async () => {
    answer();
    const { container } = renderTable({
      funnelCounts: { discovered: 145, qualified: 38 },
    });

    expect(screen.getByText('Test Artist')).toBeInTheDocument();
    expect(screen.getByText('Northern Lights')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Qualified (38)' })
    ).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(
      screen.getByRole('button', { name: 'Approved' })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Approve Northern Lights' })
    ).toBeNull();
    await expectNoA11yViolations(container);
  }, 30_000);

  it('filters the query by status when a tab is clicked', async () => {
    const user = userEvent.setup();
    answer();
    renderTable();

    await user.click(screen.getByRole('button', { name: 'Disqualified' }));

    expect(
      screen.getByRole('button', { name: 'Disqualified' })
    ).toHaveAttribute('aria-pressed', 'true');
    expect(leadsQuery).toHaveBeenLastCalledWith({
      sortBy: 'createdAt',
      status: 'disqualified',
    });
  });

  it('filters loaded rows by search and explains an empty match', async () => {
    const user = userEvent.setup();
    answer();
    renderTable();

    await user.type(screen.getByLabelText('Search leads'), 'northern');
    expect(screen.queryByText('Test Artist')).toBeNull();
    expect(screen.getByText('Northern Lights')).toBeInTheDocument();

    await user.type(screen.getByLabelText('Search leads'), 'zzz');
    expect(
      screen.getAllByText('No leads match your search').length
    ).toBeGreaterThan(0);
  });

  it('approves a lead and reports a successful ingestion', async () => {
    const user = userEvent.setup();
    answer();
    mutateAsync.mockResolvedValue({
      ingestion: { success: true, profileUsername: 'testartist' },
    });
    const { invalidate } = renderTable();

    await user.click(
      screen.getByRole('button', { name: 'Approve Test Artist' })
    );

    expect(mutateAsync).toHaveBeenCalledWith({
      id: 'lead-1',
      status: 'approved',
    });
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(
        'Lead approved and ingested as @testartist'
      )
    );
    expect(invalidate).toHaveBeenCalled();
  });

  it('warns when approval succeeds but ingestion fails', async () => {
    const user = userEvent.setup();
    answer();
    mutateAsync.mockResolvedValue({
      ingestion: { success: false, error: 'handle taken' },
    });
    renderTable();

    await user.click(
      screen.getByRole('button', { name: 'Approve Test Artist' })
    );

    await waitFor(() =>
      expect(toast.warning).toHaveBeenCalledWith(
        'Lead approved but ingestion failed: handle taken'
      )
    );
  });

  it('rejects a lead', async () => {
    const user = userEvent.setup();
    answer();
    mutateAsync.mockResolvedValueOnce({});
    renderTable();

    await user.click(
      screen.getByRole('button', { name: 'Reject Test Artist' })
    );
    expect(mutateAsync).toHaveBeenCalledWith({
      id: 'lead-1',
      status: 'rejected',
    });
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith('Lead rejected')
    );
  });

  it('reports a failed status update', async () => {
    const user = userEvent.setup();
    answer();
    mutateAsync.mockRejectedValue(new Error('boom'));
    renderTable();

    await user.click(
      screen.getByRole('button', { name: 'Reject Test Artist' })
    );
    // The copy interpolates the status verbatim (source: `Failed to ${status} lead`).
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('Failed to rejected lead')
    );
  });

  it('shows skeleton rows while loading, axe-clean', async () => {
    answer({ data: undefined, isLoading: true });
    const { container } = renderTable();

    expect(container.querySelectorAll('.skeleton').length).toBeGreaterThan(0);
    expect(screen.queryByText('Test Artist')).toBeNull();
    await expectNoA11yViolations(container);
  }, 30_000);

  it('shows the empty state, axe-clean', async () => {
    answer({ data: { pages: [{ rows: [], total: 0 }], pageParams: [1] } });
    const { container } = renderTable();

    expect(
      screen.getAllByText('No leads have been discovered yet').length
    ).toBeGreaterThan(0);
    await expectNoA11yViolations(container);
  });

  it('retries from the error state, axe-clean', async () => {
    const user = userEvent.setup();
    const { refetch } = answer({
      data: undefined,
      isError: true,
      error: new Error('boom'),
    });
    const { container } = renderTable();

    expect(screen.getByText('Unable to load leads')).toBeInTheDocument();
    await expectNoA11yViolations(container);
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('keeps cached rows and retries when a refresh fails, axe-clean', async () => {
    const user = userEvent.setup();
    const { refetch } = answer({ isError: true, error: new Error('boom') });
    const { container } = renderTable();

    expect(
      screen.getByText('Unable to refresh leads. Showing cached data.')
    ).toBeInTheDocument();
    expect(screen.getByText('Test Artist')).toBeInTheDocument();
    await expectNoA11yViolations(container);
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('asks for admin verification when the read is forbidden, axe-clean', async () => {
    const { FetchError } = await import('@/lib/queries/fetch');
    answer({
      data: undefined,
      isError: true,
      error: new FetchError('Forbidden', 403),
    });
    const { container } = renderTable();

    expect(screen.getByText('Admin verification required')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Verify with passkey' })
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('invalidates leads when the refresh key rises and follows initialSearch', async () => {
    answer();
    const { invalidate, rerender, client } = renderTable();
    expect(invalidate).not.toHaveBeenCalled();

    rerender(
      <QueryClientProvider client={client}>
        <LeadTable refreshKey={1} initialSearch='northern' />
      </QueryClientProvider>
    );

    expect(invalidate).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('Search leads')).toHaveValue('northern');
    expect(screen.queryByText('Test Artist')).toBeNull();
  });
});
