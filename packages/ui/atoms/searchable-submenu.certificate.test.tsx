import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '../test-utils/a11y';

import type {
  SearchableSubmenuItem,
  SearchableSubmenuSection,
} from './searchable-submenu';
import { SearchableList, SearchableSubmenu } from './searchable-submenu';

// Sample items for testing
const sampleItems: SearchableSubmenuItem[] = [
  { id: 'item-1', label: 'Apple' },
  { id: 'item-2', label: 'Banana', description: 'A yellow fruit' },
  { id: 'item-3', label: 'Cherry', badge: '10' },
  { id: 'item-4', label: 'Date', disabled: true },
  { id: 'item-5', label: 'Elderberry', shortcut: '⌘E' },
];

/**
 * Helper to get the visual items container (aria-hidden div with buttons).
 * SearchableList renders items in two places: an sr-only <select> for
 * accessibility and visual <button> elements. This helper scopes queries
 * to the visual container to avoid duplicate text match errors.
 */
function getVisualContainer(container: HTMLElement): HTMLElement {
  // Target the div (not SVG icons which also have aria-hidden)
  const el = container.querySelector('div[aria-hidden="true"]');
  if (!el) throw new Error('Visual container not found');
  return el as HTMLElement;
}

/** Get a visual item button by label text */
function getItemButton(container: HTMLElement, label: string): HTMLElement {
  const visual = getVisualContainer(container);
  return within(visual).getByText(label).closest('button')!;
}

describe('SearchableSubmenu certificate coverage', () => {
  const sections = [
    {
      id: 'platforms',
      label: 'Platforms',
      items: [
        { id: 'spotify', label: 'Spotify' },
        { id: 'youtube', label: 'YouTube', disabled: true },
        { id: 'apple', label: 'Apple Music' },
      ],
    },
  ] satisfies SearchableSubmenuSection[];

  function renderSubmenu(onSelect = vi.fn()) {
    return render(
      <DropdownMenuPrimitive.Root defaultOpen>
        <DropdownMenuPrimitive.Trigger>Actions</DropdownMenuPrimitive.Trigger>
        <DropdownMenuPrimitive.Portal>
          <DropdownMenuPrimitive.Content>
            <SearchableSubmenu
              triggerLabel='Choose platform'
              sections={sections}
              onSelect={onSelect}
            />
          </DropdownMenuPrimitive.Content>
        </DropdownMenuPrimitive.Portal>
      </DropdownMenuPrimitive.Root>
    );
  }

  it('has no axe violations when the submenu is open', async () => {
    const user = userEvent.setup({ delay: null });
    renderSubmenu();

    await user.hover(screen.getByText('Choose platform'));
    await screen.findByRole('combobox', { name: 'Search...' });
    const content = document.querySelector(
      '[data-slot="searchable-submenu-content"]'
    );
    expect(content).toBeInTheDocument();
    await expectNoA11yViolations(content as Element);
  });
});

describe('SearchableList input retention and accessibility', () => {
  it('keeps typed text when the parent re-renders', async () => {
    const user = userEvent.setup({ delay: null });
    function Host({ tick }: { readonly tick: number }) {
      return (
        <div data-tick={tick}>
          <SearchableList items={[...sampleItems]} onSelect={vi.fn()} />
        </div>
      );
    }
    const { rerender } = render(<Host tick={0} />);
    const input = screen.getByPlaceholderText('Search...');

    await user.type(input, 'ban');
    rerender(<Host tick={1} />);

    expect(screen.getByPlaceholderText('Search...')).toBe(input);
    expect(input).toHaveValue('ban');
    expect(input).toHaveFocus();
  });

  it('has no axe violations with results, no results and right-to-left items', async () => {
    const { container, rerender } = render(
      <SearchableList items={sampleItems} onSelect={vi.fn()} />
    );
    await expectNoA11yViolations(container);

    rerender(
      <SearchableList
        items={[]}
        onSelect={vi.fn()}
        emptyMessage='No platforms match'
      />
    );
    await expectNoA11yViolations(container);

    rerender(
      <div dir='rtl'>
        <SearchableList
          items={[
            {
              id: 'rtl-1',
              label: 'آبل ميوزك للفنانين مع الكتالوج الكامل للإصدارات',
              description: 'متصل عبر حساب التوزيع',
            },
          ]}
          onSelect={vi.fn()}
          placeholder='ابحث عن منصة'
        />
      </div>
    );
    await expectNoA11yViolations(container);
  });
});

describe('SearchableList keyboard navigation', () => {
  it('highlights first item by default', () => {
    const { container } = render(
      <SearchableList items={sampleItems} onSelect={vi.fn()} />
    );
    const firstItem = getItemButton(container, 'Apple');
    expect(firstItem).toHaveAttribute('data-highlighted', 'true');
  });

  it('moves highlight down with ArrowDown', () => {
    const { container } = render(
      <SearchableList items={sampleItems} onSelect={vi.fn()} />
    );
    const searchInput = screen.getByPlaceholderText('Search...');

    fireEvent.keyDown(searchInput, { key: 'ArrowDown' });

    const secondItem = getItemButton(container, 'Banana');
    expect(secondItem).toHaveAttribute('data-highlighted', 'true');
  });

  it('stays on the first option when every option is disabled', () => {
    const items: SearchableSubmenuItem[] = [
      { id: '1', label: 'Closed', disabled: true },
      { id: '2', label: 'Also closed', disabled: true },
    ];
    const { container } = render(
      <SearchableList items={items} onSelect={vi.fn()} />
    );

    fireEvent.keyDown(screen.getByPlaceholderText('Search...'), {
      key: 'ArrowDown',
    });

    expect(getItemButton(container, 'Closed')).toHaveAttribute(
      'data-highlighted',
      'true'
    );
    expect(getItemButton(container, 'Also closed')).not.toHaveAttribute(
      'data-highlighted'
    );
  });

  it('skips disabled options during keyboard navigation', () => {
    const items: SearchableSubmenuItem[] = [
      { id: '1', label: 'First' },
      { id: '2', label: 'Unavailable', disabled: true },
      { id: '3', label: 'Third' },
    ];
    const { container } = render(
      <SearchableList items={items} onSelect={vi.fn()} />
    );

    fireEvent.keyDown(screen.getByPlaceholderText('Search...'), {
      key: 'ArrowDown',
    });

    expect(getItemButton(container, 'Third')).toHaveAttribute(
      'data-highlighted',
      'true'
    );
    expect(getItemButton(container, 'Unavailable')).not.toHaveAttribute(
      'data-highlighted'
    );
  });

  it('moves highlight up with ArrowUp', () => {
    const { container } = render(
      <SearchableList items={sampleItems} onSelect={vi.fn()} />
    );
    const searchInput = screen.getByPlaceholderText('Search...');

    // Move down first, then up
    fireEvent.keyDown(searchInput, { key: 'ArrowDown' });
    fireEvent.keyDown(searchInput, { key: 'ArrowUp' });

    const firstItem = getItemButton(container, 'Apple');
    expect(firstItem).toHaveAttribute('data-highlighted', 'true');
  });

  it('wraps around when going past last item', () => {
    const items: SearchableSubmenuItem[] = [
      { id: '1', label: 'First' },
      { id: '2', label: 'Second' },
    ];
    const { container } = render(
      <SearchableList items={items} onSelect={vi.fn()} />
    );
    const searchInput = screen.getByPlaceholderText('Search...');

    fireEvent.keyDown(searchInput, { key: 'ArrowDown' });
    fireEvent.keyDown(searchInput, { key: 'ArrowDown' });

    const firstItem = getItemButton(container, 'First');
    expect(firstItem).toHaveAttribute('data-highlighted', 'true');
  });

  it('wraps around when going before first item', () => {
    const items: SearchableSubmenuItem[] = [
      { id: '1', label: 'First' },
      { id: '2', label: 'Second' },
    ];
    const { container } = render(
      <SearchableList items={items} onSelect={vi.fn()} />
    );
    const searchInput = screen.getByPlaceholderText('Search...');

    fireEvent.keyDown(searchInput, { key: 'ArrowUp' });

    const lastItem = getItemButton(container, 'Second');
    expect(lastItem).toHaveAttribute('data-highlighted', 'true');
  });

  it('selects item on Enter', () => {
    const onSelect = vi.fn();
    render(<SearchableList items={sampleItems} onSelect={onSelect} />);
    const searchInput = screen.getByPlaceholderText('Search...');

    fireEvent.keyDown(searchInput, { key: 'Enter' });

    expect(onSelect).toHaveBeenCalledWith(sampleItems[0]);
  });

  it('does not select disabled item on Enter', () => {
    const onSelect = vi.fn();
    const items: SearchableSubmenuItem[] = [
      { id: '1', label: 'Disabled', disabled: true },
    ];
    render(<SearchableList items={items} onSelect={onSelect} />);
    const searchInput = screen.getByPlaceholderText('Search...');

    fireEvent.keyDown(searchInput, { key: 'Enter' });

    expect(onSelect).not.toHaveBeenCalled();
  });

  it('highlights item on mouse enter', async () => {
    const user = userEvent.setup({ delay: null });
    const { container } = render(
      <SearchableList items={sampleItems} onSelect={vi.fn()} />
    );

    const cherryButton = getItemButton(container, 'Cherry');
    await user.hover(cherryButton);

    expect(cherryButton).toHaveAttribute('data-highlighted', 'true');
  });
});
