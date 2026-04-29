import { TooltipProvider } from '@jovie/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  fireEvent,
  type RenderOptions,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HeaderActionsProvider } from '@/contexts/HeaderActionsContext';
import { RightPanelProvider } from '@/contexts/RightPanelContext';
import { AudiencePanelProvider } from '@/features/dashboard/organisms/AudiencePanelContext';
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

vi.mock('@/contexts/TableMetaContext', () => ({
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

vi.mock('@/features/dashboard/organisms/audience-member-sidebar', () => ({
  AudienceMemberSidebar: () => null,
}));

vi.mock('@/features/dashboard/organisms/AnalyticsSidebar', () => ({
  AnalyticsSidebar: () => null,
}));

vi.mock('@/components/organisms/EmptyState', () => ({
  EmptyState: ({ heading }: { heading?: string }) => (
    <div data-testid='empty-state'>{heading}</div>
  ),
}));

vi.mock('@/hooks/useRegisterRightPanel', () => ({
  useRegisterRightPanel: vi.fn(),
}));

vi.mock(
  '@/features/dashboard/organisms/dashboard-audience-table/AudienceTableSubheader',
  () => ({ AudienceTableSubheader: () => null })
);

// Track data passed to UnifiedTable to verify prop forwarding
let capturedTableData: unknown[] = [];
let capturedColumnVisibility: Record<string, boolean> | undefined;
let capturedMinWidth: string | undefined;
let mockDesktopTableWidth = 1200;
let resizeObserverCallback: ResizeObserverCallback | null = null;
let resizeObserverTarget: Element | null = null;

vi.mock('@/components/organisms/table', () => ({
  AudienceMobileCard: () => null,
  UnifiedTable: ({
    data,
    columnVisibility,
    minWidth,
  }: {
    data?: unknown[];
    columnVisibility?: Record<string, boolean>;
    minWidth?: string;
  }) => {
    capturedTableData = data ?? [];
    capturedColumnVisibility = columnVisibility;
    capturedMinWidth = minWidth;
    return <table data-testid='unified-table' />;
  },
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
  '@/features/dashboard/organisms/dashboard-audience-table'
);

function renderWithProviders(
  ui: React.ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(ui, {
    wrapper: ({ children }) => (
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <HeaderActionsProvider>
            <RightPanelProvider>
              <AudiencePanelProvider>{children}</AudiencePanelProvider>
            </RightPanelProvider>
          </HeaderActionsProvider>
        </TooltipProvider>
      </QueryClientProvider>
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
    tipAmountTotalCents: Math.floor(Math.random() * 5000),
    tipCount: Math.floor(Math.random() * 10),
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
  sort: 'lastSeen',
  direction: 'desc' as const,
  onSortChange: vi.fn(),
  onViewChange: vi.fn(),
  onFiltersChange: vi.fn(),
  filters: { segments: [] },
  subscriberCount: 0,
};

function fireDesktopTableResize(width: number) {
  mockDesktopTableWidth = width;
  if (!resizeObserverCallback || !resizeObserverTarget) {
    return;
  }

  resizeObserverCallback(
    [
      {
        target: resizeObserverTarget,
        contentRect: {
          width,
          height: 600,
          x: 0,
          y: 0,
          top: 0,
          right: width,
          bottom: 600,
          left: 0,
          toJSON: () => ({}),
        },
      } as ResizeObserverEntry,
    ],
    {} as ResizeObserver
  );
}

describe('DashboardAudienceTable', () => {
  beforeEach(() => {
    capturedTableData = [];
    capturedColumnVisibility = undefined;
    capturedMinWidth = undefined;
    mockDesktopTableWidth = 1200;
    resizeObserverCallback = null;
    resizeObserverTarget = null;
    vi.clearAllMocks();
    vi.stubGlobal(
      'ResizeObserver',
      class MockResizeObserver {
        private readonly callback: ResizeObserverCallback;

        constructor(callback: ResizeObserverCallback) {
          this.callback = callback;
          resizeObserverCallback = callback;
        }

        observe = vi.fn((target: Element) => {
          resizeObserverTarget = target;
          fireDesktopTableResize(mockDesktopTableWidth);
        });

        unobserve = vi.fn();
        disconnect = vi.fn();
      }
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders the table container with test id', () => {
    renderWithProviders(<DashboardAudienceTable {...defaultProps} rows={[]} />);
    expect(screen.getByTestId('dashboard-audience-table')).toBeInTheDocument();
  });

  it('shows empty state when no rows provided', () => {
    renderWithProviders(<DashboardAudienceTable {...defaultProps} rows={[]} />);
    expect(screen.getByText('Grow Your Audience')).toBeInTheDocument();
  });

  it('shows unified empty state in subscribers mode', () => {
    renderWithProviders(
      <DashboardAudienceTable {...defaultProps} mode='subscribers' rows={[]} />
    );
    expect(screen.getByText('Grow Your Audience')).toBeInTheDocument();
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

  it('collapses to a user-only desktop layout when the table is narrow', async () => {
    mockDesktopTableWidth = 700;

    renderWithProviders(
      <DashboardAudienceTable
        {...defaultProps}
        rows={MOCK_DATA_LARGE}
        total={100}
      />
    );

    await waitFor(() => {
      expect(capturedColumnVisibility).toEqual({
        location: false,
        source: false,
        value: false,
        engagement: false,
        lastSeen: false,
      });
      expect(capturedMinWidth).toBe('480px');
    });
  });

  it('keeps engagement and recency visible at medium desktop widths', async () => {
    mockDesktopTableWidth = 900;

    renderWithProviders(
      <DashboardAudienceTable
        {...defaultProps}
        rows={MOCK_DATA_LARGE}
        total={100}
      />
    );

    await waitFor(() => {
      expect(capturedColumnVisibility).toEqual({
        location: false,
        value: false,
      });
      expect(capturedMinWidth).toBe('640px');
    });
  });

  it('shows all desktop columns at wide widths', async () => {
    renderWithProviders(
      <DashboardAudienceTable
        {...defaultProps}
        rows={MOCK_DATA_LARGE}
        total={100}
      />
    );

    await waitFor(() => {
      expect(capturedColumnVisibility).toEqual({});
      expect(capturedMinWidth).toBe('800px');
    });
  });

  it('updates the desktop layout when the table width changes after mount', async () => {
    renderWithProviders(
      <DashboardAudienceTable
        {...defaultProps}
        rows={MOCK_DATA_LARGE}
        total={100}
      />
    );

    await waitFor(() => {
      expect(capturedColumnVisibility).toEqual({});
      expect(capturedMinWidth).toBe('800px');
    });

    fireDesktopTableResize(700);

    await waitFor(() => {
      expect(capturedColumnVisibility).toEqual({
        location: false,
        source: false,
        value: false,
        engagement: false,
        lastSeen: false,
      });
      expect(capturedMinWidth).toBe('480px');
    });
  });

  it('renders a mobile load more control and forwards clicks', () => {
    const onLoadMore = vi.fn();

    renderWithProviders(
      <DashboardAudienceTable
        {...defaultProps}
        rows={MOCK_DATA_LARGE}
        total={100}
        hasNextPage
        onLoadMore={onLoadMore}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Load more members' }));

    expect(onLoadMore).toHaveBeenCalledTimes(1);
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
