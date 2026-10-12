import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const openDesktopAuthUrlMock = vi.fn().mockResolvedValue({ ok: true });
const copyDesktopAuthUrlMock = vi.fn().mockResolvedValue({ ok: true });
const closeDesktopAuthWindowMock = vi.fn().mockResolvedValue({ ok: true });
const redeemDesktopAuthReturnCodeMock = vi.fn().mockResolvedValue({ ok: true });
const supportsDesktopAuthReturnCodeMock = vi.fn(() => true);
const completeDesktopPasskeySignInMock = vi
  .fn()
  .mockResolvedValue({ ok: true });
const signInPasskeyMock = vi.fn().mockResolvedValue({ data: {}, error: null });

vi.mock('@/lib/auth/client', () => ({
  authClient: { signIn: { passkey: () => signInPasskeyMock() } },
}));
const isElectronRuntimeMock = vi.fn(() => true);
const searchParamsState = { value: '' };

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(searchParamsState.value),
}));

vi.mock('@/lib/desktop/electron-bridge', () => ({
  closeDesktopAuthWindow: () => closeDesktopAuthWindowMock(),
  copyDesktopAuthUrl: (authUrl: string) => copyDesktopAuthUrlMock(authUrl),
  isElectronRuntime: () => isElectronRuntimeMock(),
  openDesktopAuthUrl: (authUrl: string) => openDesktopAuthUrlMock(authUrl),
  redeemDesktopAuthReturnCode: (returnCode: string) =>
    redeemDesktopAuthReturnCodeMock(returnCode),
  supportsDesktopAuthReturnCode: () => supportsDesktopAuthReturnCodeMock(),
  completeDesktopPasskeySignIn: () => completeDesktopPasskeySignInMock(),
  // JOV-3595: DesktopAuthClient clears the shell boot watchdog on mount
  useDesktopAppBootSignal: vi.fn(),
  notifyDesktopAppBooted: vi.fn(),
}));

const generateQrCodeSvgMock = vi
  .fn()
  .mockResolvedValue('<svg data-qr-code="true"></svg>');

vi.mock('@/lib/utils/qr-code', () => ({
  generateQrCodeSvg: (url: string, size: number) =>
    generateQrCodeSvgMock(url, size),
}));

function getAuthUrlParam(): string | null {
  return new URLSearchParams(searchParamsState.value).get('auth_url');
}

async function openSignInOptions(): Promise<HTMLElement> {
  fireEvent.click(
    screen.getByRole('button', { name: 'Other Sign-in Options' })
  );
  return screen.findByTestId('desktop-auth-options');
}

// The handoff pulls in @jovie/ui; warm the module graph once so the first
// test's 5s budget measures behavior, not a cold transform.
beforeAll(async () => {
  await import('../../../app/desktop-auth/DesktopAuthClient');
  await import('../../../app/desktop-auth/page');
}, 60_000);

describe('DesktopAuthPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    openDesktopAuthUrlMock.mockReset().mockResolvedValue({ ok: true });
    searchParamsState.value =
      'auth_url=%2Fauth%2Fstart%3Fclient%3Delectron%26intent%3Dsign_in%26return_to%3D%252Fapp%252Fsettings%26code_challenge%3DabcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ%26code_challenge_method%3DS256';
  });

  it('server-renders the handoff instead of a blank Suspense fallback', async () => {
    const { default: DesktopAuthPage } = await import(
      '../../../app/desktop-auth/page'
    );

    render(
      await DesktopAuthPage({
        searchParams: Promise.resolve({
          auth_url: getAuthUrlParam() ?? undefined,
        }),
      })
    );

    expect(screen.getByTestId('desktop-auth-handoff')).toBeInTheDocument();
    expect(screen.getByTestId('desktop-auth-handoff')).toHaveAttribute(
      'data-desktop-auth-state',
      'idle'
    );
    expect(screen.getByTestId('desktop-auth-handoff')).toHaveAttribute(
      'data-mac-cinematic-shell',
      'auth-handoff'
    );
    const cornerMark = screen
      .getByTestId('desktop-auth-handoff')
      .querySelector('[data-mac-corner-mark]');
    expect(cornerMark).toHaveClass('opacity-35');
    expect(cornerMark?.querySelector('[data-brand-mark-size]')).toHaveAttribute(
      'data-brand-mark-size',
      '20'
    );
    expect(
      screen.getByRole('button', { name: 'Continue In Browser' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Finish Signing In' })
    ).toBeVisible();
    expect(
      screen.getByText('Continue in your browser, then return to Jovie.')
    ).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Other Sign-in Options' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Cancel Sign-in' })
    ).toBeInTheDocument();
    const actions = screen.getByTestId('desktop-auth-actions');
    expect(actions.querySelectorAll('button')).toHaveLength(3);
    expect(actions.querySelectorAll('[data-variant="primary"]')).toHaveLength(
      1
    );
    expect(
      screen.queryByTestId('desktop-auth-options')
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Copy Sign-in Link' })
    ).not.toBeInTheDocument();
  });

  it('waits for an explicit continue click before opening browser auth', async () => {
    const { DesktopAuthClient } = await import(
      '../../../app/desktop-auth/DesktopAuthClient'
    );

    render(<DesktopAuthClient authUrlParam={getAuthUrlParam()} />);

    const expectedAuthUrl = new URL(
      '/auth/start?client=electron&intent=sign_in&return_to=%2Fapp%2Fsettings&code_challenge=abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ&code_challenge_method=S256',
      window.location.origin
    ).toString();

    expect(openDesktopAuthUrlMock).not.toHaveBeenCalled();
    expect(screen.getAllByText('Continue In Browser')).toHaveLength(1);

    fireEvent.click(
      screen.getByRole('button', { name: 'Continue In Browser' })
    );

    await waitFor(() => {
      expect(openDesktopAuthUrlMock).toHaveBeenCalledTimes(1);
      expect(openDesktopAuthUrlMock).toHaveBeenCalledWith(expectedAuthUrl);
    });
    expect(await screen.findByText('Check your browser.')).toBeInTheDocument();
    expect(screen.getByTestId('desktop-auth-handoff')).toHaveAttribute(
      'data-desktop-auth-state',
      'opened'
    );
    const reopenButton = screen.getByRole('button', {
      name: 'Open Browser Again',
    });
    fireEvent.click(reopenButton);

    await waitFor(() => {
      expect(openDesktopAuthUrlMock).toHaveBeenCalledTimes(2);
    });

    fireEvent.click(screen.getByRole('button', { name: 'Cancel Sign-in' }));

    expect(closeDesktopAuthWindowMock).toHaveBeenCalledTimes(1);
  });

  it('progressively discloses peer fallback rows and closes them with Escape', async () => {
    const { DesktopAuthClient } = await import(
      '../../../app/desktop-auth/DesktopAuthClient'
    );

    render(<DesktopAuthClient authUrlParam={getAuthUrlParam()} />);

    const disclosure = screen.getByRole('button', {
      name: 'Other Sign-in Options',
    });
    expect(disclosure).toHaveAttribute('aria-expanded', 'false');
    expect(
      screen.queryByTestId('desktop-auth-options')
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Copy Sign-in Link' })
    ).not.toBeInTheDocument();

    const options = await openSignInOptions();
    expect(disclosure).toHaveAttribute('aria-expanded', 'true');
    const rows = options.querySelectorAll('[data-auth-option-row]');
    expect(rows).toHaveLength(3);
    for (const row of rows) {
      expect(row).toHaveAttribute('data-variant', 'tertiary');
    }
    expect(
      screen.getByRole('button', { name: 'Copy Sign-in Link' })
    ).toHaveFocus();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(
      screen.queryByTestId('desktop-auth-options')
    ).not.toBeInTheDocument();
    expect(disclosure).toHaveAttribute('aria-expanded', 'false');
    expect(disclosure).toHaveFocus();

    const cancel = screen.getByRole('button', { name: 'Cancel Sign-in' });
    expect(cancel.tagName).toBe('BUTTON');
    expect(cancel).toHaveAttribute('data-variant', 'link');
    expect(cancel).toHaveAttribute('data-size', 'sm');
    expect(cancel).toHaveClass('before:min-h-11');
  });

  it('shows a QR of the sign-in link for the phone path', async () => {
    const { DesktopAuthClient } = await import(
      '../../../app/desktop-auth/DesktopAuthClient'
    );

    render(<DesktopAuthClient authUrlParam={getAuthUrlParam()} />);

    await openSignInOptions();
    fireEvent.click(screen.getByRole('button', { name: 'Scan With Phone' }));

    const expectedAuthUrl = new URL(
      '/auth/start?client=electron&intent=sign_in&return_to=%2Fapp%2Fsettings&code_challenge=abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ&code_challenge_method=S256',
      window.location.origin
    ).toString();

    await waitFor(() => {
      expect(generateQrCodeSvgMock).toHaveBeenCalledWith(
        expectedAuthUrl,
        expect.any(Number)
      );
    });
    const qr = await screen.findByTestId('desktop-auth-qr');
    expect(qr.querySelector('svg')).not.toBeNull();
    expect(
      screen.getByText(
        'Finish signing in on your phone, then enter the code it shows.'
      )
    ).toBeInTheDocument();
    expect(qr).toHaveFocus();
    expect(
      screen.queryByRole('button', { name: 'Open Browser Again' })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Enter A Code' })
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: 'Back To Sign-in Options' })
    );
    expect(
      await screen.findByTestId('desktop-auth-options')
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Scan With Phone' })
    ).toHaveFocus();

    fireEvent.click(screen.getByRole('button', { name: 'Scan With Phone' }));
    await screen.findByTestId('desktop-auth-qr');
    fireEvent.click(screen.getByRole('button', { name: 'Enter A Code' }));
    expect(
      screen.getByRole('textbox', { name: 'Code From Your Browser' })
    ).toHaveFocus();
    fireEvent.click(
      screen.getByRole('button', { name: 'Back To Sign-in Options' })
    );
    expect(
      await screen.findByTestId('desktop-auth-options')
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Enter A Code' })).toHaveFocus();
  });

  it('keeps code entry and cancellation reachable when QR creation fails', async () => {
    generateQrCodeSvgMock.mockRejectedValueOnce(new Error('qr failed'));
    const { DesktopAuthClient } = await import(
      '../../../app/desktop-auth/DesktopAuthClient'
    );

    render(<DesktopAuthClient authUrlParam={getAuthUrlParam()} />);
    await openSignInOptions();
    fireEvent.click(screen.getByRole('button', { name: 'Scan With Phone' }));

    expect(
      await screen.findByText(
        'The QR code could not be created. Choose another sign-in option.'
      )
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Enter A Code' })
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel Sign-in' }));
    expect(closeDesktopAuthWindowMock).toHaveBeenCalledTimes(1);
  });

  it('keeps continue retryable and shows a stable failure message when browser launch fails', async () => {
    openDesktopAuthUrlMock.mockResolvedValueOnce({
      ok: false,
      reason: 'open-external-failed',
    });
    const { DesktopAuthClient } = await import(
      '../../../app/desktop-auth/DesktopAuthClient'
    );

    render(<DesktopAuthClient authUrlParam={getAuthUrlParam()} />);

    const continueButton = screen.getByRole('button', {
      name: 'Continue In Browser',
    });
    const actions = screen.getByTestId('desktop-auth-actions');
    const status = screen.getByRole('status');
    continueButton.focus();
    expect(continueButton).toHaveFocus();
    expect(
      screen.getByRole('button', { name: 'Cancel Sign-in' }).parentElement
    ).toBe(
      screen.getByRole('button', { name: 'Other Sign-in Options' })
        .parentElement
    );
    expect(actions.querySelectorAll('button')).toHaveLength(3);
    expect(
      actions.querySelector('[data-auth-action="cancel"]')
    ).toHaveAttribute('data-variant', 'link');
    expect(status).toHaveClass('min-h-10');

    expect(openDesktopAuthUrlMock).not.toHaveBeenCalled();
    fireEvent.click(continueButton);

    await waitFor(() => {
      expect(openDesktopAuthUrlMock).toHaveBeenCalledTimes(1);
    });
    const retryButton = screen.getByRole('button', { name: 'Try Again' });
    expect(retryButton).toBeEnabled();
    expect(retryButton).toHaveFocus();
    expect(actions.querySelectorAll('button')).toHaveLength(3);
    expect(
      await screen.findByText(/The browser did not open/i)
    ).toBeInTheDocument();
    expect(screen.getByTestId('desktop-auth-handoff')).toHaveAttribute(
      'data-desktop-auth-state',
      'error'
    );
    expect(status).toHaveClass('min-h-10');

    openDesktopAuthUrlMock.mockResolvedValueOnce({ ok: true });
    fireEvent.click(retryButton);

    await waitFor(() => {
      expect(openDesktopAuthUrlMock).toHaveBeenCalledTimes(2);
    });
    expect(await screen.findByText('Check your browser.')).toBeInTheDocument();
    expect(
      screen.queryByText('Continue signing in with your browser')
    ).not.toBeInTheDocument();
  });

  it('recovers when browser launch rejects', async () => {
    openDesktopAuthUrlMock.mockRejectedValueOnce(
      new Error('browser open rejected')
    );
    const { DesktopAuthClient } = await import(
      '../../../app/desktop-auth/DesktopAuthClient'
    );

    render(<DesktopAuthClient authUrlParam={getAuthUrlParam()} />);

    const continueButton = screen.getByRole('button', {
      name: 'Continue In Browser',
    });

    fireEvent.click(continueButton);

    await waitFor(() => {
      expect(openDesktopAuthUrlMock).toHaveBeenCalledTimes(1);
      expect(screen.getByRole('button', { name: 'Try Again' })).toBeEnabled();
    });
    expect(screen.getByRole('status')).toHaveTextContent(
      /The browser did not open/i
    );

    openDesktopAuthUrlMock.mockResolvedValueOnce({ ok: true });
    fireEvent.click(screen.getByRole('button', { name: 'Try Again' }));

    await waitFor(() => {
      expect(openDesktopAuthUrlMock).toHaveBeenCalledTimes(2);
    });
    expect(await screen.findByText('Check your browser.')).toBeInTheDocument();
    expect(
      screen.queryByText('Continue signing in with your browser')
    ).not.toBeInTheDocument();
  });

  it('disables continue only while a browser launch is pending', async () => {
    let resolveOpen: (value: { ok: false; reason: string }) => void = () => {};
    openDesktopAuthUrlMock.mockReturnValueOnce(
      new Promise<{ ok: false; reason: string }>(resolve => {
        resolveOpen = resolve;
      })
    );
    const { DesktopAuthClient } = await import(
      '../../../app/desktop-auth/DesktopAuthClient'
    );

    render(<DesktopAuthClient authUrlParam={getAuthUrlParam()} />);

    const continueButton = screen.getByRole('button', {
      name: 'Continue In Browser',
    });

    fireEvent.click(continueButton);

    await waitFor(() => {
      expect(continueButton).toBeDisabled();
    });
    fireEvent.click(continueButton);
    expect(openDesktopAuthUrlMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveOpen({ ok: false, reason: 'open-external-failed' });
    });

    await waitFor(() => {
      expect(continueButton).toBeEnabled();
    });
    expect(screen.getByRole('status')).toHaveTextContent(
      /The browser did not open/i
    );
  });

  it('points at the copy-link path when the browser never returns', async () => {
    vi.useFakeTimers();
    try {
      const { DesktopAuthClient, DESKTOP_AUTH_STILL_WAITING_MS } = await import(
        '../../../app/desktop-auth/DesktopAuthClient'
      );
      render(<DesktopAuthClient authUrlParam={getAuthUrlParam()} />);

      await act(async () => {
        fireEvent.click(
          screen.getByRole('button', { name: 'Continue In Browser' })
        );
      });
      expect(screen.getByRole('status')).toHaveTextContent(
        'Check your browser.'
      );

      await act(async () => {
        vi.advanceTimersByTime(DESKTOP_AUTH_STILL_WAITING_MS);
      });
      expect(screen.getByRole('status')).toHaveTextContent(
        'Not seeing it? Copy the sign-in link and paste it into any browser.'
      );
      // Reopening restarts the wait instead of nagging immediately.
      await act(async () => {
        fireEvent.click(
          screen.getByRole('button', { name: 'Open Browser Again' })
        );
      });
      expect(screen.getByRole('status')).toHaveTextContent(
        'Check your browser.'
      );
      await act(async () => {
        fireEvent.click(
          screen.getByRole('button', { name: 'Other Sign-in Options' })
        );
      });
      expect(
        screen.getByRole('button', { name: 'Copy Sign-in Link' })
      ).toBeEnabled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('redeems the browser return code when the deep link cannot reach the app', async () => {
    const { DesktopAuthClient, normalizeReturnCodeInput } = await import(
      '../../../app/desktop-auth/DesktopAuthClient'
    );
    expect(normalizeReturnCodeInput('bcdf ghjk')).toBe('BCDF-GHJK');
    expect(normalizeReturnCodeInput('b0c1d')).toBe('BCD');
    expect(normalizeReturnCodeInput('BCDF-GHJK-LMNP')).toBe('BCDF-GHJK');

    render(<DesktopAuthClient authUrlParam={getAuthUrlParam()} />);
    await openSignInOptions();
    fireEvent.click(screen.getByRole('button', { name: 'Enter A Code' }));

    const input = screen.getByRole('textbox', {
      name: 'Code From Your Browser',
    });
    expect(input).toHaveFocus();
    const continueButton = screen.getByRole('button', { name: 'Continue' });
    expect(continueButton).toBeDisabled();
    // Cancel stays reachable in code mode, so the action stack keeps its rows.
    expect(
      screen.getByRole('button', { name: 'Cancel Sign-in' })
    ).toBeInTheDocument();

    redeemDesktopAuthReturnCodeMock.mockResolvedValueOnce({
      ok: false,
      reason: 'invalid-code',
    });
    fireEvent.change(input, { target: { value: 'bcdfghjl' } });
    expect(input).toHaveValue('BCDF-GHJL');
    await act(async () => {
      fireEvent.click(continueButton);
    });
    expect(redeemDesktopAuthReturnCodeMock).toHaveBeenCalledWith('BCDF-GHJL');
    expect(screen.getByRole('status')).toHaveTextContent(
      'That code did not match. Check it and try again.'
    );

    fireEvent.change(input, { target: { value: 'BCDF-GHJK' } });
    expect(screen.getByRole('status')).toHaveTextContent(
      'Enter the code shown in your browser or on your phone.'
    );
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    });
    expect(screen.getByRole('status')).toHaveTextContent(
      'Sign-in complete. Returning to Jovie...'
    );
    expect(
      screen.getByRole('button', { name: 'Back To Sign-in Options' })
    ).toBeEnabled();
  });

  it.each([
    [
      'pkce-expired',
      'This sign-in expired. Open the browser again for a new code.',
    ],
    ['no-pending-flow', 'Open the browser to sign in first.'],
    ['rate-limited', 'Too many tries. Wait a minute and try again.'],
    ['network', 'Could not reach Jovie. Check your connection and try again.'],
  ])('explains a %s return code failure', async (reason, message) => {
    redeemDesktopAuthReturnCodeMock.mockResolvedValueOnce({
      ok: false,
      reason,
    });
    const { DesktopAuthClient } = await import(
      '../../../app/desktop-auth/DesktopAuthClient'
    );
    render(<DesktopAuthClient authUrlParam={getAuthUrlParam()} />);
    await openSignInOptions();
    fireEvent.click(screen.getByRole('button', { name: 'Enter A Code' }));
    fireEvent.change(
      screen.getByRole('textbox', { name: 'Code From Your Browser' }),
      { target: { value: 'BCDFGHJK' } }
    );
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    });
    expect(screen.getByRole('status')).toHaveTextContent(message);
  });

  it('hides code entry from Mac builds that cannot redeem codes, without shifting layout', async () => {
    supportsDesktopAuthReturnCodeMock.mockReturnValueOnce(false);
    const { DesktopAuthClient } = await import(
      '../../../app/desktop-auth/DesktopAuthClient'
    );
    render(<DesktopAuthClient authUrlParam={getAuthUrlParam()} />);
    await openSignInOptions();
    expect(screen.queryByRole('button', { name: 'Enter A Code' })).toBeNull();
    expect(
      screen.queryByRole('button', { name: 'Scan With Phone' })
    ).toBeNull();
    expect(
      screen.getByRole('button', { name: 'Copy Sign-in Link' })
    ).toBeInTheDocument();
  });

  it('signs in with Touch ID in the app when this Mac enrolled', async () => {
    const { DesktopAuthClient } = await import(
      '../../../app/desktop-auth/DesktopAuthClient'
    );
    render(<DesktopAuthClient authUrlParam={getAuthUrlParam()} touchIdHint />);

    const touchId = screen.getByRole('button', {
      name: 'Sign In With Touch ID',
    });
    expect(
      screen.queryByRole('button', { name: 'Continue In Browser' })
    ).not.toBeInTheDocument();
    expect(
      screen.getByTestId('desktop-auth-actions').querySelectorAll('button')
    ).toHaveLength(3);
    await act(async () => {
      fireEvent.click(touchId);
    });

    expect(signInPasskeyMock).toHaveBeenCalledTimes(1);
    expect(completeDesktopPasskeySignInMock).toHaveBeenCalledTimes(1);
    expect(openDesktopAuthUrlMock).not.toHaveBeenCalled();
    expect(screen.getByRole('status')).toHaveTextContent(
      'Waiting for Touch ID...'
    );
  });

  it('falls back to the browser when Touch ID does not sign in', async () => {
    signInPasskeyMock.mockResolvedValueOnce({
      data: null,
      error: { message: 'NotAllowedError' },
    });
    const { DesktopAuthClient } = await import(
      '../../../app/desktop-auth/DesktopAuthClient'
    );
    render(<DesktopAuthClient authUrlParam={getAuthUrlParam()} touchIdHint />);

    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: 'Sign In With Touch ID' })
      );
    });

    expect(completeDesktopPasskeySignInMock).not.toHaveBeenCalled();
    expect(screen.getByRole('status')).toHaveTextContent(
      'Touch ID did not sign you in. Continue in the browser instead.'
    );
    expect(
      screen.getByRole('button', { name: 'Continue In Browser' })
    ).toBeEnabled();
    expect(
      screen.getByRole('button', { name: 'Continue In Browser' })
    ).toHaveFocus();
  });

  it('gives the selected code step its own action area and keeps Touch ID reachable', async () => {
    const { DesktopAuthClient } = await import(
      '../../../app/desktop-auth/DesktopAuthClient'
    );
    const { unmount } = render(
      <DesktopAuthClient authUrlParam={getAuthUrlParam()} touchIdHint />
    );
    await openSignInOptions();
    expect(
      screen.getByRole('button', { name: 'Continue In Browser' })
    ).toHaveFocus();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByTestId('desktop-auth-options')).toBeNull();
    expect(
      screen.getByRole('button', { name: 'Other Sign-in Options' })
    ).toHaveFocus();
    await openSignInOptions();
    fireEvent.click(screen.getByRole('button', { name: 'Enter A Code' }));
    expect(
      screen.queryByRole('button', { name: 'Sign In With Touch ID' })
    ).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: 'Back To Sign-in Options' })
    );
    expect(
      screen.getByRole('button', { name: 'Sign In With Touch ID' })
    ).toBeInTheDocument();
    unmount();

    render(<DesktopAuthClient authUrlParam={getAuthUrlParam()} />);
    expect(
      screen.queryByRole('button', { name: 'Sign In With Touch ID' })
    ).toBeNull();
  });

  it('copies the validated sign-in link and reports copy failures', async () => {
    const { DesktopAuthClient } = await import(
      '../../../app/desktop-auth/DesktopAuthClient'
    );

    render(<DesktopAuthClient authUrlParam={getAuthUrlParam()} />);

    await openSignInOptions();
    const copyButton = screen.getByRole('button', {
      name: 'Copy Sign-in Link',
    });
    let resolveCopy: (result: { ok: true }) => void = () => {};
    copyDesktopAuthUrlMock.mockReturnValueOnce(
      new Promise<{ ok: true }>(resolve => {
        resolveCopy = resolve;
      })
    );
    fireEvent.click(copyButton);

    expect(copyButton).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent(
      'Copying the sign-in link...'
    );
    fireEvent.click(copyButton);
    expect(copyDesktopAuthUrlMock).toHaveBeenCalledTimes(1);

    await act(async () => resolveCopy({ ok: true }));

    await waitFor(() => {
      expect(copyDesktopAuthUrlMock).toHaveBeenCalledTimes(1);
      expect(screen.getByRole('status')).toHaveTextContent(
        'Sign-in link copied. Paste it into any browser.'
      );
    });

    copyDesktopAuthUrlMock.mockResolvedValueOnce({
      ok: false,
      reason: 'clipboard-write-failed',
    });
    fireEvent.click(copyButton);

    await waitFor(() => {
      expect(copyDesktopAuthUrlMock).toHaveBeenCalledTimes(2);
      expect(screen.getByRole('status')).toHaveTextContent(
        /could not be copied/i
      );
    });
  });

  it('explains an invalid or expired handoff link without adding peer CTAs', async () => {
    openDesktopAuthUrlMock.mockResolvedValueOnce({
      ok: false,
      reason: 'invalid-auth-url',
    });
    const { DesktopAuthClient } = await import(
      '../../../app/desktop-auth/DesktopAuthClient'
    );

    render(<DesktopAuthClient authUrlParam={getAuthUrlParam()} />);
    fireEvent.click(
      screen.getByRole('button', { name: 'Continue In Browser' })
    );
    expect(
      await screen.findByText(
        'Sign-in could not start. Close this window and try again from Jovie.'
      )
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('desktop-auth-actions').querySelectorAll('button')
    ).toHaveLength(3);

    await openSignInOptions();
    copyDesktopAuthUrlMock.mockResolvedValueOnce({
      ok: false,
      reason: 'invalid-auth-url',
    });
    fireEvent.click(screen.getByRole('button', { name: 'Copy Sign-in Link' }));
    expect(
      await screen.findByText(
        'The sign-in link is no longer valid. Try opening the browser again.'
      )
    ).toBeInTheDocument();
  });

  it('keeps cancel available before opening and after an open failure', async () => {
    openDesktopAuthUrlMock.mockResolvedValueOnce({
      ok: false,
      reason: 'open-external-failed',
    });
    const { DesktopAuthClient } = await import(
      '../../../app/desktop-auth/DesktopAuthClient'
    );

    render(<DesktopAuthClient authUrlParam={getAuthUrlParam()} />);

    const cancelButton = screen.getByRole('button', {
      name: 'Cancel Sign-in',
    });
    fireEvent.click(cancelButton);
    expect(closeDesktopAuthWindowMock).toHaveBeenCalledTimes(1);

    fireEvent.click(
      screen.getByRole('button', { name: 'Continue In Browser' })
    );
    await screen.findByRole('button', { name: 'Try Again' });

    fireEvent.click(cancelButton);
    expect(closeDesktopAuthWindowMock).toHaveBeenCalledTimes(2);
  });
});

describe('DesktopAuthRouteHandoff', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.pushState(
      {},
      '',
      '/signin?redirect_url=%2Fapp%2Fchat%3Fruntime%3Delectron'
    );
  });

  it('keeps browser reopen and copy actions available for Electron auth routes', async () => {
    const { DesktopAuthRouteHandoff } = await import(
      '../../../app/(auth)/DesktopAuthRouteHandoff'
    );

    render(<DesktopAuthRouteHandoff />);

    expect(
      screen.getByTestId('desktop-auth-route-handoff')
    ).toBeInTheDocument();
    expect(screen.getByTestId('desktop-auth-route-handoff')).toHaveAttribute(
      'data-auth-shell-kind',
      'desktop-return-handoff'
    );
    expect(screen.getByTestId('desktop-auth-route-handoff')).toHaveAttribute(
      'data-desktop-auth-state',
      'idle'
    );
    const cornerMark = screen
      .getByTestId('desktop-auth-route-handoff')
      .querySelector('[data-mac-corner-mark]');
    expect(cornerMark).toHaveClass('opacity-35');
    expect(cornerMark?.querySelector('[data-brand-mark-size]')).toHaveAttribute(
      'data-brand-mark-size',
      '20'
    );
    expect(screen.queryByTestId('auth-brand-panel')).not.toBeInTheDocument();
    expect(openDesktopAuthUrlMock).not.toHaveBeenCalled();
    expect(screen.getAllByText('Continue In Browser')).toHaveLength(1);
    expect(
      screen.getByRole('button', { name: 'Other Sign-in Options' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Cancel Sign-in' })
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('desktop-auth-actions').querySelectorAll('button')
    ).toHaveLength(3);
    expect(
      screen.queryByRole('button', { name: 'Copy Sign-in Link' })
    ).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: 'Continue In Browser' })
    );

    await waitFor(() => {
      expect(openDesktopAuthUrlMock).toHaveBeenCalledTimes(1);
      expect(openDesktopAuthUrlMock).toHaveBeenCalledWith(window.location.href);
    });
    expect(await screen.findByText('Check your browser.')).toBeInTheDocument();
    expect(screen.getByTestId('desktop-auth-route-handoff')).toHaveAttribute(
      'data-desktop-auth-state',
      'opened'
    );
    fireEvent.click(screen.getByRole('button', { name: 'Open Browser Again' }));
    await waitFor(() => {
      expect(openDesktopAuthUrlMock).toHaveBeenCalledTimes(2);
    });

    await openSignInOptions();
    fireEvent.click(screen.getByRole('button', { name: 'Copy Sign-in Link' }));
    await waitFor(() => {
      expect(copyDesktopAuthUrlMock).toHaveBeenCalledWith(window.location.href);
    });
  });

  it('recovers when route handoff browser launch rejects', async () => {
    openDesktopAuthUrlMock.mockRejectedValueOnce(
      new Error('browser open rejected')
    );
    const { DesktopAuthRouteHandoff } = await import(
      '../../../app/(auth)/DesktopAuthRouteHandoff'
    );

    render(<DesktopAuthRouteHandoff />);

    const continueButton = screen.getByRole('button', {
      name: 'Continue In Browser',
    });

    fireEvent.click(continueButton);

    await waitFor(() => {
      expect(openDesktopAuthUrlMock).toHaveBeenCalledTimes(1);
      expect(continueButton).toBeEnabled();
    });
    expect(screen.getByRole('status')).toHaveTextContent(
      /The browser did not open/i
    );
    expect(screen.getByTestId('desktop-auth-route-handoff')).toHaveAttribute(
      'data-desktop-auth-state',
      'error'
    );
  });

  it('detects Electron runtime hints before rendering Clerk auth UI', async () => {
    const { useShouldRenderDesktopAuthHandoff } = await import(
      '../../../app/(auth)/DesktopAuthRouteHandoff'
    );

    function Probe() {
      const shouldRender = useShouldRenderDesktopAuthHandoff(
        new URLSearchParams('redirect_url=%2Fapp%2Fchat%3Fruntime%3Delectron')
      );
      return <span>{String(shouldRender)}</span>;
    }

    render(<Probe />);

    expect(screen.getByText('true')).toBeInTheDocument();
  });
});
