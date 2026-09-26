import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const openDesktopAuthUrlMock = vi.fn().mockResolvedValue({ ok: true });
const copyDesktopAuthUrlMock = vi.fn().mockResolvedValue({ ok: true });
const closeDesktopAuthWindowMock = vi.fn().mockResolvedValue({ ok: true });
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
  // JOV-3595: DesktopAuthClient clears the shell boot watchdog on mount
  useDesktopAppBootSignal: vi.fn(),
  notifyDesktopAppBooted: vi.fn(),
}));

function getAuthUrlParam(): string | null {
  return new URLSearchParams(searchParamsState.value).get('auth_url');
}

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
    });
    expect(screen.getByRole('status')).toHaveTextContent(
      'Sign-in link copied.'
    );

    copyDesktopAuthUrlMock.mockResolvedValueOnce({
      ok: false,
      reason: 'clipboard-write-failed',
    });
    fireEvent.click(copyButton);

    await waitFor(() => {
      expect(copyDesktopAuthUrlMock).toHaveBeenCalledTimes(2);
    });
    expect(screen.getByRole('status')).toHaveTextContent(
      /could not be copied/i
    );
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
