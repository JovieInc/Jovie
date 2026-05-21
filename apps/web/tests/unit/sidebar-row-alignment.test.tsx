import { render, screen } from '@testing-library/react';
import type { ComponentProps, PropsWithChildren } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { SidebarCollapsibleGroup } from '@/components/organisms/SidebarCollapsibleGroup';
import { SidebarGroupLabel } from '@/components/organisms/sidebar/group';
import {
  SidebarContent,
  SidebarHeader,
  SidebarSeparator,
} from '@/components/organisms/sidebar/layout';

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
});
