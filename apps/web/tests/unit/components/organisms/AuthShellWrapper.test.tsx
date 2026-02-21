import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

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

describe('AuthShellWrapper', () => {
  it('renders children without throwing runtime ReferenceError', async () => {
    const { AuthShellWrapper } = await import(
      '@/components/organisms/AuthShellWrapper'
    );

    render(
      <AuthShellWrapper>
        <div>child content</div>
      </AuthShellWrapper>
    );

    expect(screen.getByText('child content')).toBeInTheDocument();
  });
});
