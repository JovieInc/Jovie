import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Inbox } from 'lucide-react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import {
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from './menu';

vi.mock('./context', () => ({
  useSidebar: () => ({ isMobile: false }),
}));

describe('SidebarMenuButton hover interactions', () => {
  it('uses the sidebar hover token and preserves selection through pointer and keyboard input', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <SidebarMenuButton isActive onClick={onClick}>
        Library
      </SidebarMenuButton>
    );
    const button = screen.getByRole('button', { name: 'Library' });

    await user.hover(button);
    expect(button).toHaveClass('hover:bg-sidebar-accent');
    expect(button).toHaveAttribute('data-active', 'true');
    await user.unhover(button);
    await user.tab();
    expect(button).toHaveFocus();
    expect(button).toHaveClass('focus-visible:bg-sidebar-accent');
    await user.keyboard('{Enter}');
    expect(onClick).toHaveBeenCalledOnce();
    expect(button).toHaveAttribute('data-active', 'true');
  });

  it('keeps unselected disabled rows inert under pointer input', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <SidebarMenuButton disabled onClick={onClick}>
        Library
      </SidebarMenuButton>
    );
    const button = screen.getByRole('button', { name: 'Library' });
    await user.hover(button);
    await user.click(button);
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('data-active', 'false');
    expect(button).toHaveClass('disabled:pointer-events-none');
    expect(onClick).not.toHaveBeenCalled();
  });
});

function MenuRow({ children }: { readonly children: ReactNode }) {
  return (
    <SidebarMenu>
      <SidebarMenuItem>{children}</SidebarMenuItem>
    </SidebarMenu>
  );
}

describe('SidebarMenu accessibility', () => {
  it.each([
    ['default', <SidebarMenuButton key='row'>Overview</SidebarMenuButton>],
    [
      'active',
      <SidebarMenuButton key='row' isActive>
        Library
      </SidebarMenuButton>,
    ],
    [
      'disabled',
      <SidebarMenuButton key='row' disabled>
        Earnings
      </SidebarMenuButton>,
    ],
    ['loading', <SidebarMenuSkeleton key='row' showIcon />],
    [
      'partial icon and badge',
      <>
        <SidebarMenuButton>
          <Inbox aria-hidden='true' />
          <span>Inbox</span>
        </SidebarMenuButton>
        <SidebarMenuBadge>12</SidebarMenuBadge>
      </>,
    ],
    [
      'long label',
      <SidebarMenuButton key='row'>
        <span>
          Release Planning for The Extraordinarily Long Album Title (Deluxe
          Anniversary Remastered Edition)
        </span>
      </SidebarMenuButton>,
    ],
  ])('has no axe violations in the %s state', async (_label, row) => {
    const { container } = render(<MenuRow>{row}</MenuRow>);
    await expectNoA11yViolations(container);
  });

  it('runs row actions and sub-navigation in a right-to-left rail without axe violations', async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <MenuRow>
          <SidebarMenuButton>
            <Inbox aria-hidden='true' />
            <span>صندوق الوارد</span>
          </SidebarMenuButton>
          <SidebarMenuAction aria-label='خيارات' onClick={onAction} />
          <SidebarMenuSub>
            <SidebarMenuSubItem>
              <SidebarMenuSubButton href='/app/inbox' isActive>
                <span>غير مقروء</span>
              </SidebarMenuSubButton>
            </SidebarMenuSubItem>
          </SidebarMenuSub>
        </MenuRow>
      </div>
    );

    await user.click(screen.getByRole('button', { name: 'خيارات' }));
    expect(onAction).toHaveBeenCalledOnce();
    expect(screen.getByRole('link', { name: 'غير مقروء' })).toHaveAttribute(
      'data-active',
      'true'
    );
    await expectNoA11yViolations(container);
  });
});
