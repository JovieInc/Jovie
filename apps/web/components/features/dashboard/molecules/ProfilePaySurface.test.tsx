import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProfileMonetizationSummaryResponse } from '@/lib/profile-monetization';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { ProfilePaySurface } from './ProfilePaySurface';

const mocks = vi.hoisted(() => ({
  copyToClipboard: vi.fn(),
  generateQrCodeDataUrl: vi.fn(),
  generateQrCodeSvg: vi.fn(),
  downloadBlob: vi.fn(),
  downloadString: vi.fn(),
}));

vi.mock('@/lib/flags/client', () => ({ useAppFlag: () => true }));
vi.mock('@/hooks/useClipboard', () => ({
  copyToClipboard: mocks.copyToClipboard,
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

const QR_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

const active: ProfileMonetizationSummaryResponse = {
  paymentState: 'active',
  provider: 'stripe',
  manageHref: '/app/settings/payments',
  tipUrl: 'https://jov.ie/tim/pay',
  tipVisits: 214,
  tipsReceived: 18,
  totalReceivedCents: 42_500,
  monthReceivedCents: 8_200,
  narrative: '18 fans paid you $425.00 total.',
} as ProfileMonetizationSummaryResponse;

function renderSurface(
  summary: ProfileMonetizationSummaryResponse,
  extra: Partial<Parameters<typeof ProfilePaySurface>[0]> = {}
) {
  const handlers = {
    onSetUsername: vi.fn(),
    onSetUpTips: vi.fn(),
    onManagePayments: vi.fn(),
    onViewAnalytics: vi.fn(),
  };
  const view = render(
    <ProfilePaySurface summary={summary} {...handlers} {...extra} />
  );
  return { ...view, handlers };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.generateQrCodeDataUrl.mockResolvedValue(QR_DATA_URL);
  mocks.generateQrCodeSvg.mockResolvedValue('<svg />');
});

describe('ProfilePaySurface', () => {
  it('renders the Stripe-connected primary action without any flag provider (JOV-13131: Stripe Connect is no longer flag-gated)', () => {
    const setup: ProfileMonetizationSummaryResponse = {
      ...active,
      paymentState: 'not_setup',
      provider: 'none',
      manageHref: null,
      tipUrl: null,
    };
    renderSurface(setup);
    expect(
      screen.getByRole('button', { name: 'Set Up Payments' })
    ).toBeEnabled();
  });

  it('copies the pay link from an active surface and reports it', async () => {
    const user = userEvent.setup();
    mocks.copyToClipboard.mockResolvedValue(true);
    const { container } = renderSurface(active);
    expect(
      await screen.findByRole('img', { name: 'Payment QR code' })
    ).toBeInTheDocument();
    expect(screen.getByText('Stripe')).toBeInTheDocument();

    const primary = screen.getAllByRole('button')[0];
    await user.click(primary);
    expect(mocks.copyToClipboard).toHaveBeenCalledWith(
      'https://jov.ie/tim/pay'
    );
    expect(await screen.findByText('Payment link copied.')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('reports a failed copy', async () => {
    const user = userEvent.setup();
    mocks.copyToClipboard.mockResolvedValue(false);
    renderSurface(active);
    await user.click(screen.getAllByRole('button')[0]);
    expect(
      await screen.findByText('Could not copy payment link.')
    ).toBeInTheDocument();
  });

  it('opens Analytics from the traffic link', async () => {
    const user = userEvent.setup();
    const { handlers } = renderSurface(active);
    await user.click(
      screen.getByRole('button', { name: 'View payment traffic in Analytics' })
    );
    expect(handlers.onViewAnalytics).toHaveBeenCalledTimes(1);
  });

  it('downloads the QR code as PNG and SVG', async () => {
    const user = userEvent.setup();
    renderSurface(active);
    await user.click(screen.getByRole('button', { name: 'Download QR' }));
    await user.click(
      await screen.findByRole('menuitem', { name: 'Download PNG' })
    );
    await waitFor(() =>
      expect(mocks.downloadBlob).toHaveBeenCalledWith(
        expect.any(Blob),
        'jovie-pay-tim.png'
      )
    );
    expect(
      await screen.findByText('QR code downloaded as PNG.')
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Download QR' }));
    await user.click(
      await screen.findByRole('menuitem', { name: 'Download SVG' })
    );
    await waitFor(() => expect(mocks.downloadString).toHaveBeenCalled());
  });

  it('reports a failed PNG download', async () => {
    const user = userEvent.setup();
    renderSurface(active);
    await screen.findByRole('img', { name: 'Payment QR code' });
    mocks.generateQrCodeDataUrl.mockRejectedValueOnce(new Error('qr'));
    await user.click(screen.getByRole('button', { name: 'Download QR' }));
    await user.click(
      await screen.findByRole('menuitem', { name: 'Download PNG' })
    );
    expect(
      await screen.findByText('Could not download PNG QR code.')
    ).toBeInTheDocument();
  });

  it.each([
    ['needs_profile_url', 'onSetUsername'],
    ['not_setup', 'onSetUpTips'],
    ['setup_incomplete', 'onManagePayments'],
  ] as const)('routes the %s primary action', async (paymentState, handler) => {
    const user = userEvent.setup();
    const { container, handlers } = renderSurface({
      ...active,
      paymentState,
      provider: 'none',
      tipUrl: null,
      tipVisits: 0,
      narrative: 'Finish setup to start receiving payments.',
    });
    expect(
      screen.getByText('QR unlocks when payments are live.')
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Download QR' })
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole('button'));
    expect(handlers[handler]).toHaveBeenCalledTimes(1);
    await expectNoA11yViolations(container);
  });

  it('hides the Analytics link with no visits and lays out the drawer', async () => {
    const { container } = renderSurface(
      { ...active, tipVisits: 0, provider: 'venmo' },
      { variant: 'drawer' }
    );
    expect(
      screen.getByTestId('profile-tips-surface-drawer')
    ).toBeInTheDocument();
    expect(screen.getByText('Venmo')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Analytics/ })
    ).not.toBeInTheDocument();
    await screen.findByRole('img', { name: 'Payment QR code' });
    await expectNoA11yViolations(container);
  });

  it('renders an Arabic narrative right to left', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <ProfilePaySurface
          summary={{
            ...active,
            narrative: 'فتح ٨ معجبين رابط الدفع الخاص بك.',
          }}
          onSetUsername={vi.fn()}
          onSetUpTips={vi.fn()}
          onManagePayments={vi.fn()}
        />
      </div>
    );
    expect(
      screen.getByText('فتح ٨ معجبين رابط الدفع الخاص بك.')
    ).toBeInTheDocument();
    await screen.findByRole('img', { name: 'Payment QR code' });
    await expectNoA11yViolations(container);
  });
});
