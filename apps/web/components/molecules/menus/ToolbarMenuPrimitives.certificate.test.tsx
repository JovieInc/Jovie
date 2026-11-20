import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@jovie/ui';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { ToolbarMenuChoiceItem } from './ToolbarMenuPrimitives';

function Menu({ children }: { readonly children: ReactNode }) {
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger>Sort</DropdownMenuTrigger>
      <DropdownMenuContent>{children}</DropdownMenuContent>
    </DropdownMenu>
  );
}

describe('ToolbarMenuPrimitives certificate', () => {
  it('calls onSelect when a choice row is picked and closes the menu', async () => {
    const user = userEvent.setup();
    const onNewest = vi.fn();
    const onOldest = vi.fn();
    render(
      <Menu>
        <ToolbarMenuChoiceItem
          active
          label='Newest first'
          onSelect={onNewest}
        />
        <ToolbarMenuChoiceItem
          active={false}
          label='Oldest first'
          onSelect={onOldest}
        />
      </Menu>
    );
    await user.click(screen.getByRole('button', { name: 'Sort' }));
    expect(
      screen.getByRole('menuitem', { name: 'Newest first' })
    ).toHaveAttribute('data-selected', 'true');
    expect(
      screen.getByRole('menuitem', { name: 'Oldest first' })
    ).not.toHaveAttribute('data-selected');
    await expectNoA11yViolations(screen.getByRole('menu'));
    await user.click(screen.getByRole('menuitem', { name: 'Oldest first' }));
    expect(onOldest).toHaveBeenCalledTimes(1);
    expect(onNewest).not.toHaveBeenCalled();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('selects a row from the keyboard', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <Menu>
        <ToolbarMenuChoiceItem
          active={false}
          label='Newest first'
          onSelect={onSelect}
        />
      </Menu>
    );
    await user.click(screen.getByRole('button', { name: 'Sort' }));
    await user.keyboard('{ArrowDown}{Enter}');
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('never calls onSelect for a disabled row', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <Menu>
        <ToolbarMenuChoiceItem
          active={false}
          disabled
          label='Most played'
          onSelect={onSelect}
        />
      </Menu>
    );
    await user.click(screen.getByRole('button', { name: 'Sort' }));
    await user.click(screen.getByRole('menuitem', { name: 'Most played' }));
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('keeps long and RTL rows axe-clean with the trailing check', async () => {
    const user = userEvent.setup();
    const long =
      'Sort by the most recently released single, EP or album across every connected artist profile';
    render(
      <div dir='rtl' lang='ar'>
        <Menu>
          <ToolbarMenuChoiceItem active label={long} onSelect={vi.fn()} />
          <ToolbarMenuChoiceItem
            active={false}
            label='الأحدث أولاً'
            trailingVisual={<span>12</span>}
            onSelect={vi.fn()}
          />
        </Menu>
      </div>
    );
    await user.click(screen.getByRole('button', { name: 'Sort' }));
    const longRow = screen.getByRole('menuitem', { name: long });
    expect(longRow.querySelector('.truncate')).toHaveTextContent(long);
    expect(longRow.querySelector('[data-menu-trailing] svg')).toBeTruthy();
    expect(
      screen.getByRole('menuitem', { name: /الأحدث أولاً/ })
    ).toHaveTextContent('12');
    await expectNoA11yViolations(screen.getByRole('menu'));
  });
});
