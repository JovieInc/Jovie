import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { SearchableSubmenuItem } from './searchable-submenu';
import { SearchableList } from './searchable-submenu';

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

describe('SearchableList', () => {
  describe('Rendering', () => {
    it('renders all items as options in accessible select', () => {
      render(<SearchableList items={sampleItems} onSelect={vi.fn()} />);
      const options = screen.getAllByRole('option');
      // 5 items + 1 disabled placeholder
      expect(options.length).toBe(6);
    });

    it('renders all items as visual buttons', () => {
      const { container } = render(
        <SearchableList items={sampleItems} onSelect={vi.fn()} />
      );
      const visual = getVisualContainer(container);
      const buttons = visual.querySelectorAll('button');
      expect(buttons.length).toBe(5);
    });

    it('renders search input', () => {
      render(<SearchableList items={sampleItems} onSelect={vi.fn()} />);
      expect(screen.getByPlaceholderText('Search...')).toBeInTheDocument();
    });

    it('renders item descriptions', () => {
      render(<SearchableList items={sampleItems} onSelect={vi.fn()} />);
      expect(screen.getByText('A yellow fruit')).toBeInTheDocument();
    });

    it('renders item badges', () => {
      render(<SearchableList items={sampleItems} onSelect={vi.fn()} />);
      expect(screen.getByText('10')).toBeInTheDocument();
    });

    it('renders custom search placeholder', () => {
      render(
        <SearchableList
          items={sampleItems}
          onSelect={vi.fn()}
          searchPlaceholder='Find fruits...'
        />
      );
      expect(screen.getByPlaceholderText('Find fruits...')).toBeInTheDocument();
    });

    it('renders header when provided', () => {
      render(
        <SearchableList
          items={sampleItems}
          onSelect={vi.fn()}
          header={<div data-testid='header'>Header</div>}
        />
      );
      expect(screen.getByTestId('header')).toBeInTheDocument();
    });

    it('renders footer when provided', () => {
      render(
        <SearchableList
          items={sampleItems}
          onSelect={vi.fn()}
          footer={<div data-testid='footer'>Footer</div>}
        />
      );
      expect(screen.getByTestId('footer')).toBeInTheDocument();
    });

    it('applies custom className', () => {
      const { container } = render(
        <SearchableList
          items={sampleItems}
          onSelect={vi.fn()}
          className='custom-list'
        />
      );
      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper.className).toContain('custom-list');
    });
  });

  describe('Searching', () => {
    it('filters items by label', async () => {
      const user = userEvent.setup({ delay: null });
      const { container } = render(
        <SearchableList items={sampleItems} onSelect={vi.fn()} />
      );

      await user.type(screen.getByPlaceholderText('Search...'), 'App');

      const visual = getVisualContainer(container);
      expect(within(visual).getByText('Apple')).toBeInTheDocument();
      expect(within(visual).queryByText('Banana')).not.toBeInTheDocument();
      expect(within(visual).queryByText('Cherry')).not.toBeInTheDocument();
    });

    it('filters items by description', async () => {
      const user = userEvent.setup({ delay: null });
      const { container } = render(
        <SearchableList items={sampleItems} onSelect={vi.fn()} />
      );

      await user.type(screen.getByPlaceholderText('Search...'), 'yellow');

      const visual = getVisualContainer(container);
      expect(within(visual).getByText('Banana')).toBeInTheDocument();
      expect(within(visual).queryByText('Apple')).not.toBeInTheDocument();
    });

    it('is case insensitive', async () => {
      const user = userEvent.setup({ delay: null });
      const { container } = render(
        <SearchableList items={sampleItems} onSelect={vi.fn()} />
      );

      await user.type(screen.getByPlaceholderText('Search...'), 'APPLE');

      const visual = getVisualContainer(container);
      expect(within(visual).getByText('Apple')).toBeInTheDocument();
    });

    it('shows empty message when no results', async () => {
      const user = userEvent.setup({ delay: null });
      render(<SearchableList items={sampleItems} onSelect={vi.fn()} />);

      await user.type(screen.getByPlaceholderText('Search...'), 'xyz');

      expect(screen.getByText('No results found')).toBeInTheDocument();
    });

    it('shows custom empty message', async () => {
      const user = userEvent.setup({ delay: null });
      render(
        <SearchableList
          items={sampleItems}
          onSelect={vi.fn()}
          emptyMessage='Nothing found'
        />
      );

      await user.type(screen.getByPlaceholderText('Search...'), 'xyz');

      expect(screen.getByText('Nothing found')).toBeInTheDocument();
    });

    it('uses custom filter function', async () => {
      const customFilter = (item: SearchableSubmenuItem, query: string) =>
        item.id.includes(query);

      const user = userEvent.setup({ delay: null });
      const { container } = render(
        <SearchableList
          items={sampleItems}
          onSelect={vi.fn()}
          filterFn={customFilter}
        />
      );

      await user.type(screen.getByPlaceholderText('Search...'), 'item-1');

      const visual = getVisualContainer(container);
      expect(within(visual).getByText('Apple')).toBeInTheDocument();
      expect(within(visual).queryByText('Banana')).not.toBeInTheDocument();
    });

    it('shows all items when search is cleared', async () => {
      const user = userEvent.setup({ delay: null });
      const { container } = render(
        <SearchableList items={sampleItems} onSelect={vi.fn()} />
      );
      const visual = getVisualContainer(container);

      const searchInput = screen.getByPlaceholderText('Search...');
      await user.type(searchInput, 'App');

      expect(within(visual).queryByText('Banana')).not.toBeInTheDocument();

      await user.clear(searchInput);

      expect(within(visual).getByText('Apple')).toBeInTheDocument();
      expect(within(visual).getByText('Banana')).toBeInTheDocument();
    });
  });

  describe('Item Selection', () => {
    it('calls onSelect when item is clicked', async () => {
      const onSelect = vi.fn();
      const user = userEvent.setup({ delay: null });
      const { container } = render(
        <SearchableList items={sampleItems} onSelect={onSelect} />
      );

      const appleButton = getItemButton(container, 'Apple');
      await user.click(appleButton);

      expect(onSelect).toHaveBeenCalledWith(sampleItems[0]);
    });

    it('does not call onSelect for disabled items', async () => {
      const onSelect = vi.fn();
      const user = userEvent.setup({ delay: null });
      const { container } = render(
        <SearchableList items={sampleItems} onSelect={onSelect} />
      );

      const dateButton = getItemButton(container, 'Date');
      await user.click(dateButton);

      expect(onSelect).not.toHaveBeenCalled();
    });
  });

  describe('Disabled Items', () => {
    it('marks disabled items with data-disabled attribute', () => {
      const { container } = render(
        <SearchableList items={sampleItems} onSelect={vi.fn()} />
      );
      const dateButton = getItemButton(container, 'Date');
      expect(dateButton).toHaveAttribute('data-disabled', 'true');
    });

    it('disables the button for disabled items', () => {
      const { container } = render(
        <SearchableList items={sampleItems} onSelect={vi.fn()} />
      );
      const dateButton = getItemButton(container, 'Date');
      expect(dateButton).toBeDisabled();
    });
  });

  describe('Keyboard Navigation', () => {
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

  describe('Accessibility', () => {
    it('has a screen-reader-only select element', () => {
      render(<SearchableList items={sampleItems} onSelect={vi.fn()} />);
      const select = screen.getByRole('listbox', { name: 'Search results' });
      expect(select).toBeInTheDocument();
      expect(select.className).toContain('sr-only');
    });

    it('select contains options for all items', () => {
      render(<SearchableList items={sampleItems} onSelect={vi.fn()} />);
      const options = screen.getAllByRole('option');
      // +1 for the disabled "Select an item" option
      expect(options.length).toBe(sampleItems.length + 1);
    });

    it('selects item via the accessible select element', () => {
      const onSelect = vi.fn();
      render(<SearchableList items={sampleItems} onSelect={onSelect} />);
      const select = screen.getByRole('listbox', { name: 'Search results' });

      fireEvent.change(select, { target: { value: 'item-1' } });

      expect(onSelect).toHaveBeenCalledWith(sampleItems[0]);
    });
  });

  describe('Empty State', () => {
    it('shows empty message for empty items array', () => {
      render(<SearchableList items={[]} onSelect={vi.fn()} />);
      expect(screen.getByText('No results found')).toBeInTheDocument();
    });
  });

  describe('Item Icons', () => {
    it('renders icons when provided', () => {
      const items: SearchableSubmenuItem[] = [
        {
          id: '1',
          label: 'With Icon',
          icon: <span data-testid='custom-icon'>★</span>,
        },
      ];
      render(<SearchableList items={items} onSelect={vi.fn()} />);
      expect(screen.getByTestId('custom-icon')).toBeInTheDocument();
    });
  });
});
