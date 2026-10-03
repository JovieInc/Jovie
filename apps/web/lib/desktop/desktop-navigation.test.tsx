/** @vitest-environment jsdom */
import { act, cleanup, render } from '@testing-library/react';
import { useLayoutEffect } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DesktopNavigationBridge,
  isDesktopClientRoute,
} from './desktop-navigation';

const { push, info, dismiss, listeners, work, router, route } = vi.hoisted(
  () => {
    const push = vi.fn();
    return {
      push,
      router: { push },
      info: vi.fn(),
      dismiss: vi.fn(),
      route: { pathname: '/app/chat' },
      listeners: new Set<() => void>(),
      work: {
        current: null as null | {
          hasDraft: boolean;
          isStreaming: boolean;
          isUploading: boolean;
          hasPendingAction: boolean;
          isAuthenticating: boolean;
        },
      },
    };
  }
);
vi.mock('next/navigation', () => ({
  useRouter: () => router,
  usePathname: () => route.pathname,
}));
vi.mock('@/lib/error-tracking', () => ({ captureWarning: vi.fn() }));
vi.mock('@/components/feedback', () => ({
  toast: { info, dismiss },
  TOAST_DURATIONS: { PERSISTENT: Infinity },
}));
vi.mock('./session-work-state', () => ({
  getDesktopWorkState: () => work.current,
  subscribeDesktopWorkState: (listener: () => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
}));

const idle = {
  hasDraft: false,
  isStreaming: false,
  isUploading: false,
  hasPendingAction: false,
  isAuthenticating: false,
};
function setWork(state: typeof work.current) {
  act(() => {
    work.current = state;
    for (const listener of listeners) listener();
  });
}

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(globalThis, 'electronAPI');
  push.mockClear();
  info.mockClear();
  dismiss.mockClear();
  work.current = null;
  route.pathname = '/app/chat';
  globalThis.history.replaceState(null, '', '/app/chat');
});

describe('DesktopNavigationBridge', () => {
  it('uses the client router and releases the native listener on unmount', () => {
    let navigate: (path: string) => void = () => undefined;
    const unsubscribe = vi.fn();
    const onNavigate = vi.fn((listener: typeof navigate) => {
      navigate = listener;
      return unsubscribe;
    });
    Object.defineProperty(globalThis, 'electronAPI', {
      configurable: true,
      value: { onNavigate },
    });
    const { unmount } = render(<DesktopNavigationBridge />);
    act(() => navigate('/app/settings'));
    act(() => navigate('/app/chat?id=123#message'));
    expect(push.mock.calls).toEqual([
      ['/app/settings'],
      ['/app/chat?id=123#message'],
    ]);
    expect(onNavigate).toHaveBeenCalledTimes(1);
    unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('renders safely in browsers and older binaries', () => {
    render(<DesktopNavigationBridge />);
    Object.defineProperty(globalThis, 'electronAPI', {
      configurable: true,
      value: { onNavigate: true },
    });
    render(<DesktopNavigationBridge />);
    expect(push).not.toHaveBeenCalled();
  });

  it('rejects commands outside the application router, including encoded auth', () => {
    for (const route of [
      undefined,
      '',
      '//evil.example/app',
      'https://evil.example/app',
      'javascript:alert(1)',
      '/application',
      '/app/auth/callback',
      '/app/%61uth/callback',
      '/app/../signin',
      '/app/%2f%2fevil',
      '/app/%5cevil',
      '/app/%00',
      '/app/%zz',
      '/hud',
    ]) {
      expect(isDesktopClientRoute(route), String(route)).toBe(false);
    }
    expect(isDesktopClientRoute('/app')).toBe(true);
    expect(isDesktopClientRoute('/app/chat?draft=hello%20world')).toBe(true);
  });

  it.each([
    'isStreaming',
    'isUploading',
    'hasPendingAction',
    'isAuthenticating',
  ] as const)('waits for %s to finish before navigating', flag => {
    let navigate: (path: string) => void = () => undefined;
    Object.defineProperty(globalThis, 'electronAPI', {
      configurable: true,
      value: {
        onNavigate: (callback: typeof navigate) => {
          navigate = callback;
          return () => undefined;
        },
      },
    });
    setWork({ ...idle, [flag]: true });
    render(<DesktopNavigationBridge />);
    act(() => navigate('/app/settings'));
    expect(push).not.toHaveBeenCalled();
    expect(info).toHaveBeenCalledOnce();
    setWork(null); // Lost ownership never finishes a deferred command.
    expect(push).not.toHaveBeenCalled();
    setWork({ ...idle, hasDraft: true });
    expect(push).toHaveBeenCalledExactlyOnceWith('/app/settings');
  });

  it('lets the user cancel deferred navigation', () => {
    let navigate: (path: string) => void = () => undefined;
    Object.defineProperty(globalThis, 'electronAPI', {
      configurable: true,
      value: {
        onNavigate: (callback: typeof navigate) => {
          navigate = callback;
          return () => undefined;
        },
      },
    });
    setWork({ ...idle, isStreaming: true });
    render(<DesktopNavigationBridge />);
    act(() => navigate('/app/settings'));
    act(() => info.mock.calls[0][1].action.onClick());
    setWork(idle);
    expect(push).not.toHaveBeenCalled();
  });

  it('rechecks work started during layout before draining an idle render', () => {
    let navigate: (path: string) => void = () => undefined;
    Object.defineProperty(globalThis, 'electronAPI', {
      configurable: true,
      value: {
        onNavigate: (callback: typeof navigate) => {
          navigate = callback;
          return () => undefined;
        },
      },
    });
    function StartingWork({ start }: { start: boolean }) {
      useLayoutEffect(() => {
        if (!start) return;
        work.current = { ...idle, isUploading: true };
        for (const listener of listeners) listener();
      }, [start]);
      return null;
    }
    setWork({ ...idle, isStreaming: true });
    const view = render(
      <>
        <DesktopNavigationBridge />
        <StartingWork start={false} />
      </>
    );
    act(() => navigate('/app/settings'));
    act(() => {
      work.current = idle;
      view.rerender(
        <>
          <DesktopNavigationBridge />
          <StartingWork start />
        </>
      );
    });
    expect(push).not.toHaveBeenCalled();
    setWork(idle);
    expect(push).toHaveBeenCalledExactlyOnceWith('/app/settings');
  });

  it('discards a deferred command when a direct route change supersedes it', () => {
    let navigate: (path: string) => void = () => undefined;
    Object.defineProperty(globalThis, 'electronAPI', {
      configurable: true,
      value: {
        onNavigate: (callback: typeof navigate) => {
          navigate = callback;
          return () => undefined;
        },
      },
    });
    setWork({ ...idle, isStreaming: true });
    const view = render(<DesktopNavigationBridge />);
    act(() => navigate('/app/settings'));
    route.pathname = '/app/chats';
    view.rerender(<DesktopNavigationBridge />);
    setWork(idle);
    expect(push).not.toHaveBeenCalled();
  });

  it.each(['/app/chats', '/app/chat?id=other', '/app/chat#other'])(
    'does not drain a stale command when %s and idle arrive together',
    nextRoute => {
      let navigate: (path: string) => void = () => undefined;
      Object.defineProperty(globalThis, 'electronAPI', {
        configurable: true,
        value: {
          onNavigate: (callback: typeof navigate) => {
            navigate = callback;
            return () => undefined;
          },
        },
      });
      setWork({ ...idle, isStreaming: true });
      const view = render(<DesktopNavigationBridge />);
      act(() => navigate('/app/settings'));
      act(() => {
        globalThis.history.replaceState(null, '', nextRoute);
        route.pathname = globalThis.location.pathname;
        work.current = idle;
        for (const listener of listeners) listener();
        view.rerender(<DesktopNavigationBridge />);
      });
      expect(push).not.toHaveBeenCalled();
    }
  );
});
