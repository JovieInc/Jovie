import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DashboardPay } from './DashboardPay';

const mockUseDashboardData = vi.fn();
const mockUseDashboardPay = vi.fn();

vi.mock('@/app/app/(shell)/dashboard/DashboardDataContext', () => ({
  DashboardDataContext: {
    Provider: ({ children }: { readonly children: ReactNode }) => children,
    Consumer: () => null,
    displayName: 'DashboardDataContext',
  },
  useDashboardData: () => mockUseDashboardData(),
}));

vi.mock('@/components/organisms/Dialog', () => ({
  Dialog: ({ children }: { readonly children: ReactNode }) => (
    <div>{children}</div>
  ),
  DialogBody: ({ children }: { readonly children: ReactNode }) => (
    <div>{children}</div>
  ),
  DialogDescription: ({ children }: { readonly children: ReactNode }) => (
    <p>{children}</p>
  ),
  DialogTitle: ({ children }: { readonly children: ReactNode }) => (
    <h2>{children}</h2>
  ),
}));

vi.mock('@/features/dashboard/organisms/EarningsTab', () => ({
  EarningsTab: () => <div data-testid='earnings-tab'>Earnings tab content</div>,
}));

vi.mock('@/features/dashboard/organisms/shopify/ShopifyStoreCard', () => ({
  ShopifyStoreCard: () => (
    <div data-testid='shopify-store-card'>Shopify store card</div>
  ),
}));

vi.mock('./useDashboardPay', () => ({
  useDashboardPay: () => mockUseDashboardPay(),
}));

function mockDashboardData() {
  mockUseDashboardData.mockReturnValue({
    tippingStats: {
      tipClicks: 42,
      qrTipClicks: 12,
      linkTipClicks: 30,
    },
  });
}

function mockDashboardPay(overrides = {}) {
  mockUseDashboardPay.mockReturnValue({
    artist: { handle: 'artist-handle', venmo_handle: undefined },
    venmoHandle: '',
    setVenmoHandle: vi.fn(),
    isEditing: false,
    setIsEditing: vi.fn(),
    isSaving: false,
    saveSuccess: null,
    hasVenmoHandle: false,
    handleSaveVenmo: vi.fn(),
    handleCancel: vi.fn(),
    handleDisconnect: vi.fn(),
    ...overrides,
  });
}

describe('DashboardPay', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('shows the Venmo empty state before earnings are unlocked', () => {
    mockDashboardData();
    mockDashboardPay();

    render(<DashboardPay />);

    expect(
      screen.getByRole('heading', { name: 'Connect Venmo To Unlock Earnings' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Connect Venmo' })
    ).toBeInTheDocument();
    expect(screen.queryByTestId('earnings-tab')).not.toBeInTheDocument();
    expect(screen.getByTestId('shopify-store-card')).toBeInTheDocument();
  });

  it('renders bounded earnings metrics and pay link when Venmo is connected', () => {
    mockDashboardData();
    mockDashboardPay({
      artist: { handle: 'artist-handle', venmo_handle: '@artist' },
      hasVenmoHandle: true,
      venmoHandle: 'artist',
    });

    render(<DashboardPay />);

    expect(screen.getByText('QR Scans')).toBeInTheDocument();
    expect(screen.getByText('Link Clicks')).toBeInTheDocument();
    expect(screen.getByText('Total Visits')).toBeInTheDocument();
    expect(
      screen.getByText(/artist-handle\/pay\?source=link/)
    ).toBeInTheDocument();
    expect(screen.getByTestId('earnings-tab')).toBeInTheDocument();
  });
});
