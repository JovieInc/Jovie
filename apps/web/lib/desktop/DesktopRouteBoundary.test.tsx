import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import Link from 'next/link';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { route, replace, error, api } = vi.hoisted(() => ({
  route: { path: '/app/chat' },
  replace: vi.fn(),
  error: vi.fn(),
  api: {
    current: {
      navigationBoundaryVersion: 1,
      windowRole: 'main',
      routeNavigation: vi.fn().mockResolvedValue({ ok: true }),
      onNavigationError: vi.fn(),
    },
  },
}));
vi.mock('next/navigation', () => ({
  usePathname: () => route.path,
  useRouter: () => ({ replace }),
}));
vi.mock('@/components/feedback/toast', () => ({ toast: { error } }));
vi.mock('./electron-bridge', () => ({
  getElectronAPI: () => api.current,
  recoverApplicationDocument: replace,
  useIsElectronRuntime: () =>
    document.documentElement.dataset.desktopRuntime === 'electron',
}));

import {
  DesktopRouteBoundary,
  isSupportedDesktopPath,
} from './DesktopRouteBoundary';

beforeEach(() => {
  vi.clearAllMocks();
  route.path = '/app/chat';
  api.current.navigationBoundaryVersion = 1;
  api.current.windowRole = 'main';
  api.current.routeNavigation.mockResolvedValue({ ok: true });
  document.documentElement.dataset.desktopRuntime = 'electron';
});
afterEach(() => {
  cleanup();
  globalThis.history.replaceState({}, '', '/');
  document.documentElement.removeAttribute('data-desktop-runtime');
});
describe('desktop hosted route recovery', () => {
  it.each([
    '/blog',
    '/download',
    '/changelog',
    '/install',
    '/pwa',
    '/developers',
    '/pricing',
  ])(
    'recovers public route %s in an older shell without a boundary version',
    path => {
      Reflect.deleteProperty(api.current, 'navigationBoundaryVersion');
      route.path = path;
      globalThis.history.replaceState({}, '', path);
      const open = vi.spyOn(globalThis, 'open').mockImplementation(() => null);
      render(
        <DesktopRouteBoundary>
          <div>public skeleton</div>
        </DesktopRouteBoundary>
      );
      expect(screen.queryByText('public skeleton')).toBeNull();
      expect(replace).toHaveBeenCalledWith('/app/chat');
      expect(open).toHaveBeenCalledWith(
        location.href,
        '_blank',
        'noopener,noreferrer'
      );
      open.mockRestore();
    }
  );

  it.each([
    '/blog',
    '/changelog',
    '/install',
    '/pwa',
    '/developers',
    '/pricing',
    '/api/private',
    '/app%2fchat',
    '/app/%00',
  ])('never renders unsupported route %s or its skeleton', async path => {
    route.path = path;
    render(
      <DesktopRouteBoundary>
        <div>public skeleton</div>
      </DesktopRouteBoundary>
    );
    expect(screen.queryByText('public skeleton')).toBeNull();
    expect(
      await screen.findByRole('button', { name: 'Return to app' })
    ).toBeVisible();
    expect(replace).toHaveBeenCalledWith('/app/chat');
  });
  it('does not turn an older main shell into a preview after a profile history escape', () => {
    Reflect.deleteProperty(api.current, 'navigationBoundaryVersion');
    globalThis.history.replaceState({}, '', '/app/chat?thread=1#latest');
    const open = vi.spyOn(globalThis, 'open').mockImplementation(() => null);
    const { rerender } = render(
      <DesktopRouteBoundary>
        <div>product</div>
      </DesktopRouteBoundary>
    );
    route.path = '/timwhite';
    globalThis.history.replaceState({}, '', '/timwhite');
    rerender(
      <DesktopRouteBoundary>
        <div>profile escape</div>
      </DesktopRouteBoundary>
    );
    expect(screen.queryByText('profile escape')).toBeNull();
    expect(replace).toHaveBeenCalledWith('/app/chat?thread=1#latest');
    open.mockRestore();
  });

  it('keeps an older shell launched at the supported start route inside the boundary', () => {
    Reflect.deleteProperty(api.current, 'navigationBoundaryVersion');
    route.path = '/start';
    globalThis.history.replaceState({}, '', '/start');
    const open = vi.spyOn(globalThis, 'open').mockImplementation(() => null);
    const { rerender } = render(
      <DesktopRouteBoundary>
        <div>start</div>
      </DesktopRouteBoundary>
    );
    route.path = '/app/chat';
    globalThis.history.replaceState({}, '', '/app/chat');
    rerender(
      <DesktopRouteBoundary>
        <div>product</div>
      </DesktopRouteBoundary>
    );
    route.path = '/blog';
    globalThis.history.replaceState({}, '', '/blog');
    rerender(
      <DesktopRouteBoundary>
        <div>public escape</div>
      </DesktopRouteBoundary>
    );
    expect(screen.queryByText('public escape')).toBeNull();
    expect(replace).toHaveBeenCalledWith('/app/chat');
    open.mockRestore();
  });

  it('preserves an older isolated preview identified at the initial document route', () => {
    Reflect.deleteProperty(api.current, 'navigationBoundaryVersion');
    route.path = '/timwhite';
    render(
      <DesktopRouteBoundary>
        <div>Profile preview</div>
      </DesktopRouteBoundary>
    );
    expect(screen.getByText('Profile preview')).toBeVisible();
    expect(replace).not.toHaveBeenCalled();
  });
  it.each([
    '/app/chat',
    '/hud',
    '/signin',
    '/start',
    '/auth/native-complete',
    '/app/auth/callback',
  ])('preserves supported/auth route %s', path => {
    expect(isSupportedDesktopPath(path)).toBe(true);
    route.path = path;
    render(
      <DesktopRouteBoundary>
        <div>product or auth</div>
      </DesktopRouteBoundary>
    );
    expect(screen.getByText('product or auth')).toBeVisible();
    expect(replace).not.toHaveBeenCalled();
  });
  it.each(['click', 'auxclick'] as const)(
    'hands off external %s before a Next link changes the product route',
    event => {
      const { container } = render(
        <DesktopRouteBoundary>
          <Link href='/blog'>
            <span>Read</span>
          </Link>
        </DesktopRouteBoundary>
      );
      const link = container.querySelector('span')!;
      fireEvent(
        link,
        new MouseEvent(event, {
          bubbles: true,
          cancelable: true,
          button: event === 'auxclick' ? 1 : 0,
        })
      );
      expect(api.current.routeNavigation).toHaveBeenCalledExactlyOnceWith(
        new URL('/blog', location.href).href
      );
      expect(replace).not.toHaveBeenCalled();
    }
  );
  it('does not open a browser tab for right-button context menu activation', () => {
    render(
      <DesktopRouteBoundary>
        <Link href='/blog'>Read</Link>
      </DesktopRouteBoundary>
    );
    fireEvent(
      screen.getByRole('link'),
      new MouseEvent('auxclick', { bubbles: true, button: 2 })
    );
    expect(api.current.routeNavigation).not.toHaveBeenCalled();
  });

  it('preserves the dedicated auth window browser handoff without widening main-frame IPC trust', () => {
    api.current.windowRole = 'auth';
    route.path = '/desktop-auth';
    const open = vi.spyOn(globalThis, 'open').mockImplementation(() => null);
    render(
      <DesktopRouteBoundary>
        <Link href='/legal/privacy'>Privacy</Link>
      </DesktopRouteBoundary>
    );
    fireEvent.click(screen.getByRole('link'));
    expect(open).toHaveBeenCalledWith(
      new URL('/legal/privacy', location.href).href,
      '_blank',
      'noopener,noreferrer'
    );
    expect(api.current.routeNavigation).not.toHaveBeenCalled();
    open.mockRestore();
  });

  it('offers explicit retry on native browser-open failure', async () => {
    api.current.routeNavigation.mockResolvedValue({ ok: false });
    render(
      <DesktopRouteBoundary>
        <Link href='/blog'>Read</Link>
      </DesktopRouteBoundary>
    );
    fireEvent.click(screen.getByRole('link'));
    await vi.waitFor(() => expect(error).toHaveBeenCalled());
    expect(error.mock.calls[0][1].action.label).toBe('Try again');
    api.current.routeNavigation.mockResolvedValue({ ok: true });
    error.mock.calls[0][1].action.onClick();
    await vi.waitFor(() =>
      expect(api.current.routeNavigation).toHaveBeenCalledTimes(2)
    );
  });
  it('preserves separate profile-preview windows and ordinary web rendering', () => {
    route.path = '/timwhite';
    api.current.windowRole = 'profile-preview';
    const { rerender } = render(
      <DesktopRouteBoundary>
        <div>Profile</div>
      </DesktopRouteBoundary>
    );
    expect(screen.getByText('Profile')).toBeVisible();
    expect(replace).not.toHaveBeenCalled();
    api.current.windowRole = 'main';
    document.documentElement.removeAttribute('data-desktop-runtime');
    route.path = '/blog';
    rerender(
      <DesktopRouteBoundary>
        <div>Web blog</div>
      </DesktopRouteBoundary>
    );
    expect(screen.getByText('Web blog')).toBeVisible();
  });
});
