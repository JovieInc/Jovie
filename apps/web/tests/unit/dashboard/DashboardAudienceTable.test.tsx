import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DashboardAudienceTable } from '@/components/dashboard/organisms/dashboard-audience-table';
import type { AudienceMember } from '@/types';

// Mock next/navigation (useRouter is used in DashboardAudienceTableUnified)
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

// Mock the useTableMeta hook
vi.mock('@/components/organisms/AuthShellWrapper', () => ({
  useTableMeta: () => ({
    tableMeta: { rowCount: null, toggle: null, rightPanelWidth: null },
    setTableMeta: vi.fn(),
  }),
}));

// Mock the useNotifications hook
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

// Track virtualized rows for testing
let capturedVirtualItems: { index: number; start: number }[] = [];
let capturedRowCount = 0;

// Mock @tanstack/react-virtual to track virtualization behavior
vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: (options: {
    count: number;
    getScrollElement: () => HTMLElement | null;
    estimateSize: () => number;
    overscan: number;
  }) => {
    capturedRowCount = options.count;
    const estimatedRowHeight = options.estimateSize();
    const overscan = options.overscan;

    // Simulate viewport of 600px height (~10 visible rows at 60px each)
    const viewportHeight = 600;
    const visibleRowCount = Math.ceil(viewportHeight / estimatedRowHeight);

    // Calculate virtual items: visible rows + overscan on each side
    const totalVirtualRows = Math.min(
      visibleRowCount + overscan * 2,
      options.count
    );

    const virtualItems = Array.from({ length: totalVirtualRows }, (_, i) => ({
      index: i,
      start: i * estimatedRowHeight,
      size: estimatedRowHeight,
      end: (i + 1) * estimatedRowHeight,
      key: i,
      lane: 0,
    }));

    capturedVirtualItems = virtualItems;

    return {
      getVirtualItems: () => virtualItems,
      getTotalSize: () => options.count * estimatedRowHeight,
      measureElement: vi.fn(),
      scrollOffset: 0,
      scrollRect: { width: 1200, height: viewportHeight },
      options,
    };
  },
}));

/**
 * Generate mock audience members for testing
 */
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
    email: i % 3 === 0 ? `user${i + 1}@example.com` : null,
    phone: i % 3 === 1 ? `+1555000${String(i).padStart(4, '0')}` : null,
    spotifyConnected: i % 5 === 0,
    purchaseCount: Math.floor(Math.random() * 10),
    tags: ['fan'],
    deviceType: i % 2 === 0 ? 'mobile' : 'desktop',
    lastSeenAt: new Date().toISOString(),
  }));
}

// Pre-generate datasets at module scope to avoid overhead in tests
// Using smaller datasets (100/200 rows) since virtualization behavior is the same
// regardless of total count - we just need more rows than viewport can display
const MOCK_DATA_LARGE = generateMockAudienceMembers(100);
const MOCK_DATA_STRESS = generateMockAudienceMembers(200);
const MOCK_DATA_MEDIUM = generateMockAudienceMembers(50);

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
  subscriberCount: 0,
};

describe('DashboardAudienceTable - Virtualization', () => {
  beforeEach(() => {
    capturedVirtualItems = [];
    capturedRowCount = 0;
    vi.clearAllMocks();
  });

  it('renders the table container with test id', () => {
    render(<DashboardAudienceTable {...defaultProps} rows={[]} />);
    expect(screen.getByTestId('dashboard-audience-table')).toBeInTheDocument();
  });

  it('shows empty state when no rows provided', () => {
    render(<DashboardAudienceTable {...defaultProps} rows={[]} />);
    expect(screen.getByText('Grow Your Audience')).toBeInTheDocument();
  });

  describe('with large dataset (100 rows)', () => {
    const largeDataset = MOCK_DATA_LARGE;

    it(
      'virtualizes rows - renders significantly fewer DOM rows than total data',
      { timeout: 10000 },
      () => {
        render(
          <DashboardAudienceTable
            {...defaultProps}
            rows={largeDataset}
            total={100}
          />
        );

        // Verify the virtualizer received the full count
        expect(capturedRowCount).toBe(100);

        // The virtualizer should only return a small subset of items
        // (visible rows + overscan, typically ~20 items for a 600px viewport)
        expect(capturedVirtualItems.length).toBeLessThan(50);
        expect(capturedVirtualItems.length).toBeLessThan(100);
      }
    );

    it('only renders visible rows plus overscan, not all rows', () => {
      const { container } = render(
        <DashboardAudienceTable
          {...defaultProps}
          rows={largeDataset}
          total={100}
        />
      );

      // Count actual tr elements in tbody (excluding thead)
      const tbody = container.querySelector('tbody');
      const renderedRows = tbody?.querySelectorAll('tr') ?? [];

      // With virtualization, we should render far fewer than 100 rows
      // Expected: ~20 rows (10 visible + 5 overscan top + 5 overscan bottom)
      expect(renderedRows.length).toBeLessThan(50);
      expect(renderedRows.length).toBeLessThan(largeDataset.length);
    });

    it('provides correct row count to virtualizer', () => {
      render(
        <DashboardAudienceTable
          {...defaultProps}
          rows={largeDataset}
          total={100}
        />
      );

      // The virtualizer should know about all rows
      expect(capturedRowCount).toBe(largeDataset.length);
    });

    it('renders rows with absolute positioning for virtual scrolling', () => {
      const { container } = render(
        <DashboardAudienceTable
          {...defaultProps}
          rows={largeDataset}
          total={100}
        />
      );

      const tbody = container.querySelector('tbody');
      expect(tbody).toHaveStyle({ position: 'relative' });

      // Check that rendered rows have absolute positioning
      const renderedRows = tbody?.querySelectorAll('tr') ?? [];
      if (renderedRows.length > 0) {
        const firstRow = renderedRows[0];
        expect(firstRow).toHaveStyle({ position: 'absolute' });
      }
    });

    it('sets tbody height based on total virtual size', () => {
      const { container } = render(
        <DashboardAudienceTable
          {...defaultProps}
          rows={largeDataset}
          total={100}
        />
      );

      const tbody = container.querySelector('tbody');
      // 100 rows * 44px estimated height = 4400px
      expect(tbody).toHaveStyle({ height: '4400px' });
    });
  });

  describe('with stress test dataset (200 rows)', () => {
    const stressDataset = MOCK_DATA_STRESS;

    it('efficiently handles larger datasets via virtualization', () => {
      const { container } = render(
        <DashboardAudienceTable
          {...defaultProps}
          rows={stressDataset}
          total={200}
        />
      );

      // Verify virtualizer received full count
      expect(capturedRowCount).toBe(200);

      // DOM should have far fewer than 200 rows
      const tbody = container.querySelector('tbody');
      const renderedRows = tbody?.querySelectorAll('tr') ?? [];
      expect(renderedRows.length).toBeLessThan(50);

      // Total virtual size should reflect all rows
      expect(tbody).toHaveStyle({ height: '8800px' }); // 200 * 44px
    });
  });

  describe('virtualization configuration', () => {
    const testDataset = MOCK_DATA_MEDIUM;

    it('uses correct estimated row height (44px)', { timeout: 10000 }, () => {
      // Check tbody height calculation: 50 rows * 44px = 2200px
      const { container } = render(
        <DashboardAudienceTable
          {...defaultProps}
          rows={testDataset}
          total={50}
        />
      );

      const tbody = container.querySelector('tbody');
      expect(tbody).toHaveStyle({ height: '2200px' });
    });

    it('applies translateY transform to position rows', () => {
      const { container } = render(
        <DashboardAudienceTable
          {...defaultProps}
          rows={testDataset}
          total={50}
        />
      );

      const tbody = container.querySelector('tbody');
      const renderedRows = tbody?.querySelectorAll('tr') ?? [];

      // Check that rows have translateY applied
      if (renderedRows.length > 0) {
        const firstRow = renderedRows[0];
        const style = firstRow.getAttribute('style') || '';
        expect(style).toContain('translateY');
      }
    });

    it('renders rows with data-index attribute for virtualizer', () => {
      const { container } = render(
        <DashboardAudienceTable
          {...defaultProps}
          rows={testDataset}
          total={50}
        />
      );

      const tbody = container.querySelector('tbody');
      const renderedRows = tbody?.querySelectorAll('tr') ?? [];

      // Each row should have data-index for measureElement
      if (renderedRows.length > 0) {
        const firstRow = renderedRows[0];
        expect(firstRow).toHaveAttribute('data-index');
      }
    });
  });

  describe('small datasets (no virtualization needed but still applied)', () => {
    it('applies virtualization even for small datasets', () => {
      const smallDataset = generateMockAudienceMembers(10);

      render(
        <DashboardAudienceTable
          {...defaultProps}
          rows={smallDataset}
          total={10}
        />
      );

      // Virtualizer is still used
      expect(capturedRowCount).toBe(10);

      // For small datasets, all rows may be rendered (within viewport + overscan)
      expect(capturedVirtualItems.length).toBeLessThanOrEqual(10);
    });

    it('renders all rows when dataset fits in viewport', () => {
      const smallDataset = generateMockAudienceMembers(5);

      const { container } = render(
        <DashboardAudienceTable
          {...defaultProps}
          rows={smallDataset}
          total={5}
        />
      );

      const tbody = container.querySelector('tbody');
      const renderedRows = tbody?.querySelectorAll('tr') ?? [];

      // All 5 rows should be rendered since they fit in viewport
      expect(renderedRows.length).toBe(5);
    });
  });
});

describe('DashboardAudienceTable - Subscribers Mode', () => {
  it('virtualizes subscriber rows the same as member rows', () => {
    render(
      <DashboardAudienceTable
        {...defaultProps}
        mode='subscribers'
        rows={MOCK_DATA_LARGE}
        total={100}
      />
    );

    expect(capturedRowCount).toBe(100);
    expect(capturedVirtualItems.length).toBeLessThan(100);
  });
});
