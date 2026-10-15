import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MoneyVisibilityProvider } from '@/lib/workspace-lock/money-visibility';
import { EarningsTab } from './EarningsTab';

const queryState = vi.hoisted(() => ({ loading: false, empty: false }));

vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => <img alt='' {...props} />,
}));

vi.mock('@/app/app/(shell)/dashboard/DashboardDataContext', () => ({
  useDashboardData: () => ({
    selectedProfile: { usernameNormalized: 'artist', username: 'artist' },
  }),
}));

vi.mock('@/lib/hooks/useNotifications', () => ({
  useNotifications: () => ({ success: vi.fn(), error: vi.fn() }),
}));

vi.mock('@/hooks/useClipboard', () => ({
  useClipboard: () => ({ copy: vi.fn(), isSuccess: false }),
}));

vi.mock('@/lib/utils/qr-code', () => ({
  generateQrCodeDataUrl: vi.fn().mockResolvedValue('data:image/png;base64,x'),
  generateQrCodeSvg: vi.fn().mockResolvedValue('<svg />'),
  qrCodeDataUrlToBlob: vi.fn(),
}));

vi.mock('@/components/organisms/table', () => ({
  UnifiedTable: () => <div data-testid='tippers-table' />,
  TableEmptyState: () => null,
}));

vi.mock('@/components/molecules/drawer', () => ({
  DrawerButton: ({ children }: { readonly children: React.ReactNode }) => (
    <span>{children}</span>
  ),
}));

vi.mock('@/lib/queries', async importOriginal => {
  const mod = await importOriginal<typeof import('@/lib/queries')>();
  return {
    ...mod,
    useEarningsQuery: () => ({
      isLoading: queryState.loading,
      data: queryState.empty
        ? undefined
        : {
            stats: {
              totalRevenueCents: 12345,
              totalTips: 7,
              averageTipCents: 1764,
              totalTippers: 5,
            },
            tippers: [],
          },
    }),
  };
});

function renderTab({ moneyHidden = false }: { moneyHidden?: boolean } = {}) {
  return render(
    <MoneyVisibilityProvider hidden={moneyHidden}>
      <EarningsTab />
    </MoneyVisibilityProvider>
  );
}

describe('EarningsTab', () => {
  beforeEach(() => {
    queryState.loading = false;
    queryState.empty = false;
  });

  it('renders money stat values when money visibility is on', () => {
    renderTab();
    expect(screen.getByText('Total Revenue')).toBeTruthy();
    expect(screen.getByText('$123.45')).toBeTruthy();
  });

  it('redacts money stat values when money visibility is hidden', () => {
    renderTab({ moneyHidden: true });
    expect(screen.queryByText('$123.45')).toBeNull();
    expect(screen.getAllByText('•••').length).toBeGreaterThan(0);
    expect(screen.getByText('7')).toBeTruthy();
  });

  it('uses three compact loading cards before stats arrive', () => {
    queryState.loading = true;
    const { container } = renderTab();
    expect(screen.queryByText('Total Revenue')).toBeNull();
    expect(container.querySelectorAll('[aria-hidden="true"].p-3')).toHaveLength(
      3
    );
  });

  it('retains zero fallbacks when earnings stats are absent', () => {
    queryState.empty = true;
    renderTab();
    expect(screen.getAllByText('$0.00')).toHaveLength(2);
    expect(screen.getByText('0')).toBeInTheDocument();
    expect(screen.getAllByRole('term')).toHaveLength(3);
  });
});
