import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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
  })),
}));
// AuthShellWrapper pulls in context providers, @jovie/ui Sheet components,
// ErrorBoundary (which loads Sentry init chain), and keyboard shortcut hooks.
// Mocking them avoids ~3s of transitive module resolution.

vi.mock('@/app/app/(shell)/dashboard/PreviewPanelContext', () => ({
  PreviewPanelProvider: previewPanelProviderMock,
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
}));

vi.mock('@/contexts/RightPanelContext', () => ({
  RightPanelProvider: ({ children }: { children: ReactNode }) => children,
}));

vi.mock('@/components/providers/ErrorBoundary', () => ({
  ErrorBoundary: ({ children }: { children: ReactNode }) => children,
}));

vi.mock('@/hooks/useSequentialShortcuts', () => ({
  useSequentialShortcuts: vi.fn(),
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
  AuthShell: ({ children }: { children: ReactNode }) => (
    <div data-testid='auth-shell'>{children}</div>
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

// Static import is safe here: vi.mock() declarations are hoisted above imports
// by Vitest, so all mocks are registered before this module resolves.
import { AuthShellWrapper } from '@/components/organisms/AuthShellWrapper';

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
    });
  });

  it('renders children without throwing runtime ReferenceError', () => {
    render(
      <AuthShellWrapper>
        <div>child content</div>
      </AuthShellWrapper>
    );

    expect(screen.getByText('child content')).toBeInTheDocument();
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
});
