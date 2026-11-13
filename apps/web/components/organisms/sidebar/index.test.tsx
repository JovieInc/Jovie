import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from './index';

const breakpoint = vi.hoisted(() => ({ mobile: false }));
vi.mock('@/hooks/useBreakpoint', async importOriginal => ({
  ...(await importOriginal<typeof import('@/hooks/useBreakpoint')>()),
  useBreakpointDown: () => breakpoint.mobile,
}));

function SidebarStateProbe() {
  const { state } = useSidebar();
  return <output aria-label='Sidebar state'>{state}</output>;
}

function ComposedSidebar({ defaultOpen = true }) {
  return (
    <SidebarProvider defaultOpen={defaultOpen}>
      <Sidebar collapsible='icon'>
        <SidebarHeader>Jovie</SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Workspace</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton isActive>Chat</SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton>Library</SidebarMenuButton>
                  <SidebarMenuBadge>3</SidebarMenuBadge>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter>Account</SidebarFooter>
      </Sidebar>
      <main>
        <SidebarTrigger />
        <SidebarStateProbe />
      </main>
    </SidebarProvider>
  );
}

beforeEach(() => {
  document.cookie = 'sidebar:state=; path=/; max-age=0';
  breakpoint.mobile = false;
});

describe('sidebar module barrel', () => {
  it('composes the shell rail from the barrel exports and is axe-clean', async () => {
    const { container } = render(<ComposedSidebar />);

    expect(screen.getByRole('button', { name: 'Chat' })).toHaveAttribute(
      'data-active',
      'true'
    );
    expect(screen.getByRole('button', { name: 'Library' })).toBeVisible();
    expect(screen.getByLabelText('Sidebar state')).toHaveTextContent('open');
    await expectNoA11yViolations(container);
  });

  it('collapses to the icon rail from the trigger and stays axe-clean', async () => {
    const user = userEvent.setup();
    const { container } = render(<ComposedSidebar />);

    await user.click(screen.getByRole('button', { name: 'Toggle Sidebar' }));

    expect(screen.getByLabelText('Sidebar state')).toHaveTextContent('closed');
    await expectNoA11yViolations(container);
  });
});
