import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { MENU_ITEM_BASE } from '../lib/dropdown-styles';
import { expectNoA11yViolations } from '../test-utils/a11y';
import {
  type MenuRenderContext,
  renderItem,
  renderRootBody,
  SearchableContent,
} from './common-dropdown-renderer';
import type { CommonDropdownItem } from './common-dropdown-types';

const context: MenuRenderContext = {
  kind: 'dropdown',
  itemBase: MENU_ITEM_BASE,
  disablePortal: false,
};

const moveTo: CommonDropdownItem = {
  id: 'move',
  type: 'submenu',
  label: 'Move to',
  searchable: true,
  items: [
    { id: 'drafts', type: 'action', label: 'Drafts', onClick: vi.fn() },
    { id: 'archive', type: 'action', label: 'Archive', onClick: vi.fn() },
    { id: 'playlist', type: 'action', label: 'Playlist', onClick: vi.fn() },
  ],
};

// The menu portals to document.body, so axe runs on the menu element itself.
function OpenMenu({
  items,
  isLoading = false,
  dir,
  tick = 0,
}: {
  readonly items: readonly CommonDropdownItem[];
  readonly isLoading?: boolean;
  readonly dir?: 'ltr' | 'rtl';
  readonly tick?: number;
}) {
  return (
    <DropdownMenuPrimitive.Root open modal={false} dir={dir}>
      <DropdownMenuPrimitive.Trigger>
        Release actions
      </DropdownMenuPrimitive.Trigger>
      <DropdownMenuPrimitive.Portal>
        <DropdownMenuPrimitive.Content
          aria-label='Release actions'
          data-tick={tick}
        >
          {renderRootBody({
            isLoading,
            items,
            emptyMessage: 'No actions found',
            renderItems: rows => rows.map(row => renderItem(row, context)),
          })}
        </DropdownMenuPrimitive.Content>
      </DropdownMenuPrimitive.Portal>
    </DropdownMenuPrimitive.Root>
  );
}

function ControlledSearch({ tick = 0 }: { readonly tick?: number }) {
  const [query, setQuery] = useState('');
  return (
    <div data-tick={tick}>
      <SearchableContent
        query={query}
        placeholder='Search actions'
        onQueryChange={setQuery}
        onClear={() => setQuery('')}
      />
    </div>
  );
}

describe('common dropdown renderer: certificate states', () => {
  it.each([
    ['loading', { items: [], isLoading: true }, 'Loading menu items'],
    ['empty', { items: [] }, 'No actions found'],
  ] as const)(
    'has no axe violations in the %s state',
    async (_n, props, text) => {
      render(<OpenMenu {...props} />);
      const menu = await screen.findByRole('menu', { name: 'Release actions' });
      expect(screen.getByRole('status')).toHaveTextContent(text);
      await expectNoA11yViolations(menu);
    }
  );

  it('has no axe violations with rows and a submenu, left to right and right to left', async () => {
    const { rerender } = render(<OpenMenu items={[moveTo]} />);
    let menu = await screen.findByRole('menu', { name: 'Release actions' });
    expect(screen.getByRole('menuitem', { name: 'Move to' })).toHaveAttribute(
      'aria-haspopup',
      'menu'
    );
    await expectNoA11yViolations(menu);

    rerender(<OpenMenu items={[moveTo]} dir='rtl' />);
    menu = await screen.findByRole('menu', { name: 'Release actions' });
    expect(menu).toHaveAttribute('dir', 'rtl');
    await expectNoA11yViolations(menu);
  });

  it('has no axe violations for the search field with and without a query', async () => {
    const user = userEvent.setup();
    const { container } = render(<ControlledSearch />);
    await expectNoA11yViolations(container);
    await user.type(
      screen.getByRole('textbox', { name: 'Search actions' }),
      'a'
    );
    expect(screen.getByRole('button', { name: 'Clear search' })).toBeVisible();
    await expectNoA11yViolations(container);
  });
});

describe('common dropdown renderer: input retention', () => {
  it('keeps typed search text and focus through a parent rerender and Escape, then clears in place', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<ControlledSearch />);
    const input = screen.getByRole('textbox', { name: 'Search actions' });

    await user.type(input, 'artist');
    rerender(<ControlledSearch tick={1} />);
    expect(input).toHaveValue('artist');
    expect(input).toHaveFocus();

    // The field leaves Escape to its menu; on its own it keeps the text.
    await user.keyboard('{Escape}');
    expect(input).toHaveValue('artist');
    expect(input).toHaveFocus();

    await user.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(input).toHaveValue('');
    expect(input).toHaveFocus();
  });

  it('keeps a searchable submenu query through a parent rerender, then Escape clears it without closing', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<OpenMenu items={[moveTo]} />);

    await user.click(await screen.findByRole('menuitem', { name: 'Move to' }));
    const input = await screen.findByRole('textbox', {
      name: 'Search Move to',
    });
    await waitFor(() => expect(input).toHaveFocus());

    // The field already holds focus, so type without moving the pointer off
    // the submenu (which would start Radix's pointer-grace close).
    await user.type(input, 'ar', { skipClick: true });
    expect(screen.getByRole('menuitem', { name: 'Archive' })).toBeVisible();
    expect(screen.queryByRole('menuitem', { name: 'Drafts' })).toBeNull();

    rerender(<OpenMenu items={[moveTo]} tick={1} />);
    expect(input).toHaveValue('ar');
    expect(input).toHaveFocus();

    await user.keyboard('{Escape}');
    expect(input).toHaveValue('');
    expect(input).toHaveFocus();
    expect(screen.getByRole('menuitem', { name: 'Drafts' })).toBeVisible();
  });
});
