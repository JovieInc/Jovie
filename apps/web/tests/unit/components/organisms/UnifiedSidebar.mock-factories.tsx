import {
  type ComponentPropsWithoutRef,
  forwardRef,
  type ReactNode,
} from 'react';
import { vi } from 'vitest';

// Shared state and mock factories for the UnifiedSidebar test files. Each test
// file keeps its own vi.mock lines (they hoist per file) and points them here.

export const unifiedPathnameMock = vi.fn(() => '/app');
export const electronRuntimeMock = { isElectronRuntime: true };
export const signOutMock = vi.fn();
export const userButtonPropsMock = vi.fn();
export const nowPlayingBridgePropsMock = vi.fn();

// Expose the Next Link contract without starting a router in jsdom.
export function nextLinkMock() {
  return {
    default: forwardRef<
      HTMLAnchorElement,
      ComponentPropsWithoutRef<'a'> & { readonly prefetch?: boolean }
    >(function TestLink({ prefetch, ...props }, ref) {
      return <a {...props} data-prefetch={String(prefetch)} ref={ref} />;
    }),
  };
}

export function nextNavigationMock() {
  return {
    usePathname: () => unifiedPathnameMock(),
    useParams: () => ({}),
    useRouter: () => ({
      push: vi.fn(),
      replace: vi.fn(),
      back: vi.fn(),
    }),
  };
}

export function electronBridgeMock(
  original: typeof import('@/lib/desktop/electron-bridge')
) {
  return {
    ...original,
    isElectronRuntime: () =>
      document.documentElement.dataset.desktopRuntime === 'electron' ||
      electronRuntimeMock.isElectronRuntime,
    useIsElectronRuntime: () => electronRuntimeMock.isElectronRuntime,
  };
}

export function clerkSafeMock() {
  return { useAuthSafe: () => ({ signOut: signOutMock }) };
}

export function dashboardNavMock() {
  return {
    DashboardNav: ({ children }: { readonly children?: ReactNode }) => (
      <div data-testid='dashboard-nav'>{children}</div>
    ),
  };
}

export function headerSearchSurfaceMock() {
  return {
    HeaderSearchSurfaceFromContext: () => (
      <button type='button'>Search Sidebar</button>
    ),
  };
}

export function userButtonMock() {
  return {
    UserButton: (props: { readonly showUserInfo?: boolean }) => {
      userButtonPropsMock(props);
      return <div data-testid='user-button' />;
    },
  };
}

export function sidebarDockBridgeMock() {
  return {
    SidebarDockBridge: (props: {
      readonly collapsed: boolean;
      readonly userState?: { readonly hasClaimedHandle: boolean };
      readonly children: (status: undefined) => React.ReactNode;
    }) => {
      nowPlayingBridgePropsMock({
        collapsed: props.collapsed,
        userState: props.userState,
      });
      return (
        <>
          <div data-sidebar-dock='true' className='shrink-0'>
            <button type='button' data-testid='update-available-pill'>
              Update
            </button>
            <div data-testid='sidebar-whats-new' />
            <div data-testid='sidebar-now-playing-bridge' />
          </div>
          {props.children(undefined)}
        </>
      );
    },
  };
}
