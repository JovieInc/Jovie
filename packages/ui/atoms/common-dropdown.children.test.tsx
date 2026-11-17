import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '../test-utils/a11y';
import { CommonDropdown } from './common-dropdown';
import type { CommonDropdownItem } from './common-dropdown-types';

// APG Menu: a menu owns only menuitems, groups and separators. Anything
// else (a textbox, a status line) has to sit inside an owned group or item.
const MENU_CHILD_ROLES = new Set([
  'group',
  'menuitem',
  'menuitemcheckbox',
  'menuitemradio',
  'menu',
  'separator',
]);

function ownedRoles(menu: Element): string[] {
  const roles: string[] = [];
  const visit = (node: Element) => {
    for (const child of Array.from(node.children)) {
      const role = child.getAttribute('role');
      if (child.getAttribute('aria-hidden') === 'true') continue;
      if (role === 'none' || role === 'presentation' || role === null) {
        if (role === null && !['DIV', 'SPAN'].includes(child.tagName)) {
          roles.push(child.tagName.toLowerCase());
          continue;
        }
        visit(child);
        continue;
      }
      roles.push(role);
    }
  };
  visit(menu);
  return roles;
}

const items: CommonDropdownItem[] = [
  { type: 'action', id: 'edit', label: 'Edit', onClick: vi.fn() },
];

describe('CommonDropdown owned menu children', () => {
  it.each([
    ['loading', { items, isLoading: true }],
    ['empty', { items: [] as CommonDropdownItem[] }],
  ])('a %s menu owns only menu roles', async (_name, props) => {
    render(<CommonDropdown {...props} open modal={false} />);
    const menu = await screen.findByRole('menu');
    const roles = ownedRoles(menu);
    expect(roles.length).toBeGreaterThan(0);
    expect(roles.filter(role => !MENU_CHILD_ROLES.has(role))).toEqual([]);
    await expectNoA11yViolations(menu);
  });

  it('keeps announcing loading and empty states', async () => {
    const { rerender } = render(
      <CommonDropdown items={items} isLoading open modal={false} />
    );
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Loading menu items'
    );
    rerender(<CommonDropdown items={[]} open modal={false} />);
    expect(screen.getByRole('status')).toHaveTextContent('No items found');
    const emptyRow = screen.getByRole('menuitem', { name: 'No items found' });
    expect(emptyRow).toHaveAttribute('aria-disabled', 'true');
  });
});
