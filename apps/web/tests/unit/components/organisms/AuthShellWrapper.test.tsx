import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

// Short-circuit heavy import chains that this test doesn't exercise.
// AuthShellWrapper pulls in context providers, @jovie/ui Sheet components,
// ErrorBoundary (which loads Sentry init chain), and keyboard shortcut hooks.
// Mocking them avoids ~3s of transitive module resolution.

vi.mock('@/app/app/(shell)/dashboard/PreviewPanelContext', () => ({
  PreviewPanelProvider: ({ children }: { children: ReactNode }) => children,
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
  useAuthRouteConfig: () => ({
    section: 'dashboard',
    isArtistProfileSettings: false,
    breadcrumbs: [],
    showMobileTabs: false,
    isTableRoute: false,
  }),
}));

vi.mock('@/components/organisms/AuthShell', () => ({
  AuthShell: ({ children }: { children: ReactNode }) => (
    <div data-testid='auth-shell'>{children}</div>
  ),
}));

vi.mock('@/components/dashboard/organisms/profile-contact-sidebar', () => ({
  ProfileContactSidebar: () => null,
}));

vi.mock('@/components/dashboard/atoms/HeaderProfileProgress', () => ({
  HeaderProfileProgress: () => null,
}));

vi.mock('@/components/dashboard/atoms/DrawerToggleButton', () => ({
  DrawerToggleButton: () => null,
}));

// Static import is safe here: vi.mock() declarations are hoisted above imports
// by Vitest, so all mocks are registered before this module resolves.
import { AuthShellWrapper } from '@/components/organisms/AuthShellWrapper';

describe('AuthShellWrapper', () => {
  it('renders children without throwing runtime ReferenceError', () => {
    render(
      <AuthShellWrapper>
        <div>child content</div>
      </AuthShellWrapper>
    );

    expect(screen.getByText('child content')).toBeInTheDocument();
  });
});
