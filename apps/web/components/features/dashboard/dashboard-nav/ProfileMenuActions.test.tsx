import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ProfileMenuActions } from './ProfileMenuActions';

const pushMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}));

vi.mock('@/lib/hooks/useNotifications', () => ({
  useNotifications: () => ({ success: vi.fn(), error: vi.fn() }),
}));

vi.mock('@/lib/analytics', () => ({ track: vi.fn() }));

vi.mock('@/components/organisms/sidebar', () => ({
  SidebarMenuActions: ({ children }: { readonly children: ReactNode }) => (
    <div data-testid='menu-actions'>{children}</div>
  ),
  SidebarMenuAction: ({ children }: { readonly children: ReactNode }) => (
    <>{children}</>
  ),
}));

vi.mock('@jovie/ui', () => ({
  CommonDropdown: ({
    items,
  }: {
    readonly items: ReadonlyArray<{ id: string; label?: string }>;
  }) => (
    <div data-testid='profile-menu'>
      {items.map(item => (
        <div key={item.id}>{item.label}</div>
      ))}
    </div>
  ),
}));

describe('ProfileMenuActions', () => {
  it('renders the profile overflow actions', () => {
    render(<ProfileMenuActions publicProfileHref='/artist' />);

    const menu = screen.getByTestId('profile-menu');
    expect(menu).toHaveTextContent('Copy Link');
    expect(menu).toHaveTextContent('Open Profile');
    expect(menu).toHaveTextContent('Download Ads');
    expect(menu).toHaveTextContent('Settings');
  });
});
