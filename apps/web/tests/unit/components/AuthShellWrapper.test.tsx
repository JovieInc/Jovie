import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AuthShellWrapper } from '@/components/organisms/AuthShellWrapper';

vi.mock('@/hooks/useAuthRouteConfig', () => ({
  useAuthRouteConfig: () => ({
    section: 'dashboard',
    breadcrumbs: [],
    isTableRoute: false,
    showMobileTabs: false,
    isArtistProfileSettings: false,
  }),
}));

vi.mock('@/hooks/useSequentialShortcuts', () => ({
  useSequentialShortcuts: vi.fn(),
}));

vi.mock('@/components/organisms/AuthShell', () => ({
  AuthShell: ({ children }: { children: React.ReactNode }) => (
    <div data-testid='auth-shell'>{children}</div>
  ),
}));

vi.mock('@/components/organisms/keyboard-shortcuts-sheet', () => ({
  KeyboardShortcutsSheet: () => null,
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

describe('AuthShellWrapper', () => {
  it('renders children without provider reference errors', () => {
    render(
      <AuthShellWrapper>
        <div>content</div>
      </AuthShellWrapper>
    );

    expect(screen.getByTestId('auth-shell')).toBeInTheDocument();
    expect(screen.getByText('content')).toBeInTheDocument();
  });
});
