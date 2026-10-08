import { TooltipProvider } from '@jovie/ui';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { OPERATOR_NAV_ITEMS } from '@/components/organisms/operator-navigation';
import { ADMIN_PRIMARY_WORKSPACE_IDS } from '@/constants/admin-navigation';
import { calendarNavItem } from '@/features/dashboard/dashboard-nav/config';
import { SidebarMoreMenu } from './SidebarMoreMenu';

const overflow = OPERATOR_NAV_ITEMS.filter(
  item => !ADMIN_PRIMARY_WORKSPACE_IDS.some(id => id === item.registryId)
);

describe('More authorized destinations', () => {
  it('keeps hover unfocused and upgrades to exactly one focused menu', async () => {
    const user = userEvent.setup();
    const items = overflow.filter(item =>
      ['people', 'certifications'].includes(item.registryId)
    );
    render(
      <>
        <button type='button'>Workspace action</button>
        <SidebarMoreMenu items={items} isActive={() => false} />
      </>
    );
    const action = screen.getByRole('button', { name: 'Workspace action' });
    const trigger = screen.getByRole('button', { name: 'More Pages' });
    action.focus();
    fireEvent.pointerEnter(trigger, { pointerType: 'mouse' });
    await waitFor(() => expect(screen.getByRole('dialog')).toBeVisible());
    expect(action).toHaveFocus();
    const previewLinks = screen
      .getAllByRole('link')
      .map(link => link.getAttribute('href'));
    await user.click(trigger);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getAllByRole('menu')).toHaveLength(1);
    expect(screen.getByRole('menu')).toContainElement(
      document.activeElement as HTMLElement
    );
    for (const item of items) expect(previewLinks).toContain(item.href);
    await user.keyboard('{Escape}');
    expect(trigger).toHaveFocus();
  });

  it('keeps every overflow destination reachable, with keyboard submenu access and focus restoration', async () => {
    const user = userEvent.setup();
    render(
      <TooltipProvider>
        <SidebarMoreMenu items={overflow} isActive={() => false} />
      </TooltipProvider>
    );
    const trigger = screen.getByRole('button', { name: 'More Pages' });
    trigger.focus();
    await user.keyboard('{Enter}');
    const labels = screen
      .getAllByRole('menuitem')
      .map(item => item.textContent);
    for (const item of overflow) expect(labels).toContain(item.name);
    const people = screen.getByRole('menuitem', { name: 'People' });
    people.focus();
    await user.keyboard('{ArrowRight}');
    expect(
      screen.getByRole('menuitem', { name: 'All people' })
    ).toHaveAttribute(
      'href',
      people ? overflow.find(item => item.registryId === 'people')?.href : ''
    );
    await user.keyboard('{Escape}');
    expect(people).toHaveFocus();
    expect(screen.getByRole('menu')).toBeVisible();
    await user.keyboard('{Escape}');
    expect(trigger).toHaveFocus();
  });

  it('moves the selected surface to a personal pin and returns it to More on unpin', async () => {
    const user = userEvent.setup();
    localStorage.clear();
    const items = overflow.filter(item => item.registryId === 'certifications');
    render(
      <TooltipProvider>
        <SidebarMoreMenu
          items={items}
          pinScope='test-user:ov'
          isActive={() => true}
        />
      </TooltipProvider>
    );
    const trigger = screen.getByRole('button', { name: 'More Pages' });
    expect(trigger).toHaveAttribute('data-navigation-overflow-active', 'true');
    await user.click(trigger);
    await user.click(
      screen.getByRole('menuitem', { name: `Pin ${items[0].name}` })
    );
    expect(trigger).not.toHaveAttribute('data-navigation-overflow-active');
    expect(
      within(screen.getByRole('region', { name: 'Pinned Pages' })).getByRole(
        'link'
      )
    ).toHaveAttribute('aria-current', 'page');
    await user.click(
      screen.getByRole('menuitem', { name: `Unpin ${items[0].name}` })
    );
    expect(
      screen.queryByRole('region', { name: 'Pinned Pages' })
    ).not.toBeInTheDocument();
    expect(trigger).toHaveAttribute('data-navigation-overflow-active', 'true');
  });

  it('does not surface excluded destinations and opens existing page search', async () => {
    const user = userEvent.setup();
    const onFindPage = vi.fn();
    render(
      <SidebarMoreMenu
        items={overflow.filter(item => item.registryId === 'certifications')}
        isActive={() => true}
        onFindPage={onFindPage}
      />
    );
    const trigger = screen.getByRole('button', { name: 'More Pages' });
    expect(trigger).toHaveAttribute('data-navigation-overflow-active', 'true');
    await user.click(trigger);
    expect(
      screen.queryByRole('menuitem', { name: 'People' })
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole('menuitem', { name: 'Find a page…' }));
    expect(onFindPage).toHaveBeenCalledOnce();
  });

  it('uses scoped search for a large registry and keeps an out-of-window current page pinnable', async () => {
    const user = userEvent.setup();
    const onFindPage = vi.fn();
    const items = Array.from({ length: 120 }, (_, index) => ({
      ...calendarNavItem,
      id: `scale-${index}`,
      name: `Permitted calendar ${index + 1}`,
    }));
    render(
      <TooltipProvider>
        <SidebarMoreMenu
          items={items}
          isActive={item => item.id === 'scale-119'}
          onFindPage={onFindPage}
          pinScope='scale-user:ov'
        />
      </TooltipProvider>
    );
    const trigger = screen.getByRole('button', { name: 'More Pages' });
    await user.click(trigger);
    const menu = screen.getByRole('menu');
    expect(menu.querySelectorAll('[role="menuitem"][href]')).toHaveLength(12);
    expect(
      within(menu).getByRole('menuitem', { name: 'Permitted calendar 120' })
    ).toHaveAttribute('aria-current', 'page');
    expect(
      within(menu).queryByRole('menuitem', { name: 'Permitted calendar 119' })
    ).not.toBeInTheDocument();
    await user.click(
      within(menu).getByRole('menuitem', { name: 'Pin Permitted calendar 120' })
    );
    expect(
      within(screen.getByRole('region', { name: 'Pinned Pages' })).getByRole(
        'link',
        { name: 'Permitted calendar 120' }
      )
    ).toHaveAttribute('href', items[119].href);
    await user.click(
      within(menu).getByRole('menuitem', { name: 'Find a page…' })
    );
    expect(onFindPage).toHaveBeenCalledOnce();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('keeps the complete registry inline when no scoped search is available', async () => {
    const user = userEvent.setup();
    const items = Array.from({ length: 13 }, (_, index) => ({
      ...calendarNavItem,
      id: `fallback-${index}`,
      name: `Calendar fallback ${index + 1}`,
    }));
    render(<SidebarMoreMenu items={items} isActive={() => false} />);
    await user.click(screen.getByRole('button', { name: 'More Pages' }));
    expect(
      screen.getByRole('menu').querySelectorAll('[role="menuitem"][href]')
    ).toHaveLength(13);
  });
});
