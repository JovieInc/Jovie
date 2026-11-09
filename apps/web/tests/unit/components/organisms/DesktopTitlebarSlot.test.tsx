import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const electronRuntimeMock = vi.hoisted(() => ({ isElectronRuntime: false }));

vi.mock('@/lib/desktop/electron-runtime', async importOriginal => {
  const actual =
    await importOriginal<typeof import('@/lib/desktop/electron-runtime')>();
  return {
    ...actual,
    useIsElectronRuntime: () => electronRuntimeMock.isElectronRuntime,
  };
});

vi.mock('@/lib/desktop/electron-bridge', async importOriginal => {
  const actual =
    await importOriginal<typeof import('@/lib/desktop/electron-bridge')>();
  return {
    ...actual,
    useDesktopNavigation: () => ({
      canGoBack: true,
      canGoForward: true,
      goBack: vi.fn(),
      goForward: vi.fn(),
    }),
  };
});

const { DesktopTitlebarSlot } = await import(
  '@/components/organisms/DesktopTitlebarSlot'
);

describe('DesktopTitlebarSlot', () => {
  beforeEach(() => {
    electronRuntimeMock.isElectronRuntime = false;
    Reflect.deleteProperty(window, 'electronAPI');
  });

  it('renders nothing in the browser and never loads the desktop subtree', () => {
    const { container } = render(<DesktopTitlebarSlot />);
    expect(container).toBeEmptyDOMElement();
    expect(
      document.querySelector('[data-testid="electron-titlebar-row"]')
    ).toBeNull();
  });

  it('lazy-loads the titlebar once the electron runtime is detected', async () => {
    electronRuntimeMock.isElectronRuntime = true;
    window.electronAPI = {
      platform: 'darwin',
      electronVersion: '33.0.0',
      onUpdateAvailable: vi.fn(),
      onUpdateDownloaded: vi.fn(),
      installUpdateAndRestart: vi.fn(),
      goBack: vi.fn(),
      goForward: vi.fn(),
      onNavStateChanged: vi.fn(),
    } as unknown as Window['electronAPI'];
    render(<DesktopTitlebarSlot />);
    await waitFor(() => {
      expect(
        document.querySelector('[data-testid="electron-titlebar-row"]')
      ).not.toBeNull();
    });
  });
});
