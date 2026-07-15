import { fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps, PropsWithChildren } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getSettingsSidebarRowClassName } from '@/components/features/dashboard/organisms/SettingsPolished';
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

  it('keeps settings sidebar rows byte-identical to shell nav-row chrome', () => {
    // Settings-vs-shell parity (#12025): the settings sidebar must derive its
    // rows from the canonical shell helper. Its only allowed divergence is
    // structural — no icon column (single-column grid) and hidden icon guide
    // lines — never padding/density/active/hover treatment.
    const settingsRow = getSettingsSidebarRowClassName(false);
    const settingsActiveRow = getSettingsSidebarRowClassName(true);
    const shellRow = getSidebarNavRowClassName({});

    // Same density, radius, and hover chrome as the shell sidebar.
    for (const token of [
      'h-7',
      'px-2.5',
      'rounded-full',
      'text-xs',
      'font-normal',
      'hover:bg-sidebar-accent',
      'text-sidebar-item-foreground',
    ]) {
      expect(
        settingsRow,
        `settings row missing shell token ${token}`
      ).toContain(token);
      expect(shellRow, `shell row missing token ${token}`).toContain(token);
    }

    // Same active treatment as the shell sidebar.
    expect(settingsActiveRow).toContain('bg-sidebar-accent-active');
    expect(settingsActiveRow).toContain('text-primary-token');
    expect(settingsActiveRow).toContain('font-medium');

    // Allowed structural divergence: icon-less single-column grid with the
    // icon guide lines hidden. `cn()` runs tailwind-merge, so the settings
    // override must fully replace the shell's icon-column grid template.
    expect(settingsRow).toContain('grid-cols-[minmax(0,1fr)]');
    expect(settingsRow).toContain('before:hidden');
    expect(settingsRow).toContain('after:hidden');
    expect(settingsRow).not.toContain('grid-cols-[22px_minmax(0,1fr)_34px]');
  });

  it('keeps nav-row chrome borderless in resting, hover, and active states', () => {
    // #13217: sidebar nav rows are borderless — active state is a filled
    // background only. No resting border, no hover border, no active border
    // or border-by-inset-ring shadow may reappear on the canonical row chrome.
    for (const row of [
      getSidebarNavRowClassName({}),
      getSidebarNavRowClassName({ active: true }),
      getSidebarNavRowClassName({ tone: 'primary' }),
    ]) {
      expect(row).not.toContain('border-transparent');
      expect(row).not.toContain('border-sidebar-border');
      expect(row).not.toContain('hover:border');
      expect(row).not.toContain('inset_0_0_0_1px');
      expect(row).not.toMatch(/(?:^|\s)border(?:\s|$)/);
    }
  });

  it('shares the shell nav row and icon chrome helpers', () => {
    const rowClassName = getSidebarNavRowClassName({});
    const activeRowClassName = getSidebarNavRowClassName({ active: true });
    const iconClassName = getSidebarNavIconClassName({});

    expect(rowClassName).toContain('h-7');
    expect(rowClassName).toContain('px-2.5');
    expect(rowClassName).toContain('gap-x-2.5');
    expect(rowClassName).toContain('grid-cols-[22px_minmax(0,1fr)_34px]');
    expect(rowClassName).toContain('before:left-6');
    expect(rowClassName).toContain('after:left-10');
    expect(rowClassName).toContain('text-xs');
    expect(rowClassName).toContain('font-normal');
    expect(rowClassName).toContain('hover:bg-sidebar-accent');
    expect(rowClassName).toContain('text-sidebar-item-foreground');
    expect(rowClassName).not.toContain('text-sidebar-muted/80');
    expect(getSidebarNavRowClassName({ nested: true })).not.toContain(
      'text-sidebar-muted/65'
    );
    expect(activeRowClassName).toContain('bg-sidebar-accent-active');
    expect(activeRowClassName).toContain('text-primary-token');
    expect(activeRowClassName).toContain('font-medium');
    expect(iconClassName).toContain('h-3.5');
    expect(iconClassName).toContain('text-sidebar-muted/70');
    expect(getSidebarNavIconClassName({ active: true })).toContain(
      'text-primary-token'
    );
  });
});
