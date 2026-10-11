import { TooltipProvider } from '@jovie/ui';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthShell } from '@/components/organisms/AuthShell';
import { detectReversibleControl } from '@/tests/utils/reversible-control-detector';

const runtime = vi.hoisted(() => ({ electron: true }));

vi.mock('@/hooks/useBreakpoint', () => ({
  useBreakpointDown: () => false,
}));

vi.mock('@/lib/desktop/electron-bridge', async importOriginal => {
  const actual =
    await importOriginal<typeof import('@/lib/desktop/electron-bridge')>();
  return {
    ...actual,
    useIsElectronRuntime: () => runtime.electron,
    useDesktopNavigation: () => ({
      canGoBack: false,
      canGoForward: false,
      goBack: vi.fn(),
      goForward: vi.fn(),
    }),
  };
});

vi.mock('@/components/organisms/AppShellFrame', async () => {
  const { DesktopTitlebar } = await import(
    '@/components/organisms/DesktopTitlebar'
  );
  return {
    AppShellFrame: ({
      sidebar,
      header,
      main,
    }: {
      sidebar: ReactNode;
      header?: ReactNode;
      main: ReactNode;
    }) => (
      <div data-testid='composed-auth-shell'>
        <DesktopTitlebar />
        {sidebar}
        {header}
        {main}
      </div>
    ),
  };
});

vi.mock('@/components/organisms/UnifiedSidebar', async () => {
  const { SidebarCollapseButton } = await import(
    '@/components/molecules/sidebar-collapse-button/SidebarCollapseButton'
  );
  const { useSidebar } = await import('@/components/organisms/sidebar');
  const { RailStagedContent } = await import(
    '@/components/shell/RailStagedContent'
  );
  return {
    UnifiedSidebar: ({
      headerOwnsCollapsedToggle = false,
    }: {
      headerOwnsCollapsedToggle?: boolean;
    }) => {
      const { state } = useSidebar();
      return (
        <aside data-testid='composed-sidebar' data-state={state}>
          {!runtime.electron ? (
            <RailStagedContent
              hidden={state === 'closed' && headerOwnsCollapsedToggle}
              stage={headerOwnsCollapsedToggle}
            >
              <SidebarCollapseButton />
            </RailStagedContent>
          ) : null}
        </aside>
      );
    },
  };
});

vi.mock('@/features/dashboard/organisms/DashboardHeader', () => ({
  DashboardHeader: ({ sidebarTrigger }: { sidebarTrigger?: ReactNode }) => (
    <header>{sidebarTrigger}</header>
  ),
}));

vi.mock('@/app/app/(shell)/dashboard/PreviewPanelContext', () => ({
  usePreviewPanelState: () => ({ toggle: vi.fn() }),
}));
vi.mock('@/components/features/chat/Composer', () => ({
  useComposerFocus: () => ({ isComposerFocused: false }),
}));
vi.mock('@/components/organisms/PersistentAudioBar', () => ({
  PersistentAudioBar: () => null,
}));
vi.mock('@/components/shell/RuntimeUpdateProvider', () => ({
  RuntimeUpdateProvider: ({ children }: { children: ReactNode }) => children,
}));
vi.mock('@/contexts/RightPanelContext', () => ({
  useRightPanel: () => null,
}));
vi.mock('@/components/organisms/whats-new/WhatsNewBanner', () => ({
  WhatsNewBanner: () => null,
}));
vi.mock('@/components/organisms/OperatorMobileNavigation', () => ({
  OperatorMobileNavigation: () => null,
}));
vi.mock('@/features/dashboard/organisms/DashboardMobileTabs', () => ({
  DashboardMobileTabs: () => null,
}));
vi.mock('@/features/dashboard/organisms/MobileProfileDrawer', () => ({
  MobileProfileDrawer: () => null,
}));

function Shell({ defaultOpen = true }: { readonly defaultOpen?: boolean }) {
  return (
    <TooltipProvider>
      <AuthShell
        section='dashboard'
        breadcrumbs={[]}
        sidebarDefaultOpen={defaultOpen}
      >
        <main>Composed shell content</main>
      </AuthShell>
    </TooltipProvider>
  );
}

function railToggles(root: HTMLElement | Document = document) {
  return [
    ...root.querySelectorAll<HTMLButtonElement>(
      '[data-rail-toggle="left"]:not([inert] *)'
    ),
  ];
}

async function certifyLeftRail({
  root = document,
  initialState = 'open',
  requireFocusContinuity,
}: {
  readonly root?: HTMLElement | Document;
  readonly initialState?: 'closed' | 'open';
  readonly requireFocusContinuity: boolean;
}) {
  const user = userEvent.setup();
  const states =
    initialState === 'open'
      ? (['open', 'closed'] as const)
      : (['closed', 'open'] as const);
  const currentToggle = () => {
    const toggles = railToggles(root);
    if (toggles.length !== 1 || !toggles[0].isConnected) {
      throw new Error(
        `expected one attached left-rail toggle, found ${toggles.length}`
      );
    }
    return toggles[0];
  };

  currentToggle().focus();
  // Tooltip dismissal consumes the first Escape; preview owns the next.
  await user.keyboard('{Escape}{Escape}');
  return detectReversibleControl({
    activationSequence: Array.from({ length: 20 }, (_, index) =>
      index % 3 === 0 ? ('keyboard' as const) : ('pointer' as const)
    ),
    name: runtime.electron
      ? 'composed Electron AuthShell sidebar'
      : 'composed browser AuthShell sidebar',
    states,
    observe: () => ({
      state:
        currentToggle().getAttribute('aria-expanded') === 'true'
          ? 'open'
          : 'closed',
    }),
    activate: async via => {
      const toggle = currentToggle();
      toggle.focus();
      if (via === 'pointer') {
        await user.click(toggle);
      } else {
        fireEvent.keyDown(window, { key: '[' });
      }
    },
    assertContinuity: observation => {
      const toggle = currentToggle();
      const expanded = String(observation.state === 'open');
      expect(toggle).toHaveAttribute('aria-expanded', expanded);
      expect(toggle).toHaveAttribute('aria-pressed', expanded);
      expect(toggle).toHaveAccessibleName(
        observation.state === 'open' ? 'Collapse sidebar' : 'Expand sidebar'
      );
      expect(toggle).toBeEnabled();
      if (requireFocusContinuity) expect(toggle).toHaveFocus();
    },
  });
}

describe('proves repeated pointer, keyboard, mixed, and hydrated cycles on composed browser and Electron shells', () => {
  beforeEach(() => {
    document.cookie = 'sidebar:state=; max-age=0; path=/';
    runtime.electron = true;
  });

  afterEach(() => {
    document.cookie = 'sidebar:state=; max-age=0; path=/';
  });

  it('proves repeated pointer, keyboard, and mixed cycles on the composed Electron shell', async () => {
    render(<Shell />);

    await certifyLeftRail({ requireFocusContinuity: true });

    expect(screen.getByTestId('composed-sidebar')).toHaveAttribute(
      'data-state',
      'open'
    );
    expect(screen.getByTestId('electron-sidebar-toggle-icon')).toHaveAttribute(
      'aria-hidden',
      'true'
    );
  });

  it('proves the hosted browser collapse and reopen owners form one state machine', async () => {
    runtime.electron = false;
    render(<Shell />);

    await certifyLeftRail({ requireFocusContinuity: false });

    expect(screen.getByTestId('composed-sidebar')).toHaveAttribute(
      'data-state',
      'open'
    );
    expect(
      screen.queryByTestId('electron-sidebar-toggle')
    ).not.toBeInTheDocument();
  });

  it.each([
    { section: 'settings' as const, isLyricsRoute: false },
    { section: 'dashboard' as const, isLyricsRoute: true },
  ])(
    'preserves a reachable browser toggle on headerless routes %j',
    async props => {
      runtime.electron = false;
      render(
        <TooltipProvider>
          <AuthShell {...props} breadcrumbs={[]} sidebarDefaultOpen={false}>
            <main>Headerless route</main>
          </AuthShell>
        </TooltipProvider>
      );
      await certifyLeftRail({
        initialState: 'closed',
        requireFocusContinuity: true,
      });
    }
  );

  it('hydrates restored collapsed state and still toggles both directions repeatedly', async () => {
    const container = document.createElement('div');
    container.innerHTML = renderToString(<Shell defaultOpen={false} />);
    document.body.append(container);
    let root: ReturnType<typeof hydrateRoot> | undefined;
    const onRecoverableError = vi.fn();

    try {
      await act(async () => {
        root = hydrateRoot(container, <Shell defaultOpen={false} />, {
          onRecoverableError,
        });
      });
      expect(onRecoverableError).not.toHaveBeenCalled();
      expect(
        within(container).getByTestId('electron-sidebar-toggle')
      ).toHaveAttribute('aria-expanded', 'false');

      await certifyLeftRail({
        root: container,
        initialState: 'closed',
        requireFocusContinuity: true,
      });

      expect(document.cookie).toContain('sidebar:state=false');
    } finally {
      await act(async () => root?.unmount());
      container.remove();
    }
  });
});
