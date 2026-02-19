import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SidebarCollapsibleGroup } from '@/components/organisms/SidebarCollapsibleGroup';
import { SidebarGroupLabel } from '@/components/organisms/sidebar/group';

vi.mock('@/components/organisms/Sidebar', () => ({
  SidebarGroup: ({ children, className }: any) => (
    <div data-testid='sidebar-group' className={className}>
      {children}
    </div>
  ),
  SidebarGroupContent: ({ children, className }: any) => (
    <div data-testid='sidebar-group-content' className={className}>
      {children}
    </div>
  ),
  SidebarMenu: ({ children }: any) => <div>{children}</div>,
  SidebarMenuItem: ({ children }: any) => <div>{children}</div>,
  SidebarMenuButton: ({
    children,
    className,
    isActive: _isActive,
    ...props
  }: any) => (
    <button type='button' className={className} {...props}>
      {children}
    </button>
  ),
}));

describe('Sidebar row alignment', () => {
  it('uses px-1.5 for section labels', () => {
    render(<SidebarGroupLabel>General</SidebarGroupLabel>);

    expect(screen.getByText('General').className).toContain('px-1.5');
  });

  it('uses px-1.5 for collapsible section headers', () => {
    render(
      <SidebarCollapsibleGroup label='General'>
        <div>Child</div>
      </SidebarCollapsibleGroup>
    );

    expect(
      screen.getByRole('button', { name: /general/i }).className
    ).toContain('px-1.5');
  });
});
