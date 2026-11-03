import { render, screen, within } from '@testing-library/react';
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
    // Deferred (C) launch controls stay off the pay surface (JOV-8505).
    expect(screen.queryByTestId('shopify-store-card')).not.toBeInTheDocument();
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
    for (const [label, value, description] of [
      ['QR Scans', '12', 'Fans who scanned your QR'],
      ['Link Clicks', '30', 'Fans who clicked your link'],
      ['Total Visits', '42', 'QR + link combined'],
    ]) {
      const metric = within(
        screen.getByRole('region', { name: `${label} Metric` })
      );
      expect(metric.getByRole('term')).toHaveTextContent(label);
      expect(
        metric.getAllByRole('definition').map(node => node.textContent)
      ).toEqual([value, description]);
    }
    expect(
      screen.getByText(/artist-handle\/pay\?source=link/)
    ).toBeInTheDocument();
    expect(screen.getByTestId('earnings-tab')).toBeInTheDocument();
  });
});
