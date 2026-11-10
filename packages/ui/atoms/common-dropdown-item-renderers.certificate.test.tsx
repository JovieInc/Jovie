import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Pencil } from 'lucide-react';
import type * as React from 'react';
import { describe, expect, it, vi } from 'vitest';

import { MENU_ITEM_BASE } from '../lib/dropdown-styles';
import { expectNoA11yViolations } from '../test-utils/a11y';

import {
  CommonDropdownItemLabel,
  renderActionItem,
  renderActionRow,
  renderCheckboxItem,
  renderLabel,
  renderRadioGroup,
  renderSeparator,
} from './common-dropdown-item-renderers';
import type { MenuRenderContext } from './common-dropdown-renderer';

const context: MenuRenderContext = {
  kind: 'dropdown',
  itemBase: MENU_ITEM_BASE,
  disablePortal: false,
};

// The renderers only produce rows; Radix requires them inside an open menu.
// The menu portals to document.body, so axe runs on the menu element itself.
function OpenMenu({ children }: { readonly children: React.ReactNode }) {
  return (
    <DropdownMenuPrimitive.Root defaultOpen modal={false}>
      <DropdownMenuPrimitive.Trigger>
        Release actions
      </DropdownMenuPrimitive.Trigger>
      <DropdownMenuPrimitive.Portal>
        <DropdownMenuPrimitive.Content aria-label='Release actions'>
          {children}
        </DropdownMenuPrimitive.Content>
      </DropdownMenuPrimitive.Portal>
    </DropdownMenuPrimitive.Root>
  );
}

describe('common dropdown item renderers: interaction', () => {
  it('runs an action item handler when the row is chosen', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <OpenMenu>
        {renderActionItem(
          {
            id: 'edit',
            type: 'action',
            label: 'Edit release',
            icon: Pencil,
            onClick,
          },
          context
        )}
      </OpenMenu>
    );

    await user.click(screen.getByRole('menuitem', { name: 'Edit release' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('marks a loading row busy and never runs its handler', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <OpenMenu>
        {renderActionItem(
          {
            id: 'publish',
            type: 'action',
            label: 'Publish release',
            loading: true,
            onClick,
          },
          context
        )}
      </OpenMenu>
    );

    const row = screen.getByRole('menuitem', { name: 'Publish release' });
    expect(row).toHaveAttribute('aria-busy', 'true');
    expect(row).toHaveAttribute('data-disabled');
    await user.click(row);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('shows a check on a selected row that has no trailing content', () => {
    render(
      <OpenMenu>
        {renderActionItem(
          {
            id: 'sort-newest',
            type: 'action',
            label: 'Newest first',
            selected: true,
            onClick: () => undefined,
          },
          context
        )}
      </OpenMenu>
    );

    const row = screen.getByRole('menuitem', { name: 'Newest first' });
    expect(row).toHaveAttribute('data-selected', 'true');
    expect(row.querySelector('svg.lucide-check')).not.toBeNull();
  });

  it('toggles a checkbox row through onCheckedChange', async () => {
    const user = userEvent.setup();
    const onCheckedChange = vi.fn();
    render(
      <OpenMenu>
        {renderCheckboxItem(
          {
            id: 'show-drafts',
            type: 'checkbox',
            label: 'Show drafts',
            checked: false,
            count: 3,
            onCheckedChange,
          },
          context
        )}
      </OpenMenu>
    );

    const row = screen.getByRole('menuitemcheckbox', { name: /Show drafts/ });
    expect(row).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByText('3')).toHaveAttribute(
      'data-slot',
      'common-dropdown-count'
    );
    await user.click(row);
    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });

  it('selects a radio row through the group onValueChange', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(
      <OpenMenu>
        {renderRadioGroup(
          {
            id: 'density',
            type: 'radio',
            value: 'compact',
            onValueChange,
            items: [
              { id: 'compact', label: 'Compact', value: 'compact' },
              { id: 'comfortable', label: 'Comfortable', value: 'comfortable' },
            ],
          },
          context
        )}
      </OpenMenu>
    );

    expect(
      screen.getByRole('menuitemradio', { name: 'Compact' })
    ).toHaveAttribute('aria-checked', 'true');
    await user.click(
      screen.getByRole('menuitemradio', { name: 'Comfortable' })
    );
    expect(onValueChange).toHaveBeenCalledWith('comfortable');
  });
});

describe('common dropdown item renderers: accessibility', () => {
  it('has no axe violations for a full menu of rendered rows', async () => {
    render(
      <OpenMenu>
        {renderLabel(
          { id: 'label', type: 'label', label: 'Release' },
          'dropdown'
        )}
        {renderActionItem(
          {
            id: 'edit',
            type: 'action',
            label: 'Edit release',
            description: 'Artwork, credits and territories',
            icon: Pencil,
            shortcut: '⌘E',
            onClick: () => undefined,
          },
          context
        )}
        {renderActionItem(
          {
            id: 'publish',
            type: 'action',
            label: 'Publish release',
            loading: true,
            onClick: () => undefined,
          },
          context
        )}
        {renderSeparator({ id: 'sep', type: 'separator' }, 'dropdown')}
        {renderCheckboxItem(
          {
            id: 'show-drafts',
            type: 'checkbox',
            label: 'Show drafts',
            checked: true,
            onCheckedChange: () => undefined,
          },
          context
        )}
        {renderRadioGroup(
          {
            id: 'density',
            type: 'radio',
            value: 'compact',
            onValueChange: () => undefined,
            items: [
              { id: 'compact', label: 'Compact', value: 'compact' },
              { id: 'comfortable', label: 'Comfortable', value: 'comfortable' },
            ],
          },
          context
        )}
        {renderActionRow(
          {
            id: 'row',
            type: 'action-row',
            items: [
              {
                id: 'remove',
                type: 'action',
                label: 'Remove release',
                variant: 'destructive',
                onClick: () => undefined,
              },
            ],
          },
          context
        )}
      </OpenMenu>
    );

    await expectNoA11yViolations(await screen.findByRole('menu'));
  });

  it('has no axe violations for long right-to-left labels', async () => {
    const { container } = render(
      <div dir='rtl'>
        <CommonDropdownItemLabel
          label='تعديل تفاصيل الإصدار والغلاف وبيانات المشاركين والأقاليم'
          description='يظهر للجميع على الملف الشخصي العام بعد النشر'
        />
      </div>
    );

    expect(
      screen.getByText(
        'تعديل تفاصيل الإصدار والغلاف وبيانات المشاركين والأقاليم'
      )
    ).toHaveClass('truncate');
    await expectNoA11yViolations(container);
  });
});
