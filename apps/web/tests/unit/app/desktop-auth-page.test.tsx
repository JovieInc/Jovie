import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const openDesktopAuthUrlMock = vi.fn().mockResolvedValue({ ok: true });
const closeDesktopAuthWindowMock = vi.fn().mockResolvedValue({ ok: true });
const isElectronRuntimeMock = vi.fn(() => true);
const searchParamsState = { value: '' };

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(searchParamsState.value),
}));

vi.mock('@/lib/desktop/electron-bridge', () => ({
  closeDesktopAuthWindow: () => closeDesktopAuthWindowMock(),
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
    expect(
      screen.getByRole('button', { name: 'Continue in Browser' })
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
    expect(
      screen.queryByText('Continue signing in with your browser')
    ).not.toBeInTheDocument();

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

    expect(openDesktopAuthUrlMock).not.toHaveBeenCalled();
    fireEvent.click(continueButton);

    await waitFor(() => {
      expect(openDesktopAuthUrlMock).toHaveBeenCalledTimes(1);
    });
    expect(continueButton).toBeEnabled();
    expect(
      await screen.findByText(/The browser did not open/i)
    ).toBeInTheDocument();

    openDesktopAuthUrlMock.mockResolvedValueOnce({ ok: true });
    fireEvent.click(continueButton);

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
      expect(continueButton).toBeEnabled();
    });
    expect(screen.getByRole('status')).toHaveTextContent(
      /The browser did not open/i
    );

    openDesktopAuthUrlMock.mockResolvedValueOnce({ ok: true });
    fireEvent.click(continueButton);

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

  it('renders a single continue button for Electron auth routes', async () => {
    const { DesktopAuthRouteHandoff } = await import(
      '../../../app/(auth)/DesktopAuthRouteHandoff'
    );

    render(<DesktopAuthRouteHandoff />);

    expect(
      screen.getByTestId('desktop-auth-route-handoff')
    ).toBeInTheDocument();
    expect(openDesktopAuthUrlMock).not.toHaveBeenCalled();
    expect(screen.getAllByText('Continue in Browser')).toHaveLength(1);

    fireEvent.click(
      screen.getByRole('button', { name: 'Continue in Browser' })
    );

    await waitFor(() => {
      expect(openDesktopAuthUrlMock).toHaveBeenCalledTimes(1);
      expect(openDesktopAuthUrlMock).toHaveBeenCalledWith(window.location.href);
    });
    expect(await screen.findByText('Check your browser.')).toBeInTheDocument();
    expect(
      screen.queryByText('Continue signing in with your browser')
    ).not.toBeInTheDocument();
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
