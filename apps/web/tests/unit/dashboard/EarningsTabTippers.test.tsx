import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the queries
const mockEarningsQuery = vi.fn();
vi.mock('@/lib/queries', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/queries')>();
  return {
    ...actual,
    useEarningsQuery: (...args: unknown[]) => mockEarningsQuery(...args),
  };
});

// Mock DashboardDataContext
vi.mock('@/app/app/(shell)/dashboard/DashboardDataContext', () => ({
  useDashboardData: () => ({
    selectedProfile: {
      usernameNormalized: 'testartist',
      username: 'testartist',
    },
  }),
}));

// Mock QR code generation to avoid canvas/image issues in tests
vi.mock('@/lib/utils/qr-code', () => ({
  generateQrCodeDataUrl: vi
    .fn()
    .mockResolvedValue('data:image/png;base64,fake'),
  generateQrCodeSvg: vi.fn().mockResolvedValue('<svg></svg>'),
}));

// Mock next/image
vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => {
    const { unoptimized, ...rest } = props;
    return <img alt='' {...rest} />;
  },
}));

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

async function getEarningsTab() {
  const { EarningsTab } = await import(
    '@/components/features/dashboard/organisms/EarningsTab'
  );
  return EarningsTab;
}

describe('EarningsTab - Tippers Table', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it(
    'renders tippers with formatted amounts and dates',
    { timeout: 15_000 },
    async () => {
      mockEarningsQuery.mockReturnValue({
        data: {
          stats: {
            totalRevenueCents: 1500,
            totalTips: 2,
            averageTipCents: 750,
          },
          tippers: [
            {
              id: 't1',
              tipperName: 'Alice',
              contactEmail: 'alice@example.com',
              amountCents: 500,
              createdAt: '2026-01-15T00:00:00Z',
            },
            {
              id: 't2',
              tipperName: null,
              contactEmail: null,
              amountCents: 1000,
              createdAt: '2026-02-20T00:00:00Z',
            },
          ],
        },
        isLoading: false,
      });

      const EarningsTab = await getEarningsTab();
      renderWithProviders(<EarningsTab />);

      // Check tipper names (unique to the table)
      expect(screen.getByText('Alice')).toBeInTheDocument();
      expect(screen.getByText('Anonymous')).toBeInTheDocument();

      // Check email
      expect(screen.getByText('alice@example.com')).toBeInTheDocument();

      // Check formatted amounts exist (may also appear in stats cards)
      expect(screen.getAllByText('$5.00').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('$10.00').length).toBeGreaterThanOrEqual(1);
    }
  );

  it(
    'renders empty state when no tippers exist',
    { timeout: 15_000 },
    async () => {
      mockEarningsQuery.mockReturnValue({
        data: {
          stats: { totalRevenueCents: 0, totalTips: 0, averageTipCents: 0 },
          tippers: [],
        },
        isLoading: false,
      });

      const EarningsTab = await getEarningsTab();
      renderWithProviders(<EarningsTab />);

      expect(
        screen.getByText('Share your tip link to get started.')
      ).toBeInTheDocument();
    }
  );

  it('renders loading state', async () => {
    mockEarningsQuery.mockReturnValue({
      data: undefined,
      isLoading: true,
    });

    const EarningsTab = await getEarningsTab();
    renderWithProviders(<EarningsTab />);

    // The UnifiedTable should show skeleton loading
    // The stats section should show skeleton cards
    const skeletons = document.querySelectorAll('.skeleton');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('formats cents as dollars correctly', async () => {
    mockEarningsQuery.mockReturnValue({
      data: {
        stats: { totalRevenueCents: 150, totalTips: 1, averageTipCents: 150 },
        tippers: [
          {
            id: 't1',
            tipperName: 'Bob',
            contactEmail: 'bob@test.com',
            amountCents: 150,
            createdAt: '2026-03-01T00:00:00Z',
          },
        ],
      },
      isLoading: false,
    });

    const EarningsTab = await getEarningsTab();
    renderWithProviders(<EarningsTab />);

    // $1.50 appears in stats (total revenue, average tip) and in the tippers table
    // Verify the value appears at all — formatCents(150) = "$1.50"
    const matches = screen.getAllByText('$1.50');
    expect(matches.length).toBeGreaterThanOrEqual(1);
    // Verify it's not "$150" or "150" (raw cents)
    expect(screen.queryByText('150')).not.toBeInTheDocument();
  });
});
