import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { DashboardTipping } from '@/features/dashboard/dashboard-tipping/DashboardTipping';

const mockUseDashboardData = vi.fn();
const mockUseDashboardTipping = vi.fn();

vi.mock('@/app/app/(shell)/dashboard/DashboardDataContext', () => ({
  useDashboardData: () => mockUseDashboardData(),
}));

vi.mock('@/features/dashboard/organisms/EarningsTab', () => ({
  EarningsTab: () => <div data-testid='earnings-tab'>Earnings tab content</div>,
}));

vi.mock('@/components/organisms/Dialog', () => ({
  Dialog: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogBody: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogDescription: ({ children }: { children: ReactNode }) => (
    <p>{children}</p>
  ),
  DialogTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
}));

vi.mock('@/features/dashboard/dashboard-tipping/useDashboardTipping', () => ({
  useDashboardTipping: () => mockUseDashboardTipping(),
}));

describe('DashboardTipping empty state behavior', () => {
  it('shows a cohesive empty state and hides downstream cards when Venmo is not connected', () => {
    mockUseDashboardData.mockReturnValue({
      tippingStats: {
        tipClicks: 0,
        qrTipClicks: 0,
        linkTipClicks: 0,
      },
    });

    mockUseDashboardTipping.mockReturnValue({
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
    });

    render(<DashboardTipping />);

    expect(
      screen.getByRole('heading', { name: 'Connect Venmo to unlock earnings' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Connect Venmo' })
    ).toBeInTheDocument();

    expect(screen.queryByText('Activity')).not.toBeInTheDocument();
    expect(screen.queryByTestId('earnings-tab')).not.toBeInTheDocument();
  });

  it('shows activity sections and earnings content when Venmo is connected', () => {
    mockUseDashboardData.mockReturnValue({
      tippingStats: {
        tipClicks: 42,
        qrTipClicks: 12,
        linkTipClicks: 30,
      },
    });

    mockUseDashboardTipping.mockReturnValue({
      artist: { handle: 'artist-handle', venmo_handle: '@artist' },
      venmoHandle: 'artist',
      setVenmoHandle: vi.fn(),
      isEditing: false,
      setIsEditing: vi.fn(),
      isSaving: false,
      saveSuccess: null,
      hasVenmoHandle: true,
      handleSaveVenmo: vi.fn(),
      handleCancel: vi.fn(),
      handleDisconnect: vi.fn(),
    });

    render(<DashboardTipping />);

    expect(screen.getByText('Activity')).toBeInTheDocument();
    expect(screen.getByTestId('earnings-tab')).toBeInTheDocument();
  });
});
