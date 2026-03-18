import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const { mockUseTourDateAnalyticsQuery } = vi.hoisted(() => ({
  mockUseTourDateAnalyticsQuery: vi.fn(),
}));

// Mock all query hooks used by TourDateSidebar
vi.mock('@/lib/queries', () => ({
  useDeleteTourDateMutation: vi.fn(() => ({ mutate: vi.fn() })),
  useUpdateTourDateMutation: vi.fn(() => ({
    mutate: vi.fn(),
    isPending: false,
  })),
  useTourDateAnalyticsQuery: mockUseTourDateAnalyticsQuery,
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

// Mock the action builder
vi.mock(
  '@/components/features/dashboard/organisms/tour-dates/tour-date-actions',
  () => ({
    buildTourDateActions: vi.fn(() => []),
  })
);

// Mock drawer components to simplify test
vi.mock('@/components/molecules/drawer', () => ({
  DrawerSection: ({
    title,
    children,
  }: {
    title: string;
    children: React.ReactNode;
  }) => (
    <div data-testid={`drawer-section-${title}`}>
      <h3>{title}</h3>
      {children}
    </div>
  ),
  DrawerStatGrid: ({ children }: { children: React.ReactNode }) => (
    <div data-testid='stat-grid'>{children}</div>
  ),
  DrawerSurfaceCard: ({
    children,
  }: {
    children: React.ReactNode;
    className?: string;
  }) => <div data-testid='surface-card'>{children}</div>,
  EntitySidebarShell: ({
    children,
  }: {
    children: React.ReactNode;
    open?: boolean;
    onClose?: () => void;
    title?: string;
    actions?: unknown[];
    onAction?: () => void;
  }) => <div data-testid='sidebar-shell'>{children}</div>,
  StatTile: ({ label, value }: { label: string; value: string }) => (
    <div data-testid={`stat-${label}`}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  ),
}));

vi.mock('@/components/molecules/LoadingSkeleton', () => ({
  LoadingSkeleton: () => <div data-testid='loading-skeleton' />,
}));

vi.mock('@/components/molecules/ConfirmDialog', () => ({
  ConfirmDialog: () => null,
}));

vi.mock('@/components/atoms/Icon', () => ({
  Icon: ({ name }: { name: string }) => <span data-testid={`icon-${name}`} />,
}));

vi.mock('@/components/organisms/table', () => ({
  convertToCommonDropdownItems: vi.fn(() => []),
}));

vi.mock('@/lib/utils', () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(' '),
}));

vi.mock('@/lib/utils/date-formatting', () => ({
  formatISODate: vi.fn((d: string) => d),
}));

// ---------------------------------------------------------------------------
// Import component
// ---------------------------------------------------------------------------

const { TourDateSidebar } = await import(
  '@/components/features/dashboard/organisms/tour-dates/TourDateSidebar'
);

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const TEST_TOUR_DATE = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  profileId: 'profile_123',
  title: 'Summer Tour 2026',
  venueName: 'The Wiltern',
  city: 'Los Angeles',
  region: 'CA',
  country: 'USA',
  startDate: '2026-06-15T20:00:00Z',
  startTime: '8:00 PM',
  timezone: 'America/Los_Angeles',
  provider: 'manual' as const,
  ticketUrl: 'https://ticketmaster.com/event/abc',
  ticketStatus: 'available' as const,
  latitude: 34.05,
  longitude: -118.24,
  externalId: null,
  endDate: null,
  lastSyncedAt: null,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

function createQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
}

function renderSidebar() {
  const queryClient = createQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <TourDateSidebar
        tourDate={TEST_TOUR_DATE}
        profileId='profile_123'
        onClose={vi.fn()}
      />
    </QueryClientProvider>
  );
}

describe('TourDateSidebar analytics section', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows loading skeleton while analytics are loading', () => {
    mockUseTourDateAnalyticsQuery.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    });

    renderSidebar();

    expect(screen.getAllByTestId('loading-skeleton').length).toBeGreaterThan(0);
  });

  it('shows error message when analytics fail to load', () => {
    mockUseTourDateAnalyticsQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    });

    renderSidebar();

    expect(
      screen.getByText('Unable to load analytics data.')
    ).toBeInTheDocument();
  });

  it('shows empty state when there are zero ticket clicks', () => {
    mockUseTourDateAnalyticsQuery.mockReturnValue({
      data: {
        ticketClicks: 0,
        topCities: [],
        topReferrers: [],
      },
      isLoading: false,
      isError: false,
    });

    renderSidebar();

    expect(screen.getByText(/No ticket click data yet/)).toBeInTheDocument();
  });

  it('shows ticket click count and city stats', () => {
    mockUseTourDateAnalyticsQuery.mockReturnValue({
      data: {
        ticketClicks: 42,
        topCities: [
          { city: 'Los Angeles', count: 15 },
          { city: 'New York', count: 10 },
        ],
        topReferrers: [{ referrer: 'instagram.com', count: 8 }],
      },
      isLoading: false,
      isError: false,
    });

    renderSidebar();

    // Check stat tiles
    const ticketStat = screen.getByTestId('stat-Ticket Clicks');
    expect(ticketStat).toBeInTheDocument();
    expect(ticketStat).toHaveTextContent('42');

    const cityStat = screen.getByTestId('stat-Top Cities');
    expect(cityStat).toBeInTheDocument();
    expect(cityStat).toHaveTextContent('2');

    // Check ranked city list
    expect(screen.getByText('Los Angeles')).toBeInTheDocument();
    expect(screen.getByText('New York')).toBeInTheDocument();

    // Check referrer list
    expect(screen.getByText('instagram.com')).toBeInTheDocument();
  });

  it('hides city list when no cities', () => {
    mockUseTourDateAnalyticsQuery.mockReturnValue({
      data: {
        ticketClicks: 5,
        topCities: [],
        topReferrers: [{ referrer: 'google.com', count: 3 }],
      },
      isLoading: false,
      isError: false,
    });

    renderSidebar();

    // Should show referrer but no city section
    expect(screen.getByText('google.com')).toBeInTheDocument();
    expect(screen.queryByText('No city data yet')).not.toBeInTheDocument();
  });
});
