import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  ContextMenu,
  ContextMenuCheckboxItem,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from './context-menu';

describe('ContextMenu RTL', () => {
  it('mirrors the submenu chevron and uses logical row padding', async () => {
    render(
      <div dir='rtl' lang='ar'>
        <ContextMenu>
          <ContextMenuTrigger>منطقة</ContextMenuTrigger>
          <ContextMenuContent>
            <ContextMenuCheckboxItem checked>إظهار</ContextMenuCheckboxItem>
            <ContextMenuSub>
              <ContextMenuSubTrigger>نقل إلى</ContextMenuSubTrigger>
              <ContextMenuSubContent>
                <ContextMenuItem>مجلد</ContextMenuItem>
              </ContextMenuSubContent>
            </ContextMenuSub>
          </ContextMenuContent>
        </ContextMenu>
      </div>
    );
    fireEvent.contextMenu(screen.getByText('منطقة'));
    const checkbox = await screen.findByRole('menuitemcheckbox', {
      name: 'إظهار',
    });
    expect(checkbox).toHaveClass('ps-7', 'pe-2');
    expect(checkbox.querySelector('span.absolute')).toHaveClass('start-2');
    const chevron = screen
      .getByRole('menuitem', { name: 'نقل إلى' })
      .querySelector('svg');
    expect(chevron).toHaveClass('ms-auto', 'rtl:rotate-180');
  });
});
