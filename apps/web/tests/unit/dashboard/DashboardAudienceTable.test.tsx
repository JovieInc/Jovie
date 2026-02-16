import { TooltipProvider } from '@jovie/ui';
import { type RenderOptions, render, screen } from '@testing-library/react';
import * as React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TablePanelProvider } from '@/contexts/TablePanelContext';
import type { AudienceMember } from '@/types';

/**
 * DashboardAudienceTable Tests
 *
 * The full component import tree (sidebar, UnifiedTable barrel with 60+ exports,
 * etc.) exceeds Vitest fork worker memory limits. We mock all heavy sub-components
 * and test the component's rendering contract: empty states, data-testid presence,
 * and correct prop forwarding to the table.
 *
 * Virtualization behavior is covered by the UnifiedTable/VirtualizedTableBody
 * unit tests and integration tests which can load the table system in isolation.
 */

// ── Mock heavy transitive dependencies ──

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/app/dashboard/audience',
}));

vi.mock('@/components/organisms/AuthShellWrapper', () => ({
  useTableMeta: () => ({
    tableMeta: { rowCount: null, toggle: null, rightPanelWidth: null },
    setTableMeta: vi.fn(),
  }),
}));

vi.mock('@/lib/hooks/useNotifications', () => ({
  useNotifications: () => ({
    showToast: vi.fn(),
    hideToast: vi.fn(),
    clearToasts: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
    undo: vi.fn(),
    retry: vi.fn(),
    saveSuccess: vi.fn(),
    saveError: vi.fn(),
    uploadSuccess: vi.fn(),
    uploadError: vi.fn(),
    networkError: vi.fn(),
    genericError: vi.fn(),
    handleError: vi.fn(),
    withLoadingToast: vi.fn(),
  }),
}));

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
    dismiss: vi.fn(),
    promise: vi.fn(),
  }),
  Toaster: () => null,
}));

vi.mock('@/components/dashboard/organisms/audience-member-sidebar', () => ({
  AudienceMemberSidebar: () => null,
}));

vi.mock(
  '@/components/dashboard/audience/table/atoms/AudienceMobileCard',
  () => ({ AudienceMobileCard: () => null })
);

vi.mock('@/components/organisms/EmptyState', () => ({
  EmptyState: ({ heading }: { heading?: string }) => (
    <div data-testid='empty-state'>{heading}</div>
  ),
}));

vi.mock('@/hooks/useRegisterTablePanel', () => ({
  useRegisterTablePanel: vi.fn(),
}));

vi.mock(
  '@/components/dashboard/organisms/dashboard-audience-table/AudienceTableSubheader',
  () => ({ AudienceTableSubheader: () => null })
);

// Track data passed to UnifiedTable to verify prop forwarding
let capturedTableData: unknown[] = [];

vi.mock('@/components/organisms/table', () => ({
  UnifiedTable: ({ data }: { data?: unknown[] }) => {
    capturedTableData = data ?? [];
    return <table data-testid='unified-table' />;
  },
  TablePaginationFooter: () => null,
  convertToCommonDropdownItems: vi.fn(() => []),
  ExportCSVButton: () => null,
  useRowSelection: () => ({
    selectedIds: new Set<string>(),
    isSelected: () => false,
    toggleSelect: vi.fn(),
    toggleSelectAll: vi.fn(),
    clearSelection: vi.fn(),
  }),
}));

vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: vi.fn(() => ({
    getVirtualItems: () => [],
    getTotalSize: () => 0,
    measureElement: vi.fn(),
    scrollOffset: 0,
    scrollRect: { width: 1200, height: 600 },
  })),
}));

// ── Import component after mocks ──
const { DashboardAudienceTable } = await import(
  '@/components/dashboard/organisms/dashboard-audience-table'
);

function renderWithProviders(
  ui: React.ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>
) {
  return render(ui, {
    wrapper: ({ children }) => (
      <TooltipProvider>
        <TablePanelProvider>{children}</TablePanelProvider>
      </TooltipProvider>
    ),
    ...options,
  });
}

function generateMockAudienceMembers(count: number): AudienceMember[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `member-${i + 1}`,
    type: i % 3 === 0 ? 'email' : i % 3 === 1 ? 'sms' : 'anonymous',
    displayName: `User ${i + 1}`,
    locationLabel: 'New York, NY',
    geoCity: 'New York',
    geoCountry: 'US',
    visits: Math.floor(Math.random() * 100) + 1,
    engagementScore: Math.floor(Math.random() * 100),
    intentLevel: i % 3 === 0 ? 'high' : i % 3 === 1 ? 'medium' : 'low',
    latestActions: [{ label: 'Visited profile' }],
    referrerHistory: [{ url: 'https://example.com' }],
    utmParams: {},
    email: i % 3 === 0 ? `user${i + 1}@example.com` : null,
    phone: i % 3 === 1 ? `+1555000${String(i).padStart(4, '0')}` : null,
    spotifyConnected: i % 5 === 0,
    purchaseCount: Math.floor(Math.random() * 10),
    tags: ['fan'],
    deviceType: i % 2 === 0 ? 'mobile' : 'desktop',
    lastSeenAt: new Date().toISOString(),
  }));
}

const MOCK_DATA_LARGE = generateMockAudienceMembers(100);

const defaultProps = {
  mode: 'members' as const,
  view: 'all' as const,
  total: 0,
  page: 1,
  pageSize: 50,
  sort: 'lastSeen',
  direction: 'desc' as const,
  onPageChange: vi.fn(),
  onPageSizeChange: vi.fn(),
  onSortChange: vi.fn(),
  onViewChange: vi.fn(),
  onFiltersChange: vi.fn(),
  filters: { segments: [] },
  subscriberCount: 0,
};

describe('DashboardAudienceTable', () => {
  beforeEach(() => {
    capturedTableData = [];
    vi.clearAllMocks();
  });

  it('renders the table container with test id', () => {
    renderWithProviders(<DashboardAudienceTable {...defaultProps} rows={[]} />);
    expect(screen.getByTestId('dashboard-audience-table')).toBeInTheDocument();
  });

  it('shows empty state when no rows provided', () => {
    renderWithProviders(<DashboardAudienceTable {...defaultProps} rows={[]} />);
    expect(screen.getByText('Grow Your Audience')).toBeInTheDocument();
  });

  it('shows subscriber empty state in subscribers mode', () => {
    renderWithProviders(
      <DashboardAudienceTable {...defaultProps} mode='subscribers' rows={[]} />
    );
    expect(screen.getByText('Get Your First Subscriber')).toBeInTheDocument();
  });

  it('renders table when rows are provided', () => {
    renderWithProviders(
      <DashboardAudienceTable
        {...defaultProps}
        rows={MOCK_DATA_LARGE}
        total={100}
      />
    );

    expect(screen.getByTestId('unified-table')).toBeInTheDocument();
  });

  it('passes all rows to UnifiedTable', () => {
    renderWithProviders(
      <DashboardAudienceTable
        {...defaultProps}
        rows={MOCK_DATA_LARGE}
        total={100}
      />
    );

    expect(capturedTableData).toHaveLength(100);
  });

  it('renders in subscribers mode', () => {
    renderWithProviders(
      <DashboardAudienceTable
        {...defaultProps}
        mode='subscribers'
        rows={MOCK_DATA_LARGE}
        total={100}
      />
    );

    expect(screen.getByTestId('unified-table')).toBeInTheDocument();
  });
});
