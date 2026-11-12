import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';

// State and accessibility coverage for each handoff state. The full method,
// focus and timeout contract lives in tests/unit/app/desktop-auth-page.test.tsx.
const bridge = vi.hoisted(() => ({
  open: vi.fn(),
  copy: vi.fn(),
  redeem: vi.fn(),
  supportsCode: vi.fn(() => true),
}));

vi.mock('@/lib/desktop/electron-bridge', () => ({
  closeDesktopAuthWindow: vi.fn().mockResolvedValue({ ok: true }),
  completeDesktopPasskeySignIn: vi.fn().mockResolvedValue({ ok: true }),
  copyDesktopAuthUrl: (url: string) => bridge.copy(url),
  openDesktopAuthUrl: (url: string) => bridge.open(url),
  redeemDesktopAuthReturnCode: (code: string) => bridge.redeem(code),
  supportsDesktopAuthReturnCode: () => bridge.supportsCode(),
  useDesktopAppBootSignal: vi.fn(),
}));

vi.mock('@/lib/utils/qr-code', () => ({
  generateQrCodeSvg: vi
    .fn()
    .mockResolvedValue('<svg data-qr-code="true" aria-hidden="true"></svg>'),
}));

const AUTH_URL_PARAM =
  '/auth/start?client=electron&intent=sign_in&return_to=%2Fapp%2Fsettings&code_challenge=abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ&code_challenge_method=S256';

let DesktopAuthClient: typeof import('./DesktopAuthClient').DesktopAuthClient;

beforeAll(async () => {
  ({ DesktopAuthClient } = await import('./DesktopAuthClient'));
}, 60_000);

async function openOptions(user: ReturnType<typeof userEvent.setup>) {
  await user.click(
    screen.getByRole('button', { name: 'Other Sign-in Options' })
  );
  return screen.findByTestId('desktop-auth-options');
}

describe('DesktopAuthClient states', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    bridge.open.mockResolvedValue({ ok: true });
    bridge.copy.mockResolvedValue({ ok: true });
    bridge.redeem.mockResolvedValue({ ok: true });
    bridge.supportsCode.mockReturnValue(true);
  });

  it('opens the browser handoff from the primary action', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <DesktopAuthClient authUrlParam={AUTH_URL_PARAM} />
    );

    expect(
      screen.getByRole('heading', { level: 1, name: 'Finish Signing In' })
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: 'Continue In Browser' })
    );

    expect(bridge.open).toHaveBeenCalledTimes(1);
    expect(
      await screen.findByRole('button', { name: 'Open Browser Again' })
    ).toBeEnabled();
    expect(screen.getByRole('status')).toHaveTextContent('Check your browser.');
    await expectNoA11yViolations(container);
  });

  it('asks to restart from Jovie when the sign-in link is missing', async () => {
    const { container } = render(<DesktopAuthClient authUrlParam={null} />);

    expect(
      screen.getByRole('button', { name: 'Continue In Browser' })
    ).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent(
      'Start sign-in again from Jovie.'
    );
    await expectNoA11yViolations(container);
  });

  it('holds every action while the browser is opening', async () => {
    const user = userEvent.setup();
    bridge.open.mockReturnValue(new Promise(() => undefined));
    const { container } = render(
      <DesktopAuthClient authUrlParam={AUTH_URL_PARAM} />
    );

    await user.click(
      screen.getByRole('button', { name: 'Continue In Browser' })
    );

    expect(
      screen.getByRole('button', { name: 'Opening Browser...' })
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Other Sign-in Options' })
    ).toBeDisabled();
    await expectNoA11yViolations(container);
  });

  it('offers a retry and keeps focus on it when the browser did not open', async () => {
    const user = userEvent.setup();
    bridge.open.mockResolvedValue({ ok: false, reason: 'shell-open-failed' });
    const { container } = render(
      <DesktopAuthClient authUrlParam={AUTH_URL_PARAM} />
    );

    await user.click(
      screen.getByRole('button', { name: 'Continue In Browser' })
    );

    const retry = await screen.findByRole('button', { name: 'Try Again' });
    await waitFor(() => expect(retry).toHaveFocus());
    expect(screen.getByRole('status')).toHaveTextContent(
      'The browser did not open. Try again, or copy the sign-in link.'
    );
    await expectNoA11yViolations(container);
  });

  it('draws the phone QR on the fixed on-media white tile', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <DesktopAuthClient authUrlParam={AUTH_URL_PARAM} />
    );

    await openOptions(user);
    await user.click(screen.getByRole('button', { name: 'Scan With Phone' }));

    const tile = await screen.findByRole('img', {
      name: 'QR Code With Your Sign-in Link',
    });
    expect(tile).toHaveClass('bg-on-media', 'p-3');
    expect(tile.className).not.toMatch(/\bbg-white\b/);
    expect(tile.querySelector('svg')).not.toBeNull();
    await expectNoA11yViolations(container);
  });

  it('keeps the typed code when a redeem cannot reach Jovie', async () => {
    const user = userEvent.setup();
    bridge.redeem.mockResolvedValue({ ok: false });
    const { container } = render(
      <DesktopAuthClient authUrlParam={AUTH_URL_PARAM} />
    );

    await openOptions(user);
    await user.click(screen.getByRole('button', { name: 'Enter A Code' }));
    const input = screen.getByRole('textbox', {
      name: 'Code From Your Browser',
    });
    await user.type(input, 'bcdfghjk');
    expect(input).toHaveValue('BCDF-GHJK');
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Could not reach Jovie. Check your connection and try again.'
    );
    expect(input).toHaveValue('BCDF-GHJK');
    await waitFor(() => expect(input).toHaveFocus());
    await expectNoA11yViolations(container);
  });

  it('hides code entry on a Mac build that cannot redeem codes', async () => {
    const user = userEvent.setup();
    bridge.supportsCode.mockReturnValue(false);
    render(<DesktopAuthClient authUrlParam={AUTH_URL_PARAM} />);

    const options = await openOptions(user);
    expect(options).toHaveTextContent('Copy Sign-in Link');
    expect(
      screen.queryByRole('button', { name: 'Enter A Code' })
    ).not.toBeInTheDocument();
  });

  it('has no axe violations in a right-to-left window', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <DesktopAuthClient authUrlParam={AUTH_URL_PARAM} />
      </div>
    );

    expect(
      screen.getByRole('button', { name: 'Continue In Browser' })
    ).toBeEnabled();
    await expectNoA11yViolations(container);
  });
});
