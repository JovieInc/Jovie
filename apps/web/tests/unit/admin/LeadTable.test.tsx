import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AdminLead } from '@/lib/queries';

// Mock the queries
const mockLeadsInfiniteQuery = vi.fn();
const mockUpdateLeadStatusMutation = vi.fn();

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
    useLeadsInfiniteQuery: (...args: unknown[]) =>
      mockLeadsInfiniteQuery(...args),
    useUpdateLeadStatusMutation: () => mockUpdateLeadStatusMutation(),
  };
});

// Mock HeaderSearchAction (uses Tooltip which needs provider)
vi.mock('@/components/molecules/HeaderSearchAction', () => ({
  HeaderSearchAction: ({
    searchValue,
    onSearchValueChange,
  }: {
    searchValue: string;
    onSearchValueChange: (v: string) => void;
  }) => (
    <input
      data-testid='search-input'
      value={searchValue}
      onChange={e => onSearchValueChange(e.target.value)}
    />
  ),
}));

vi.mock('@/hooks/useSearchUrlSync', () => ({
  useSearchUrlSync: () => {},
}));

vi.mock('@/lib/auth/client', () => ({
  authClient: {
    passkey: {
      listUserPasskeys: vi.fn(),
      addPasskey: vi.fn(),
    },
    signIn: { passkey: vi.fn() },
  },
}));

// Mock sonner
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
  },
}));

function createMockLead(overrides: Partial<AdminLead> = {}): AdminLead {
  return {
    id: '1',
    linktreeHandle: 'testartist',
    linktreeUrl: 'https://linktr.ee/testartist',
    displayName: 'Test Artist',
    status: 'qualified',
    fitScore: 85,
    hasPaidTier: true,
    hasSpotifyLink: true,
    hasInstagram: false,
    musicToolsDetected: ['DistroKid'],
    contactEmail: 'test@example.com',
    createdAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function renderWithProviders(ui: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
  );
}

// Lazy import to allow mocks to be set up first
async function getLeadTable() {
  const { LeadTable } = await import(
    '@/components/features/admin/leads/LeadTable'
  );
  return LeadTable;
}

describe('LeadTable', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();

    mockUpdateLeadStatusMutation.mockReturnValue({
      mutateAsync: vi.fn(),
    });
  });

  it('renders loading state', async () => {
    mockLeadsInfiniteQuery.mockReturnValue({
      data: undefined,
      isLoading: true,
      hasNextPage: false,
      isFetchingNextPage: false,
      fetchNextPage: vi.fn(),
      refetch: vi.fn(),
    });

    const LeadTable = await getLeadTable();
    renderWithProviders(<LeadTable />);

    // UnifiedTable shows skeleton rows during loading — verify no data rows appear
    expect(screen.queryByText('Test Lead')).not.toBeInTheDocument();
    // Skeleton elements should be present
    const skeletons = document.querySelectorAll('.skeleton');
    expect(skeletons.length).toBeGreaterThan(0);
  }, 30_000);

  it('renders empty state when no leads exist', async () => {
    mockLeadsInfiniteQuery.mockReturnValue({
      data: { pages: [{ rows: [], total: 0 }], pageParams: [1] },
      isLoading: false,
      hasNextPage: false,
      isFetchingNextPage: false,
      fetchNextPage: vi.fn(),
      refetch: vi.fn(),
    });

    const LeadTable = await getLeadTable();
    renderWithProviders(<LeadTable />);

    expect(
      screen.getAllByText('No leads have been discovered yet').length
    ).toBeGreaterThan(0);
  }, 15_000);

  it('renders lead data in table columns', async () => {
    const lead = createMockLead();
    mockLeadsInfiniteQuery.mockReturnValue({
      data: { pages: [{ rows: [lead], total: 1 }], pageParams: [1] },
      isLoading: false,
      hasNextPage: false,
      isFetchingNextPage: false,
      fetchNextPage: vi.fn(),
      refetch: vi.fn(),
    });

    const LeadTable = await getLeadTable();
    renderWithProviders(<LeadTable />);

    expect(screen.getByText('Test Artist')).toBeInTheDocument();
    expect(screen.getByText('@testartist')).toBeInTheDocument();
    expect(screen.getByText('qualified')).toBeInTheDocument();
    expect(screen.getByText('85')).toBeInTheDocument();
    expect(screen.getByText('Spotify')).toBeInTheDocument();
    expect(screen.getByText('Paid')).toBeInTheDocument();
    expect(screen.getByText('DistroKid')).toBeInTheDocument();

    const row = document.querySelector('tbody tr');
    // Canonical shell row via presets.tableRow / rowState (no explicit 'group' needed for this table)
    expect(row).toHaveClass('system-b-table-row-hover');
    // Leads sit on the 32px dense people row with a face (JOV-7798).
    expect(
      document.querySelector('table[data-table-row-mode="dense"]')
    ).not.toBeNull();
    expect(row?.querySelector('[data-table-person-cell]')).toHaveTextContent(
      'Test Artist@testartist'
    );
  });

  it('renders status filter tabs', async () => {
    mockLeadsInfiniteQuery.mockReturnValue({
      data: { pages: [{ rows: [], total: 0 }], pageParams: [1] },
      isLoading: false,
      hasNextPage: false,
      isFetchingNextPage: false,
      fetchNextPage: vi.fn(),
      refetch: vi.fn(),
    });

    const LeadTable = await getLeadTable();
    renderWithProviders(<LeadTable />);

    expect(screen.getByText('All')).toBeInTheDocument();
    expect(screen.getByText('Discovered')).toBeInTheDocument();
    expect(screen.getByText('Qualified')).toBeInTheDocument();
    expect(screen.getByText('Approved')).toBeInTheDocument();
    expect(screen.getByText('Rejected')).toBeInTheDocument();
  });

  it('calls query with status filter when tab is clicked', async () => {
    mockLeadsInfiniteQuery.mockReturnValue({
      data: { pages: [{ rows: [], total: 0 }], pageParams: [1] },
      isLoading: false,
      hasNextPage: false,
      isFetchingNextPage: false,
      fetchNextPage: vi.fn(),
      refetch: vi.fn(),
    });

    const LeadTable = await getLeadTable();
    renderWithProviders(<LeadTable />);

    const user = userEvent.setup();
    await user.click(screen.getByText('Qualified'));

    expect(screen.getByRole('button', { name: 'Qualified' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );

    // The query should have been called with the status filter
    const lastCall =
      mockLeadsInfiniteQuery.mock.calls[
        mockLeadsInfiniteQuery.mock.calls.length - 1
      ];
    expect(lastCall[0]).toMatchObject({ status: 'qualified' });
  });

  it('shows approve and reject buttons for qualified leads', async () => {
    const lead = createMockLead({ status: 'qualified' });
    mockLeadsInfiniteQuery.mockReturnValue({
      data: { pages: [{ rows: [lead], total: 1 }], pageParams: [1] },
      isLoading: false,
      hasNextPage: false,
      isFetchingNextPage: false,
      fetchNextPage: vi.fn(),
      refetch: vi.fn(),
    });

    const LeadTable = await getLeadTable();
    renderWithProviders(<LeadTable />);

    expect(screen.getByLabelText(/^Approve /)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Reject /)).toBeInTheDocument();
  });

  it('does not show action buttons for approved leads', async () => {
    const lead = createMockLead({ status: 'approved' });
    mockLeadsInfiniteQuery.mockReturnValue({
      data: { pages: [{ rows: [lead], total: 1 }], pageParams: [1] },
      isLoading: false,
      hasNextPage: false,
      isFetchingNextPage: false,
      fetchNextPage: vi.fn(),
      refetch: vi.fn(),
    });

    const LeadTable = await getLeadTable();
    renderWithProviders(<LeadTable />);

    // The "Approve & ingest" title should not appear as an action button
    expect(screen.queryByTitle('Approve & ingest')).not.toBeInTheDocument();
    // "Reject" title button should not appear
    expect(screen.queryByTitle('Reject')).not.toBeInTheDocument();
  });

  it('shows signals badges based on lead data', async () => {
    const lead = createMockLead({
      hasSpotifyLink: true,
      hasPaidTier: false,
      hasInstagram: true,
      contactEmail: null,
    });
    mockLeadsInfiniteQuery.mockReturnValue({
      data: { pages: [{ rows: [lead], total: 1 }], pageParams: [1] },
      isLoading: false,
      hasNextPage: false,
      isFetchingNextPage: false,
      fetchNextPage: vi.fn(),
      refetch: vi.fn(),
    });

    const LeadTable = await getLeadTable();
    renderWithProviders(<LeadTable />);

    expect(screen.getByText('Spotify')).toBeInTheDocument();
    expect(screen.getByText('IG')).toBeInTheDocument();
    expect(screen.queryByText('Paid')).not.toBeInTheDocument();
    expect(screen.queryByText('Email')).not.toBeInTheDocument();
  });

  it('renders a retryable error state when the lead query fails', async () => {
    const refetch = vi.fn().mockResolvedValue(undefined);
    mockLeadsInfiniteQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      hasNextPage: false,
      isFetchingNextPage: false,
      fetchNextPage: vi.fn(),
      refetch,
    });

    const LeadTable = await getLeadTable();
    renderWithProviders(<LeadTable />);

    expect(screen.getByText('Unable to load leads')).toBeInTheDocument();
    const retryButton = screen.getByRole('button', { name: 'Retry' });
    expect(retryButton).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(retryButton);
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('renders an admin verification state when the leads request is forbidden', async () => {
    const { FetchError } = await import('@/lib/queries/fetch');
    mockLeadsInfiniteQuery.mockReturnValue({
      data: undefined,
      error: new FetchError('Forbidden', 403),
      isLoading: false,
      isError: true,
      hasNextPage: false,
      isFetchingNextPage: false,
      fetchNextPage: vi.fn(),
      refetch: vi.fn(),
    });

    const LeadTable = await getLeadTable();
    renderWithProviders(<LeadTable />);

    expect(screen.getByText('Admin verification required')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Unlock' })).toBeInTheDocument();
    expect(
      screen.queryByText('No leads have been discovered yet')
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Unable to load leads')).not.toBeInTheDocument();
  });
});
