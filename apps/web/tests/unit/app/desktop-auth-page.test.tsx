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

// The handoff pulls in @jovie/ui; warm the module graph once so the first
// test's 5s budget measures behavior, not a cold transform.
beforeAll(async () => {
  await import('../../../app/desktop-auth/DesktopAuthClient');
  await import('../../../app/desktop-auth/page');
}, 60_000);

describe('DesktopAuthPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
      screen.getByRole('button', { name: 'Continue in Browser' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Copy Sign-In Link' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Cancel Sign-In' })
    ).toBeInTheDocument();
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
    expect(screen.getAllByText('Continue in Browser')).toHaveLength(1);

    fireEvent.click(
      screen.getByRole('button', { name: 'Continue in Browser' })
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

    fireEvent.click(screen.getByRole('button', { name: 'Cancel Sign-In' }));

    expect(closeDesktopAuthWindowMock).toHaveBeenCalledTimes(1);
  });

  it('shows a QR of the sign-in link for the phone path', async () => {
    const { DesktopAuthClient } = await import(
      '../../../app/desktop-auth/DesktopAuthClient'
    );

    render(<DesktopAuthClient authUrlParam={getAuthUrlParam()} />);

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
      screen.getByText('Scan with your phone to finish sign-in there.')
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: 'Back To Browser Sign-in' })
    );
    expect(
      screen.getByRole('button', { name: 'Continue in Browser' })
    ).toBeInTheDocument();
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
      name: 'Continue in Browser',
    });
    const actions = screen.getByTestId('desktop-auth-actions');
    const status = screen.getByRole('status');
    continueButton.focus();
    expect(continueButton).toHaveFocus();
    expect(actions).toHaveClass('gap-2');
    expect(actions.querySelectorAll('button')).toHaveLength(3);
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
      name: 'Continue in Browser',
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
      name: 'Continue in Browser',
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
          screen.getByRole('button', { name: 'Continue in Browser' })
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
      expect(
        screen.getByRole('button', { name: 'Copy Sign-In Link' })
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
    fireEvent.click(
      await screen.findByRole('button', { name: 'Enter A Code' })
    );

    const input = screen.getByRole('textbox', {
      name: 'Code From Your Browser',
    });
    expect(input).toHaveFocus();
    const continueButton = screen.getByRole('button', { name: 'Continue' });
    expect(continueButton).toBeDisabled();
    // Cancel stays reachable in code mode, so the action stack keeps its rows.
    expect(
      screen.getByRole('button', { name: 'Cancel Sign-In' })
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
      'Enter the code your browser shows.'
    );
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    });
    expect(screen.getByRole('status')).toHaveTextContent('Signing in...');
    expect(
      screen.getByRole('button', { name: 'Back To Browser Sign-in' })
    ).toBeDisabled();
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
    fireEvent.click(
      await screen.findByRole('button', { name: 'Enter A Code' })
    );
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
    expect(screen.queryByRole('button', { name: 'Enter A Code' })).toBeNull();
    // The phone path needs no bridge capability, so the row still renders.
    expect(
      screen.getByRole('button', { name: 'Scan With Phone' })
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
      screen.getByRole('button', { name: 'Continue in Browser' })
    ).toBeEnabled();
  });

  it('keeps the Touch ID row in code mode and hides it without the hint', async () => {
    const { DesktopAuthClient } = await import(
      '../../../app/desktop-auth/DesktopAuthClient'
    );
    const { unmount } = render(
      <DesktopAuthClient authUrlParam={getAuthUrlParam()} touchIdHint />
    );
    fireEvent.click(
      await screen.findByRole('button', { name: 'Enter a Code' })
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

    const copyButton = screen.getByRole('button', {
      name: 'Copy Sign-In Link',
    });
    fireEvent.click(copyButton);

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
      name: 'Cancel Sign-In',
    });
    fireEvent.click(cancelButton);
    expect(closeDesktopAuthWindowMock).toHaveBeenCalledTimes(1);

    fireEvent.click(
      screen.getByRole('button', { name: 'Continue in Browser' })
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
    expect(screen.getAllByText('Continue in Browser')).toHaveLength(1);
    expect(
      screen.getByRole('button', { name: 'Copy Sign-In Link' })
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: 'Continue in Browser' })
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
      expect(
        screen.getByRole('button', { name: 'Copy Sign-In Link' })
      ).toBeEnabled();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Copy Sign-In Link' }));
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
      name: 'Continue in Browser',
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
