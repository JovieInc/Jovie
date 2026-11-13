import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { useProfileHeaderParts } from './ProfileSidebarHeader';

const { toastMock, downloadBlobMock, walletFlag } = vi.hoisted(() => ({
  toastMock: { success: vi.fn(), error: vi.fn() },
  downloadBlobMock: vi.fn(),
  walletFlag: { enabled: false },
}));

vi.mock('@/components/feedback', () => ({ toast: toastMock }));
// The QR is generated locally (no third-party request); the mock keeps the
// download flow's fetch/blob assertions meaningful without a real encoder.
vi.mock('@/components/molecules/QRCode', () => ({
  __esModule: true,
  getQrCodeDataUrl: vi.fn(async () => 'data:image/png;base64,QRPNG'),
}));
vi.mock('@/lib/utils/download', () => ({ downloadBlob: downloadBlobMock }));
vi.mock('@/lib/flags/client', () => ({
  useAppFlag: () => walletFlag.enabled,
}));
vi.mock('@/lib/wallet/apple/client', () => ({
  isAppleWalletPassSupportedClient: () => true,
  openAppleWalletProfilePass: vi.fn(),
}));

function Header({
  username = 'tim',
  displayName = 'Tim White',
  profilePath = '/tim',
  onClose,
  onQrDownloadError,
}: {
  readonly username?: string;
  readonly displayName?: string;
  readonly profilePath?: string;
  readonly onClose?: () => void;
  readonly onQrDownloadError?: (message: string) => void;
}) {
  const { title, actions } = useProfileHeaderParts({
    username,
    displayName,
    profilePath,
    onClose,
    onQrDownloadError,
  });
  return (
    <div>
      {title}
      {actions}
    </div>
  );
}

async function openMenu(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'More actions' }));
}

const originalFetch = globalThis.fetch;

beforeEach(() => {
  toastMock.success.mockClear();
  toastMock.error.mockClear();
  downloadBlobMock.mockClear();
  walletFlag.enabled = false;
});
afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('useProfileHeaderParts', () => {
  it('shows the display name with the handle and downloads a vCard', async () => {
    const user = userEvent.setup();
    const { container } = render(<Header />);

    expect(screen.getByText('Tim White')).toBeInTheDocument();
    expect(screen.getByText('@tim')).toBeInTheDocument();
    await expectNoA11yViolations(container);

    await openMenu(user);
    await user.click(screen.getByRole('menuitem', { name: 'Download vCard' }));

    expect(downloadBlobMock).toHaveBeenCalledWith(expect.any(Blob), 'tim.vcf');
    expect(toastMock.success).toHaveBeenCalledWith('vCard downloaded');
  });

  it('opens the public profile in a new tab', async () => {
    const user = userEvent.setup();
    const openSpy = vi.spyOn(globalThis, 'open').mockReturnValue(null);
    render(<Header />);

    await openMenu(user);
    await user.click(screen.getByRole('menuitem', { name: 'Open Profile' }));

    expect(openSpy).toHaveBeenCalledWith(
      expect.stringMatching(/\/tim$/),
      '_blank',
      'noopener,noreferrer'
    );
    openSpy.mockRestore();
  });

  it.each([
    ['the QR service fails', async () => new Response(null, { status: 500 })],
    [
      'the network is offline',
      async () => {
        throw new TypeError('Failed to fetch');
      },
    ],
  ])('reports a failed QR download when %s', async (_label, impl) => {
    globalThis.fetch = vi.fn(impl) as typeof fetch;
    const user = userEvent.setup();
    const { container } = render(<Header />);

    await openMenu(user);
    await user.click(
      screen.getByRole('menuitem', { name: 'Download QR Code' })
    );

    await waitFor(() =>
      expect(toastMock.error).toHaveBeenCalledWith('Unable to download QR code')
    );
    expect(downloadBlobMock).not.toHaveBeenCalled();
    await expectNoA11yViolations(container);
  });

  it('routes the QR failure report through the owner callback when provided', async () => {
    globalThis.fetch = vi.fn(
      async () => new Response(null, { status: 500 })
    ) as typeof fetch;
    const onQrDownloadError = vi.fn();
    const user = userEvent.setup();
    render(<Header onQrDownloadError={onQrDownloadError} />);

    await openMenu(user);
    await user.click(
      screen.getByRole('menuitem', { name: 'Download QR Code' })
    );

    await waitFor(() =>
      expect(onQrDownloadError).toHaveBeenCalledWith(
        'Unable to download QR code'
      )
    );
    expect(toastMock.error).not.toHaveBeenCalled();
    expect(downloadBlobMock).not.toHaveBeenCalled();
  });

  it('downloads the QR code image when the service answers', async () => {
    globalThis.fetch = vi.fn(
      async () => new Response(new Blob(['png']), { status: 200 })
    ) as typeof fetch;
    const user = userEvent.setup();
    render(<Header />);

    await openMenu(user);
    await user.click(
      screen.getByRole('menuitem', { name: 'Download QR Code' })
    );

    await waitFor(() =>
      expect(downloadBlobMock).toHaveBeenCalledWith(
        expect.any(Blob),
        'tim-qr.png'
      )
    );
    expect(toastMock.success).toHaveBeenCalledWith('QR code downloaded');
  });

  it.each([
    ['handle only', { displayName: 'tim' }, '@tim'],
    [
      'no identity yet',
      { username: '', displayName: '', profilePath: '' },
      'Profile',
    ],
    [
      'a long name',
      {
        displayName:
          'The Extraordinarily Long Artist Name That Keeps Going Past The Rail',
        username: 'the-extraordinarily-long-artist-handle',
      },
      'The Extraordinarily Long Artist Name That Keeps Going Past The Rail',
    ],
  ])('labels the header with %s', async (_label, props, expected) => {
    const { container } = render(<Header {...props} />);
    expect(screen.getByText(expected)).toHaveClass('truncate');
    await expectNoA11yViolations(container);
  });

  it('adds Apple Wallet when supported and has no axe violations in right-to-left', async () => {
    walletFlag.enabled = true;
    const user = userEvent.setup();
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <Header displayName='تيم وايت' />
      </div>
    );

    expect(screen.getByText('تيم وايت')).toBeInTheDocument();
    await openMenu(user);
    expect(
      screen.getByRole('menuitem', { name: 'Add To Apple Wallet' })
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
