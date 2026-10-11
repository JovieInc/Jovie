import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DesktopPageTabs } from './DesktopPageTabs';

const bridge = vi.hoisted(() => ({
  api: null as null | { setPageTabsBounds: ReturnType<typeof vi.fn> },
}));
vi.mock('@/lib/desktop/electron-bridge', () => ({
  getRawElectronAPI: () => bridge.api,
  useDesktopPageTabs: () => ({
    state: { activeId: 1, tabs: [{ id: 1, title: 'Library', loading: false }] },
    command: vi.fn(),
  }),
}));
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.documentElement.classList.remove('dark');
});

describe('native tab strip boundary', () => {
  it('reports the canonical main-column rectangle and theme, then releases observers', () => {
    const callbacks: (() => void)[] = [];
    const disconnect = vi.fn();
    const observe = vi.fn();
    class Observer {
      constructor(callback: () => void) {
        callbacks.push(callback);
      }
      disconnect = disconnect;
      observe = observe;
    }
    vi.stubGlobal('ResizeObserver', Observer);
    vi.stubGlobal('MutationObserver', Observer);
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      x: 252,
      y: 8,
      width: 940,
      height: 32,
    } as DOMRect);
    bridge.api = { setPageTabsBounds: vi.fn() };
    const { unmount } = render(<DesktopPageTabs />);
    expect(screen.queryByRole('tab')).toBeNull();
    expect(bridge.api.setPageTabsBounds).toHaveBeenLastCalledWith({
      x: 252,
      y: 8,
      width: 940,
      height: 32,
      dark: false,
      ov: false,
    });
    act(() => {
      document.documentElement.classList.add('dark');
      callbacks[1]();
    });
    expect(bridge.api.setPageTabsBounds).toHaveBeenLastCalledWith(
      expect.objectContaining({ dark: true })
    );
    unmount();
    expect(disconnect).toHaveBeenCalledTimes(2);
  });

  it('does not introduce a native observer or command on an older binary', () => {
    bridge.api = null;
    const { container } = render(<DesktopPageTabs />);
    expect(
      container.querySelector('[data-electron-tabs-mount]')
    ).not.toBeNull();
  });

  it('inherits Ovie appearance from the existing rail owner', () => {
    const observers: {
      callback: () => void;
      observe: ReturnType<typeof vi.fn>;
    }[] = [];
    class Observer {
      observe = vi.fn();
      disconnect = vi.fn();
      constructor(callback: () => void) {
        observers.push({ callback, observe: this.observe });
      }
    }
    vi.stubGlobal('ResizeObserver', Observer);
    vi.stubGlobal('MutationObserver', Observer);
    bridge.api = { setPageTabsBounds: vi.fn() };
    render(
      <div data-app-shell-frame>
        <div id='shell-left-rail' className='ov-mode' />
        <DesktopPageTabs />
      </div>
    );
    expect(bridge.api.setPageTabsBounds).toHaveBeenLastCalledWith(
      expect.objectContaining({ ov: true })
    );
    expect(observers[1].observe).toHaveBeenCalledWith(
      document.getElementById('shell-left-rail'),
      { attributes: true, attributeFilter: ['class'] }
    );
    act(() => {
      document.getElementById('shell-left-rail')!.classList.remove('ov-mode');
      observers[1].callback();
    });
    expect(bridge.api.setPageTabsBounds).toHaveBeenLastCalledWith(
      expect.objectContaining({ ov: false })
    );
  });
});
