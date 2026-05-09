import { act, cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  type ElectronAPI,
  isElectronRuntime,
  useDesktopUpdate,
} from '@/lib/desktop/electron-bridge';

function resetElectronRuntime() {
  document.documentElement.removeAttribute('data-desktop-runtime');
  document.documentElement.removeAttribute('data-electron-platform');
  delete (window as Window & { electronAPI?: ElectronAPI }).electronAPI;
}

function setElectronAPI(api: ElectronAPI) {
  Object.defineProperty(window, 'electronAPI', {
    configurable: true,
    value: api,
  });
}

afterEach(() => {
  cleanup();
  resetElectronRuntime();
  vi.resetModules();
  vi.restoreAllMocks();
});

describe('Electron runtime bridge', () => {
  it('detects Electron from the preload API or early html data attribute', () => {
    expect(isElectronRuntime()).toBe(false);

    document.documentElement.dataset.desktopRuntime = 'electron';
    expect(isElectronRuntime()).toBe(true);

    document.documentElement.removeAttribute('data-desktop-runtime');
    setElectronAPI({
      platform: 'darwin',
      electronVersion: '42.0.0',
      onUpdateAvailable: () => () => undefined,
      onUpdateDownloaded: () => () => undefined,
      installUpdateAndRestart: async () => ({ ok: false }),
    });

    expect(isElectronRuntime()).toBe(true);
  });

  it('subscribes to update events, installs updates, and unsubscribes cleanly', async () => {
    let availableCallback: (() => void) | undefined;
    let downloadedCallback: (() => void) | undefined;
    const unsubscribeAvailable = vi.fn();
    const unsubscribeDownloaded = vi.fn();
    const installUpdateAndRestart = vi.fn(async () => ({ ok: true }));

    setElectronAPI({
      platform: 'darwin',
      electronVersion: '42.0.0',
      onUpdateAvailable: cb => {
        availableCallback = cb;
        return unsubscribeAvailable;
      },
      onUpdateDownloaded: cb => {
        downloadedCallback = cb;
        return unsubscribeDownloaded;
      },
      installUpdateAndRestart,
    });

    function Probe(): ReactNode {
      const update = useDesktopUpdate();

      return (
        <button type='button' onClick={() => void update.install()}>
          {update.available ? 'available' : 'idle'}:
          {update.downloaded ? 'downloaded' : 'pending'}
        </button>
      );
    }

    const { unmount } = render(<Probe />);

    expect(screen.getByRole('button')).toHaveTextContent('idle:pending');

    act(() => {
      availableCallback?.();
      downloadedCallback?.();
    });

    expect(screen.getByRole('button')).toHaveTextContent(
      'available:downloaded'
    );

    await act(async () => {
      screen.getByRole('button').click();
    });

    expect(installUpdateAndRestart).toHaveBeenCalledTimes(1);

    unmount();

    expect(unsubscribeAvailable).toHaveBeenCalledTimes(1);
    expect(unsubscribeDownloaded).toHaveBeenCalledTimes(1);
  });
});

describe('PWA install prompt in Electron', () => {
  it('suppresses service worker registration and install prompts', async () => {
    const registerServiceWorker = vi.fn();
    const unregisterServiceWorker = vi.fn(async () => undefined);

    document.documentElement.dataset.desktopRuntime = 'electron';

    vi.doMock('@/lib/service-worker/control', () => ({
      isSwEnabled: () => true,
      registerServiceWorker,
      unregisterServiceWorker,
    }));

    const { usePWAInstall } = await import('@/hooks/usePWAInstall');

    function Probe(): ReactNode {
      const install = usePWAInstall();
      return (
        <output>
          {install.canPrompt ? 'prompt' : 'hidden'}:
          {install.isInstalled ? 'installed' : 'not-installed'}:
          {install.isIOS ? 'ios' : 'not-ios'}
        </output>
      );
    }

    render(<Probe />);

    expect(screen.getByText('hidden:not-installed:not-ios')).toBeVisible();
    expect(registerServiceWorker).not.toHaveBeenCalled();
    expect(unregisterServiceWorker).not.toHaveBeenCalled();
  });
});
