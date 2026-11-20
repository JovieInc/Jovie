import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MoneyVisibilityProvider } from '@/lib/workspace-lock/money-visibility';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { EarningsTab } from './EarningsTab';

const mocks = vi.hoisted(() => ({
  handle: 'artist' as string | null,
  loading: false,
  success: vi.fn(),
  error: vi.fn(),
  copy: vi.fn(),
  generateQrCodeDataUrl: vi.fn(),
  generateQrCodeSvg: vi.fn(),
  downloadBlob: vi.fn(),
  downloadString: vi.fn(),
}));

vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => <img alt='' {...props} />,
}));
vi.mock('@/app/app/(shell)/dashboard/DashboardDataContext', () => ({
  useDashboardData: () => ({
    selectedProfile: mocks.handle
      ? { usernameNormalized: mocks.handle, username: mocks.handle }
      : null,
  }),
}));
vi.mock('@/lib/hooks/useNotifications', () => ({
  useNotifications: () => ({ success: mocks.success, error: mocks.error }),
}));
vi.mock('@/hooks/useClipboard', () => ({
  useClipboard: () => ({ copy: mocks.copy, isSuccess: false }),
}));
vi.mock('@/lib/utils/qr-code', () => ({
  generateQrCodeDataUrl: mocks.generateQrCodeDataUrl,
  generateQrCodeSvg: mocks.generateQrCodeSvg,
  qrCodeDataUrlToBlob: () => new Blob(['qr']),
}));
vi.mock('@/lib/utils/download', () => ({
  downloadBlob: mocks.downloadBlob,
  downloadString: mocks.downloadString,
}));
vi.mock('@/components/organisms/table', () => ({
  UnifiedTable: (props: Record<string, unknown>) => (
    <div data-testid='tippers-table'>{props.emptyState as React.ReactNode}</div>
  ),
  TableEmptyState: ({ heading }: { readonly heading: string }) => (
    <p>{heading}</p>
  ),
}));
vi.mock('@/lib/queries', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/queries')>()),
  useEarningsQuery: () => ({
    isLoading: mocks.loading,
    data: {
      stats: { totalRevenueCents: 500, totalTips: 2, averageTipCents: 250 },
      tippers: [],
    },
  }),
}));

function renderTab() {
  return render(
    <MoneyVisibilityProvider hidden={false}>
      <EarningsTab />
    </MoneyVisibilityProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.handle = 'artist';
  mocks.loading = false;
  mocks.generateQrCodeDataUrl.mockResolvedValue('data:image/png;base64,x');
  mocks.generateQrCodeSvg.mockResolvedValue('<svg />');
});

describe('EarningsTab certificate', () => {
  it('downloads the tip QR as PNG and SVG and copies the tip link', async () => {
    const user = userEvent.setup();
    const { container } = renderTab();
    expect(
      await screen.findByRole('img', { name: 'QR code for tip page' })
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Download PNG/ }));
    await waitFor(() =>
      expect(mocks.downloadBlob).toHaveBeenCalledWith(
        expect.any(Blob),
        'jovie-tip-artist.png'
      )
    );
    expect(mocks.success).toHaveBeenCalledWith('PNG downloaded');

    await user.click(screen.getByRole('button', { name: /Download SVG/ }));
    await waitFor(() =>
      expect(mocks.downloadString).toHaveBeenCalledWith('<svg />', {
        filename: 'jovie-tip-artist.svg',
        mimeType: 'image/svg+xml',
      })
    );

    await user.click(screen.getByRole('button', { name: /Copy tip link/ }));
    expect(mocks.copy).toHaveBeenCalledWith(
      expect.stringMatching(/\/artist\/pay$/)
    );
    await expectNoA11yViolations(container);
  });

  it('reports a failed PNG and SVG generation', async () => {
    const user = userEvent.setup();
    renderTab();
    await screen.findByRole('img', { name: 'QR code for tip page' });
    mocks.generateQrCodeDataUrl.mockRejectedValueOnce(new Error('qr'));
    mocks.generateQrCodeSvg.mockRejectedValueOnce(new Error('svg'));

    await user.click(screen.getByRole('button', { name: /Download PNG/ }));
    await waitFor(() =>
      expect(mocks.error).toHaveBeenCalledWith('Failed to generate PNG')
    );
    await user.click(screen.getByRole('button', { name: /Download SVG/ }));
    await waitFor(() =>
      expect(mocks.error).toHaveBeenCalledWith('Failed to generate SVG')
    );
    expect(mocks.downloadBlob).not.toHaveBeenCalled();
  });

  it('shows loading stat cards and a reserved QR box while loading', async () => {
    mocks.loading = true;
    mocks.generateQrCodeDataUrl.mockReturnValue(new Promise(() => {}));
    const { container } = renderTab();
    expect(screen.queryByText('Total Revenue')).toBeNull();
    expect(
      container.querySelector('.bg-on-media[aria-hidden="true"]')
    ).not.toBeNull();
    await expectNoA11yViolations(container);
  });

  it('asks for a handle when the profile has none', async () => {
    mocks.handle = null;
    const { container } = renderTab();
    expect(
      screen.queryByRole('button', { name: /Download PNG/ })
    ).not.toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('renders right to left', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <MoneyVisibilityProvider hidden={false}>
          <EarningsTab />
        </MoneyVisibilityProvider>
      </div>
    );
    await screen.findByRole('img', { name: 'QR code for tip page' });
    await expectNoA11yViolations(container);
  });
});
