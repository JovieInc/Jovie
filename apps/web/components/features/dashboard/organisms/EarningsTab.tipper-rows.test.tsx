import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MoneyVisibilityProvider } from '@/lib/workspace-lock/money-visibility';
import { EarningsTab } from './EarningsTab';

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
      isLoading: false,
      data: {
        stats: {
          totalRevenueCents: 1700,
          totalTips: 2,
          averageTipCents: 850,
          totalTippers: 2,
        },
        tippers: [
          {
            id: 't1',
            tipperName: 'Ada Lovelace',
            contactEmail: 'ada@example.com',
            amountCents: 500,
            createdAt: '2026-09-20T12:00:00.000Z',
          },
          {
            id: 't2',
            tipperName: null,
            contactEmail: null,
            amountCents: 1200,
            createdAt: '2026-09-21T12:00:00.000Z',
          },
        ],
      },
    }),
  };
});

function renderTab() {
  return render(
    <MoneyVisibilityProvider hidden={false}>
      <EarningsTab />
    </MoneyVisibilityProvider>
  );
}

describe('EarningsTab tipper rows', () => {
  it('renders tippers as shared dense people rows', () => {
    renderTab();

    const table = screen.getByRole('table');
    expect(table).toHaveAttribute('data-table-row-mode', 'dense');
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map(header => header.textContent)
    ).toEqual(['Tipper', 'Amount', 'Date']);
    const [, first, second] = within(table).getAllByRole('row');
    const person = first.querySelector('[data-table-person-cell]');
    expect(person).toHaveTextContent('Ada Lovelace');
    expect(person).toHaveTextContent('ada@example.com');
    expect(second.querySelector('[data-table-person-cell]')).toHaveTextContent(
      'Anonymous'
    );
  });

  it('right-aligns amount and date in tabular figures', () => {
    renderTab();

    const [, first] = within(screen.getByRole('table')).getAllByRole('row');
    const amount = within(first).getByText('$5.00');
    expect(amount.closest('td')?.className).toContain('text-right');
    const date = within(first).getByText('Sep 20, 2026');
    expect(date.className).toContain('tabular-nums');
    expect(date.closest('td')?.className).toContain('text-right');
  });
});
