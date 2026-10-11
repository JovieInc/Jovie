import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import type { Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DesktopPageTabsState } from '@/lib/desktop/electron-bridge';

let root: Root | undefined;
beforeEach(() => {
  vi.resetModules();
  const mount = document.createElement('div');
  mount.id = 'page-tabs';
  document.body.append(mount);
});
afterEach(() => {
  act(() => root?.unmount());
  root = undefined;
  document.getElementById('page-tabs')?.remove();
  Reflect.deleteProperty(globalThis, 'electronAPI');
  document.documentElement.classList.remove('dark', 'ov-mode');
});
const state = {
  activeId: 1,
  tabs: [{ id: 1, title: 'Library', loading: false }],
};

describe('bundled native page strip', () => {
  it('prefers live page/theme events over slow initial reads and releases subscriptions', async () => {
    let pages: (value: DesktopPageTabsState) => void = () => undefined;
    let appearance: (value: { dark: boolean; ov: boolean }) => void = () =>
      undefined;
    let initialPages: (value: DesktopPageTabsState) => void = () => undefined;
    let initialAppearance: (value: { dark: boolean; ov: boolean }) => void =
      () => undefined;
    const stopPages = vi.fn();
    const stopAppearance = vi.fn();
    const command = vi.fn(async () => true);
    Object.defineProperty(globalThis, 'electronAPI', {
      configurable: true,
      value: {
        getPageTabs: () =>
          new Promise(resolve => {
            initialPages = resolve;
          }),
        getPageTabsAppearance: () =>
          new Promise(resolve => {
            initialAppearance = resolve;
          }),
        onPageTabsChanged: (callback: typeof pages) => {
          pages = callback;
          return stopPages;
        },
        onPageTabsAppearance: (callback: typeof appearance) => {
          appearance = callback;
          return stopAppearance;
        },
        pageTabsCommand: command,
      },
    });
    await act(async () => {
      root = (await import('./PageTabsChrome')).pageTabsRoot;
    });
    act(() => {
      pages(state);
      appearance({ dark: true, ov: true });
    });
    await act(async () => {
      initialPages({
        activeId: 2,
        tabs: [{ id: 2, title: 'Stale', loading: false }],
      });
      initialAppearance({ dark: false, ov: false });
    });
    expect(screen.getByRole('tab', { name: 'Library' })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Stale' })).toBeNull();
    expect(document.documentElement).toHaveClass('dark', 'ov-mode');
    fireEvent.click(screen.getByRole('button', { name: 'New Tab' }));
    expect(command).toHaveBeenCalledWith({ type: 'create' });
    act(() => root?.unmount());
    root = undefined;
    expect(stopPages).toHaveBeenCalledOnce();
    expect(stopAppearance).toHaveBeenCalledOnce();
    act(() => {
      pages(state);
      appearance({ dark: false, ov: false });
    });
    expect(document.documentElement).toHaveClass('dark', 'ov-mode');
  });
  it('accepts initial appearance and retains controls when a native command rejects', async () => {
    Object.defineProperty(globalThis, 'electronAPI', {
      configurable: true,
      value: {
        getPageTabs: async () => state,
        getPageTabsAppearance: async () => ({ dark: false, ov: false }),
        onPageTabsChanged: () => () => undefined,
        onPageTabsAppearance: () => () => undefined,
        pageTabsCommand: vi
          .fn()
          .mockRejectedValue(new Error('native unavailable')),
      },
    });
    await act(async () => {
      root = (await import('./PageTabsChrome')).pageTabsRoot;
    });
    expect(screen.getByRole('tab', { name: 'Library' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'New Tab' }));
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Try again')
    );
    expect(screen.getByRole('tab', { name: 'Library' })).toBeInTheDocument();
  });
});
