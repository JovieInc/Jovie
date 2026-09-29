// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, createElement, type ReactNode } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthShell } from '@/components/organisms/AuthShell';
import { AppFlagProvider } from '@/lib/flags/client';
import { APP_FLAG_DEFAULTS } from '@/lib/flags/contracts';

const { sidebarMock } = vi.hoisted(() => ({
  sidebarMock: {
    isMobile: false,
    state: 'closed' as 'open' | 'closed',
  },
}));

vi.mock('@/app/app/(shell)/dashboard/PreviewPanelContext', () => ({
  usePreviewPanelState: () => ({ toggle: vi.fn() }),
}));

vi.mock('@/components/organisms/AppShellFrame', () => ({
  AppShellFrame: ({
    sidebar,
    header,
    main,
    mobileBottomNav,
  }: {
    sidebar: ReactNode;
    header?: ReactNode;
    main: ReactNode;
    mobileBottomNav?: ReactNode;
  }) => (
    <div data-testid='app-shell-frame'>
      {sidebar}
      {header}
      {main}
      {mobileBottomNav}
    </div>
  ),
}));

vi.mock('@/components/organisms/PersistentAudioBar', () => ({
  PersistentAudioBar: () => null,
}));

vi.mock('@/components/organisms/sidebar', () => ({
  SidebarProvider: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  SidebarTrigger: () => <button type='button'>Toggle Sidebar</button>,
  useSidebar: () => sidebarMock,
}));

vi.mock(
  '@/components/molecules/sidebar-collapse-button/SidebarCollapseButton',
  () => ({
    SidebarCollapseButton: () => (
      <button
        type='button'
        aria-label='Expand sidebar'
        data-testid='sidebar-rail-toggle'
      >
        Expand sidebar
      </button>
    ),
  })
);

vi.mock('@/components/organisms/UnifiedSidebar', () => ({
  UnifiedSidebar: () => <aside>Sidebar</aside>,
}));

vi.mock('@/components/organisms/whats-new/WhatsNewBanner', () => ({
  WhatsNewBanner: () => null,
}));

vi.mock('@/contexts/RightPanelContext', () => ({
  useRightPanel: () => null,
}));

vi.mock('@/features/dashboard/organisms/DashboardHeader', () => ({
  DashboardHeader: ({ sidebarTrigger }: { sidebarTrigger?: ReactNode }) => (
    <header data-testid='dashboard-header'>
      {sidebarTrigger ? (
        <div data-shell-sidebar-trigger='true'>{sidebarTrigger}</div>
      ) : null}
    </header>
  ),
}));

vi.mock('@/features/dashboard/organisms/DashboardMobileTabs', () => ({
  DashboardMobileTabs: () => null,
}));

vi.mock('@/components/organisms/OperatorMobileNavigation', () => ({
  OperatorMobileNavigation: () => null,
}));

vi.mock('@/features/dashboard/organisms/MobileProfileDrawer', () => ({
  MobileProfileDrawer: () => null,
}));

function shellTree() {
  return createElement(
    QueryClientProvider,
    {
      client: new QueryClient({
        defaultOptions: { queries: { retry: false } },
      }),
    },
    createElement(
      AppFlagProvider,
      { initialFlags: APP_FLAG_DEFAULTS },
      createElement(
        AuthShell,
        { section: 'dashboard', breadcrumbs: [] },
        createElement('div', null, 'Shell Content')
      )
    )
  );
}

afterEach(() => {
  document.body.innerHTML = '';
  delete document.documentElement.dataset.desktopRuntime;
  vi.restoreAllMocks();
});

describe('AuthShell Electron hydration contract (JOV-7207)', () => {
  it('hydrates a collapsed shell in Electron with zero recoverable errors', async () => {
    const recoverableErrors: unknown[] = [];
    const consoleErrors: unknown[][] = [];
    vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      consoleErrors.push(args);
    });

    const tree = shellTree();
    const container = document.createElement('div');
    container.innerHTML = renderToString(tree);
    document.body.append(container);

    // SSR cannot know the runtime, so the header trigger is in the HTML.
    expect(
      container.querySelectorAll('[data-testid="sidebar-rail-toggle"]')
    ).toHaveLength(1);

    // The Electron runtime marker is applied pre-hydration by
    // electron-runtime-init.js; globals.css keeps the duplicate trigger
    // hidden until the effect-gated hook removes it.
    document.documentElement.dataset.desktopRuntime = 'electron';

    let root: ReturnType<typeof hydrateRoot> | undefined;
    await act(async () => {
      root = hydrateRoot(container, tree, {
        onRecoverableError: error => recoverableErrors.push(error),
      });
    });

    expect(recoverableErrors).toEqual([]);
    expect(
      consoleErrors.filter(args =>
        args.some(value => /hydrat/i.test(String(value)))
      )
    ).toEqual([]);

    // Post-hydration the desktop titlebar owns the single canonical toggle.
    expect(
      container.querySelectorAll('[data-testid="sidebar-rail-toggle"]')
    ).toHaveLength(0);

    await act(async () => {
      root?.unmount();
    });
  });

  it('keeps the header trigger after hydration in the browser runtime', async () => {
    const recoverableErrors: unknown[] = [];
    const tree = shellTree();
    const container = document.createElement('div');
    container.innerHTML = renderToString(tree);
    document.body.append(container);

    let root: ReturnType<typeof hydrateRoot> | undefined;
    await act(async () => {
      root = hydrateRoot(container, tree, {
        onRecoverableError: error => recoverableErrors.push(error),
      });
    });

    expect(recoverableErrors).toEqual([]);
    expect(
      container.querySelectorAll('[data-testid="sidebar-rail-toggle"]')
    ).toHaveLength(1);

    await act(async () => {
      root?.unmount();
    });
  });
});
