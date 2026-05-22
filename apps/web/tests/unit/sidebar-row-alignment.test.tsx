import { fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps, PropsWithChildren } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SidebarCollapsibleGroup } from '@/components/organisms/SidebarCollapsibleGroup';
import { SidebarGroupLabel } from '@/components/organisms/sidebar/group';
import {
  SidebarContent,
  SidebarHeader,
  SidebarSeparator,
} from '@/components/organisms/sidebar/layout';
import {
  getSidebarNavIconClassName,
  getSidebarNavRowClassName,
} from '@/components/shell/SidebarNavItem';

type SidebarGroupProps = PropsWithChildren<{ className?: string }>;
type SidebarGroupContentProps = PropsWithChildren<{ className?: string }>;
type SidebarMenuProps = PropsWithChildren;
type SidebarMenuItemProps = PropsWithChildren;
type SidebarMenuButtonProps = ComponentProps<'button'> & { isActive?: boolean };

vi.mock('@/components/organisms/Sidebar', () => ({
  SidebarGroup: ({ children, className }: SidebarGroupProps) => (
    <div data-testid='sidebar-group' className={className}>
      {children}
    </div>
  ),
  SidebarGroupContent: ({ children, className }: SidebarGroupContentProps) => (
    <div data-testid='sidebar-group-content' className={className}>
      {children}
    </div>
  ),
  SidebarMenu: ({ children }: SidebarMenuProps) => <div>{children}</div>,
  SidebarMenuItem: ({ children }: SidebarMenuItemProps) => (
    <div>{children}</div>
  ),
  SidebarMenuButton: ({
    children,
    className,
    isActive: _isActive,
    ...props
  }: SidebarMenuButtonProps) => (
    <button type='button' className={className} {...props}>
      {children}
    </button>
  ),
}));

describe('Sidebar row alignment', () => {
  afterEach(() => {
    localStorage.clear();
  });

  it('uses px-2.5 for section labels', () => {
    render(<SidebarGroupLabel>General</SidebarGroupLabel>);

    expect(screen.getByText('General').className).toContain('px-2.5');
  });

  it('uses px-2.5 for collapsible section headers', () => {
    render(
      <SidebarCollapsibleGroup label='General'>
        <div>Child</div>
      </SidebarCollapsibleGroup>
    );

    expect(
      screen.getByRole('button', { name: /general/i }).className
    ).toContain('px-2.5');
  });

  it('can default a persisted collapsible section closed without removing its slot', () => {
    const { container } = render(
      <SidebarCollapsibleGroup
        label='Admin'
        defaultOpen={false}
        storageKey='dashboard.admin'
      >
        <div>People</div>
      </SidebarCollapsibleGroup>
    );

    const button = screen.getByRole('button', { name: /admin/i });
    const body = container.querySelector('[inert]');

    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(body?.className).toContain('grid-rows-[0fr]');
    expect(body?.className).toContain('opacity-0');
  });

  it('persists collapsible section state by storage key', () => {
    const { unmount } = render(
      <SidebarCollapsibleGroup
        label='Artist'
        defaultOpen={false}
        storageKey='dashboard.artist-workspace'
      >
        <div>Profile</div>
      </SidebarCollapsibleGroup>
    );

    fireEvent.click(screen.getByRole('button', { name: /artist/i }));
    expect(
      localStorage.getItem('jovie:sidebar-section:dashboard.artist-workspace')
    ).toBe('open');

    unmount();

    render(
      <SidebarCollapsibleGroup
        label='Artist'
        defaultOpen={false}
        storageKey='dashboard.artist-workspace'
      >
        <div>Profile</div>
      </SidebarCollapsibleGroup>
    );

    expect(screen.getByRole('button', { name: /artist/i })).toHaveAttribute(
      'aria-expanded',
      'true'
    );
  });

  it('keeps shell sidebar wrapper spacing on the same token grid', () => {
    const { container } = render(
      <>
        <SidebarHeader>Header</SidebarHeader>
        <SidebarContent>Content</SidebarContent>
        <SidebarSeparator />
      </>
    );

    const header = container.querySelector('[data-sidebar="header"]');
    const content = container.querySelector('[data-sidebar="content"]');
    const separator = container.querySelector('[role="separator"]');

    expect(header?.getAttribute('class')).toContain('px-2.5');
    expect(content?.getAttribute('class')).toContain('px-0');
    expect(separator?.getAttribute('class')).toContain('mx-2.5');
  });

  it('shares the shell nav row and icon chrome helpers', () => {
    const rowClassName = getSidebarNavRowClassName({});
    const activeRowClassName = getSidebarNavRowClassName({ active: true });
    const iconClassName = getSidebarNavIconClassName({});

    expect(rowClassName).toContain('h-6.5');
    expect(rowClassName).toContain('px-2.5');
    expect(rowClassName).toContain('gap-x-2.5');
    expect(rowClassName).toContain('grid-cols-[20px_minmax(0,1fr)_40px]');
    expect(rowClassName).toContain('before:left-[20px]');
    expect(rowClassName).toContain('after:left-[34px]');
    expect(rowClassName).toContain('text-[12.5px]');
    expect(rowClassName).toContain(
      'hover:bg-[color-mix(in_oklab,var(--color-sidebar-accent)_88%,transparent)]'
    );
    expect(activeRowClassName).toContain('color-sidebar-accent-active');
    expect(iconClassName).toContain('h-3.5');
    expect(iconClassName).toContain('text-sidebar-muted/80');
  });
});
