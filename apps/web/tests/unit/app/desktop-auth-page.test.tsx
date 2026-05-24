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
}));

describe('DesktopAuthPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    searchParamsState.value =
      'auth_url=%2Fauth%2Fstart%3Fclient%3Delectron%26intent%3Dsign_in%26return_to%3D%252Fapp%252Fsettings%26code_challenge%3DabcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ%26code_challenge_method%3DS256';
  });

  it('auto-opens the browser auth URL and keeps retry/cancel actions available', async () => {
    const { default: DesktopAuthPage } = await import(
      '../../../app/desktop-auth/page'
    );

    render(<DesktopAuthPage />);

    const expectedAuthUrl = new URL(
      '/auth/start?client=electron&intent=sign_in&return_to=%2Fapp%2Fsettings&code_challenge=abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ&code_challenge_method=S256',
      window.location.origin
    ).toString();

    await waitFor(() => {
      expect(openDesktopAuthUrlMock).toHaveBeenCalledTimes(1);
      expect(openDesktopAuthUrlMock).toHaveBeenCalledWith(expectedAuthUrl);
    });
    expect(
      await screen.findByText('Continue sign-in in your browser.')
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: 'Continue in browser' })
    );

    await waitFor(() => {
      expect(openDesktopAuthUrlMock).toHaveBeenCalledTimes(2);
    });

    fireEvent.click(screen.getByRole('button', { name: 'Cancel sign-in' }));

    expect(closeDesktopAuthWindowMock).toHaveBeenCalledTimes(1);
  });

  it('keeps continue retryable and shows a stable failure message when browser launch fails', async () => {
    openDesktopAuthUrlMock.mockResolvedValueOnce({
      ok: false,
      reason: 'open-external-failed',
    });
    const { default: DesktopAuthPage } = await import(
      '../../../app/desktop-auth/page'
    );

    render(<DesktopAuthPage />);

    const continueButton = screen.getByRole('button', {
      name: 'Continue in browser',
    });

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
    expect(
      await screen.findByText('Continue sign-in in your browser.')
    ).toBeInTheDocument();
  });

  it('disables continue only while a browser launch is pending', async () => {
    let resolveOpen: (value: { ok: false; reason: string }) => void = () => {};
    openDesktopAuthUrlMock.mockReturnValueOnce(
      new Promise<{ ok: false; reason: string }>(resolve => {
        resolveOpen = resolve;
      })
    );
    const { default: DesktopAuthPage } = await import(
      '../../../app/desktop-auth/page'
    );

    render(<DesktopAuthPage />);

    const continueButton = screen.getByRole('button', {
      name: 'Continue in browser',
    });

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
