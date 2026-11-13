import { TooltipProvider } from '@jovie/ui';
import { act, render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DesktopReleaseIdentity,
  DesktopTitlebar,
} from '@/components/organisms/DesktopTitlebar';
import { SidebarContext } from '@/components/organisms/sidebar/context';

const electronRuntimeMock = vi.hoisted(() => ({
  isElectronRuntime: true,
}));

vi.mock('@/lib/desktop/electron-bridge', async importOriginal => {
  const actual =
    await importOriginal<typeof import('@/lib/desktop/electron-bridge')>();
  return {
    ...actual,
    useIsElectronRuntime: () => electronRuntimeMock.isElectronRuntime,
    useDesktopNavigation: () => ({
      canGoBack: true,
      canGoForward: true,
      goBack: vi.fn(),
      goForward: vi.fn(),
    }),
  };
});

vi.mock('@/components/atoms/UpdateAvailablePill', () => ({
  UpdateAvailablePill: () => (
    <button type='button' data-testid='update-available-pill'>
      Update
    </button>
  ),
}));

function renderTitlebar(
  overrides: Partial<
    import('@/components/organisms/sidebar/context').SidebarContextValue
  > = {}
) {
  return render(
    <SidebarContext.Provider
      value={{
        state: 'open',
        open: true,
        isPreview: false,
        isFloating: false,
        setOpen: vi.fn(),
        openMobile: false,
        setOpenMobile: vi.fn(),
        isMobile: false,
        toggleSidebar: vi.fn(),
        ...overrides,
      }}
    >
      <TooltipProvider>
        <DesktopTitlebar />
        <DesktopReleaseIdentity />
      </TooltipProvider>
    </SidebarContext.Provider>
  );
}

beforeEach(() => {
  electronRuntimeMock.isElectronRuntime = true;
  Reflect.deleteProperty(window, 'electronAPI');
  document.documentElement.removeAttribute('data-electron-fullscreen');
  document.documentElement.removeAttribute('data-electron-fullscreen-managed');
});
describe('DesktopTitlebar native fullscreen', () => {
  it('preserves preload-owned fullscreen through the pre-hydration runtime state', () => {
    electronRuntimeMock.isElectronRuntime = false;
    document.documentElement.dataset.electronFullscreenManaged = 'preload';
    document.documentElement.dataset.electronFullscreen = 'true';
    const getFullScreenState = vi.fn().mockResolvedValue(false);
    const onFullScreenChanged = vi.fn();
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: { getFullScreenState, onFullScreenChanged },
    });

    renderTitlebar();

    expect(document.documentElement.dataset.electronFullscreen).toBe('true');
    expect(getFullScreenState).not.toHaveBeenCalled();
    expect(onFullScreenChanged).not.toHaveBeenCalled();
  });

  it('mirrors native full-screen transitions onto the document root', async () => {
    const fullScreenCallbacks: Array<(isFullScreen: boolean) => void> = [];
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: {
        getFullScreenState: vi.fn().mockResolvedValue(true),
        onFullScreenChanged: (callback: (isFullScreen: boolean) => void) => {
          fullScreenCallbacks.push(callback);
          return () => undefined;
        },
      },
    });

    renderTitlebar();

    // The initial native snapshot collapses the traffic-light reserve.
    await waitFor(() => {
      expect(document.documentElement.dataset.electronFullscreen).toBe('true');
    });

    // A live leave-full-screen transition restores the reserve.
    await act(async () => {
      fullScreenCallbacks.at(-1)?.(false);
    });
    expect(document.documentElement.dataset.electronFullscreen).toBe('false');
  });

  it('keeps the reserve untouched when the bridge predates full-screen events', () => {
    // No electronAPI: the observer unsubscribes immediately and the flag
    // never lands on the document root.
    renderTitlebar();

    expect(document.documentElement.dataset.electronFullscreen).toBeUndefined();
  });

  it('clears the full-screen flag when the titlebar leaves the desktop runtime', async () => {
    const fullScreenCallbacks: Array<(isFullScreen: boolean) => void> = [];
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: {
        getFullScreenState: vi.fn().mockResolvedValue(true),
        onFullScreenChanged: (callback: (isFullScreen: boolean) => void) => {
          fullScreenCallbacks.push(callback);
          return () => undefined;
        },
      },
    });

    const view = renderTitlebar();
    await waitFor(() => {
      expect(document.documentElement.dataset.electronFullscreen).toBe('true');
    });

    // Flipping out of the Electron runtime clears the stale flag so the
    // browser shell never inherits a collapsed reserve.
    electronRuntimeMock.isElectronRuntime = false;
    view.rerender(
      <SidebarContext.Provider
        value={{
          state: 'open',
          open: true,
          isPreview: false,
          isFloating: false,
          setOpen: vi.fn(),
          openMobile: false,
          setOpenMobile: vi.fn(),
          isMobile: false,
          toggleSidebar: vi.fn(),
        }}
      >
        <TooltipProvider>
          <DesktopTitlebar />
          <DesktopReleaseIdentity />
        </TooltipProvider>
      </SidebarContext.Provider>
    );

    expect(document.documentElement.dataset.electronFullscreen).toBeUndefined();
  });
});
