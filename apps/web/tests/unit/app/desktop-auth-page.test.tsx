import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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
      'auth_url=%2Fsignin%3Fdesktop_return%3D%252Fapp%252Fsettings';
  });

  it('auto-opens the browser auth URL and keeps retry/cancel actions available', async () => {
    const { default: DesktopAuthPage } = await import(
      '../../../app/desktop-auth/page'
    );

    render(<DesktopAuthPage />);

    const expectedAuthUrl = new URL(
      '/signin?desktop_return=%2Fapp%2Fsettings',
      window.location.origin
    ).toString();

    await waitFor(() => {
      expect(openDesktopAuthUrlMock).toHaveBeenCalledTimes(1);
      expect(openDesktopAuthUrlMock).toHaveBeenCalledWith(expectedAuthUrl);
    });

    fireEvent.click(screen.getByRole('button', { name: 'Open browser again' }));

    await waitFor(() => {
      expect(openDesktopAuthUrlMock).toHaveBeenCalledTimes(2);
    });

    fireEvent.click(screen.getByRole('button', { name: 'Cancel sign-in' }));

    expect(closeDesktopAuthWindowMock).toHaveBeenCalledTimes(1);
  });
});
