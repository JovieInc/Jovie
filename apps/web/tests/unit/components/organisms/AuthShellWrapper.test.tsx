import { act, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Short-circuit heavy import chains that this test doesn't exercise.

const { previewPanelProviderMock, useAuthRouteConfigMock } = vi.hoisted(() => ({
  previewPanelProviderMock: vi.fn(
    ({ children }: { children: ReactNode }) => children
  ),
  useAuthRouteConfigMock: vi.fn(() => ({
    section: 'dashboard',
    isArtistProfileSettings: false,
    breadcrumbs: [],
    showMobileTabs: false,
    isTableRoute: false,
    isDemoRoute: false,
    isChatRoute: false,
    isLyricsRoute: false,
  })),
}));
// AuthShellWrapper pulls in context providers, @jovie/ui Sheet components,
// ErrorBoundary (which loads Sentry init chain), and keyboard shortcut hooks.
// Mocking them avoids ~3s of transitive module resolution.

vi.mock('@/app/app/(shell)/dashboard/PreviewPanelContext', () => ({
  PreviewPanelProvider: previewPanelProviderMock,
}));

vi.mock('@/hooks/RightRailKeyboardHandler', () => ({
  RightRailKeyboardHandler: () => null,
}));

vi.mock('@/contexts/KeyboardShortcutsContext', () => ({
  KeyboardShortcutsProvider: ({ children }: { children: ReactNode }) =>
    children,
  useKeyboardShortcuts: () => ({
    open: vi.fn(),
    close: vi.fn(),
    isOpen: false,
  }),
}));

vi.mock('@/contexts/HeaderActionsContext', () => ({
  HeaderActionsProvider: ({ children }: { children: ReactNode }) => children,
  useOptionalHeaderActions: () => null,
  useHeaderActions: () => ({
    headerActions: null,
    headerBadge: null,
    headerSearchAdapter: null,
    isSearchOpen: false,
    isCommandPaletteOpen: false,
    commandPaletteHeader: null,
    setHeaderActions: vi.fn(),
    setHeaderBadge: vi.fn(),
    setHeaderSearchAdapter: vi.fn(),
    openSearch: vi.fn(),
    closeSearch: vi.fn(),
    openCommandPalette: vi.fn(),
    closeCommandPalette: vi.fn(),
    setCommandPaletteHeader: vi.fn(),
  }),
  useRegisterHeaderSearch: vi.fn(),
}));

vi.mock('@/components/shell/HeaderSearchSurfaceFromContext', () => ({
  HeaderSearchSurface: () => null,
  HeaderSearchSurfaceFromContext: () => null,
}));

vi.mock('@/contexts/RightPanelContext', () => ({
  RightPanelProvider: ({ children }: { children: ReactNode }) => children,
}));

vi.mock('@/components/providers/ErrorBoundary', () => ({
  ErrorBoundary: ({ children }: { children: ReactNode }) => children,
}));

vi.mock('@/hooks/useDashboardShortcuts', () => ({
  useDashboardShortcuts: vi.fn(),
}));

vi.mock('@/components/organisms/keyboard-shortcuts-sheet', () => ({
  KeyboardShortcutsSheet: () => null,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => '/app/dashboard',
}));

vi.mock('@/hooks/useAuthRouteConfig', () => ({
  useAuthRouteConfig: useAuthRouteConfigMock,
}));

vi.mock('@/components/organisms/AuthShell', () => ({
  AuthShell: ({
    children,
    headerAction,
  }: {
    children: ReactNode;
    headerAction?: ReactNode;
  }) => (
    <div data-testid='auth-shell'>
      <div data-testid='shell-header-actions'>{headerAction}</div>
      {children}
    </div>
  ),
}));

vi.mock('@/features/dashboard/organisms/profile-contact-sidebar', () => ({
  ProfileContactSidebar: () => null,
}));

vi.mock('@/features/dashboard/atoms/HeaderProfileProgress', () => ({
  HeaderProfileProgress: () => null,
}));

vi.mock('@/features/dashboard/atoms/DrawerToggleButton', () => ({
  DrawerToggleButton: () => null,
}));

vi.mock('@/components/atoms/UpdateAvailablePill', () => ({
  UpdateAvailablePill: () => null,
}));

vi.mock('@/components/shell/ArtistProfileRailToggle', () => ({
  ArtistProfileRailToggle: () => null,
}));

// Static import is safe here: vi.mock() declarations are hoisted above imports
// by Vitest, so all mocks are registered before this module resolves.
import {
  AuthShellWrapper,
  usePendingShell,
} from '@/components/organisms/AuthShellWrapper';

function PendingShellControls() {
  const { clearPendingShell, showPendingShell } = usePendingShell();

  return (
    <>
      <button type='button' onClick={() => showPendingShell('releases')}>
        Open Releases
      </button>
      <button type='button' onClick={() => clearPendingShell('releases')}>
        Finish Releases
      </button>
    </>
  );
}

describe('AuthShellWrapper', () => {
  beforeEach(() => {
    previewPanelProviderMock.mockClear();
    useAuthRouteConfigMock.mockClear();
    useAuthRouteConfigMock.mockReturnValue({
      section: 'dashboard',
      isArtistProfileSettings: false,
      breadcrumbs: [],
      showMobileTabs: false,
      isTableRoute: false,
      isDemoRoute: false,
      isChatRoute: false,
      isLyricsRoute: false,
    });
  });

  afterEach(() => {
    if (vi.isFakeTimers()) {
      vi.runOnlyPendingTimers();
    }
    vi.useRealTimers();
  });

  it('renders children without throwing runtime ReferenceError', () => {
    render(
      <AuthShellWrapper>
        <div>child content</div>
      </AuthShellWrapper>
    );

    expect(screen.getByText('child content')).toBeInTheDocument();
  });

  it('keeps routine usage out of the dashboard header', () => {
    render(
      <AuthShellWrapper>
        <div>dashboard content</div>
      </AuthShellWrapper>
    );

    expect(
      screen.queryByLabelText(/Jovie usage: .* remaining/i)
    ).not.toBeInTheDocument();
  });

  it('keeps routine usage out of the chat header', () => {
    useAuthRouteConfigMock.mockReturnValue({
      section: 'dashboard',
      isArtistProfileSettings: false,
      breadcrumbs: [],
      showMobileTabs: false,
      isTableRoute: false,
      isDemoRoute: false,
      isChatRoute: true,
      isLyricsRoute: false,
    });

    render(
      <AuthShellWrapper>
        <div>chat content</div>
      </AuthShellWrapper>
    );

    expect(
      screen.queryByLabelText(/Jovie usage: .* remaining/i)
    ).not.toBeInTheDocument();
    expect(screen.getByText('chat content')).toBeInTheDocument();
  });

  it('passes the server-resolved mode into route configuration', () => {
    render(
      <AuthShellWrapper mode='ov'>
        <div>OV content</div>
      </AuthShellWrapper>
    );

    expect(useAuthRouteConfigMock).toHaveBeenCalledWith('ov');
  });

  it('passes preview panel default-open state through to provider on dashboard routes', () => {
    render(
      <AuthShellWrapper previewPanelDefaultOpen>
        <div>child content</div>
      </AuthShellWrapper>
    );

    expect(previewPanelProviderMock).toHaveBeenCalledWith(
      expect.objectContaining({ defaultOpen: true, enabled: true }),
      undefined
    );
  });

  it('does not default-open preview panel on non-dashboard routes', () => {
    // Override the route config mock for this test to simulate a non-dashboard route
    useAuthRouteConfigMock.mockReturnValue({
      section: 'settings',
      isArtistProfileSettings: false,
      breadcrumbs: [],
      showMobileTabs: false,
      isTableRoute: false,
      isDemoRoute: false,
      isChatRoute: false,
      isLyricsRoute: false,
    });

    render(
      <AuthShellWrapper previewPanelDefaultOpen>
        <div>child content</div>
      </AuthShellWrapper>
    );

    expect(previewPanelProviderMock).toHaveBeenCalledWith(
      expect.objectContaining({ defaultOpen: false, enabled: false }),
      undefined
    );
  });

  it('does not default-open preview panel on chat routes', () => {
    useAuthRouteConfigMock.mockReturnValue({
      section: 'dashboard',
      isArtistProfileSettings: false,
      breadcrumbs: [],
      showMobileTabs: false,
      isTableRoute: false,
      isDemoRoute: false,
      isChatRoute: true,
      isLyricsRoute: false,
    });

    render(
      <AuthShellWrapper previewPanelDefaultOpen>
        <div>child content</div>
      </AuthShellWrapper>
    );

    expect(previewPanelProviderMock).toHaveBeenCalledWith(
      expect.objectContaining({ defaultOpen: false, enabled: true }),
      undefined
    );
  });

  it.each([
    ['dashboard', {}],
    ['chat', { isChatRoute: true }],
    ['admin', { section: 'admin' }],
  ])('does not mount stale release-transition copy at rest on %s routes', (_, overrides) => {
    useAuthRouteConfigMock.mockReturnValue({
      section: 'dashboard',
      isArtistProfileSettings: false,
      breadcrumbs: [],
      showMobileTabs: false,
      isTableRoute: false,
      isDemoRoute: false,
      isChatRoute: false,
      isLyricsRoute: false,
      ...overrides,
    });

    render(
      <AuthShellWrapper>
        <div>route content</div>
      </AuthShellWrapper>
    );

    expect(screen.queryByText('Opening Releases')).not.toBeInTheDocument();
    expect(
      screen.queryByText('Preparing your release workspace.')
    ).not.toBeInTheDocument();
  });

  it('mounts the release-transition overlay only while Releases is pending and clears it on success', () => {
    render(
      <AuthShellWrapper>
        <PendingShellControls />
      </AuthShellWrapper>
    );

    expect(
      screen.queryByTestId('releases-shell-ready')
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Open Releases' }));

    const overlay = screen.getByTestId('releases-shell-ready');
    expect(overlay).toBeVisible();
    expect(overlay).toHaveClass('absolute');
    expect(overlay).toHaveAttribute('role', 'status');
    expect(screen.getByText('Opening Releases')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Finish Releases' }));

    expect(
      screen.queryByTestId('releases-shell-ready')
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Opening Releases')).not.toBeInTheDocument();
  });

  it('removes the release-transition overlay when the pending route times out', () => {
    vi.useFakeTimers();
    render(
      <AuthShellWrapper>
        <PendingShellControls />
      </AuthShellWrapper>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open Releases' }));
    expect(screen.getByText('Opening Releases')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(9_999);
    });
    expect(screen.getByText('Opening Releases')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.queryByText('Opening Releases')).not.toBeInTheDocument();
  });

  it('removes the pending overlay and cancels its timeout when the shell unmounts', () => {
    vi.useFakeTimers();
    const { unmount } = render(
      <AuthShellWrapper>
        <PendingShellControls />
      </AuthShellWrapper>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open Releases' }));
    expect(screen.getByText('Opening Releases')).toBeInTheDocument();
    expect(vi.getTimerCount()).toBe(1);

    unmount();

    expect(screen.queryByText('Opening Releases')).not.toBeInTheDocument();
    expect(vi.getTimerCount()).toBe(0);
  });
});
