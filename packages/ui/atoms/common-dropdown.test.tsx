import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Settings, Star } from 'lucide-react';
import { describe, expect, it, vi } from 'vitest';
import { CommonDropdown } from './common-dropdown';
import type { CommonDropdownItem } from './common-dropdown-types';

// Basic action items for testing
const basicItems: CommonDropdownItem[] = [
  { type: 'action', id: 'edit', label: 'Edit', onClick: vi.fn() },
  { type: 'separator', id: 'sep-1' },
  {
    type: 'action',
    id: 'delete',
    label: 'Delete',
    onClick: vi.fn(),
    variant: 'destructive',
  },
];

describe('CommonDropdown', () => {
  describe('Default Trigger', () => {
    it('renders default button trigger', () => {
      render(<CommonDropdown items={basicItems} />);
      expect(
        screen.getByRole('button', { name: 'More actions' })
      ).toBeInTheDocument();
    });

    it('renders select-style trigger', () => {
      render(<CommonDropdown items={basicItems} defaultTriggerType='select' />);
      expect(
        screen.getByRole('button', { name: 'Open dropdown' })
      ).toBeInTheDocument();
      expect(screen.getByText('Select...')).toBeInTheDocument();
    });

    it('uses custom aria-label', () => {
      render(<CommonDropdown items={basicItems} aria-label='Custom actions' />);
      expect(
        screen.getByRole('button', { name: 'Custom actions' })
      ).toBeInTheDocument();
    });

    it('renders custom trigger', () => {
      render(
        <CommonDropdown
          items={basicItems}
          trigger={<button type='button'>Custom</button>}
        />
      );
      expect(
        screen.getByRole('button', { name: 'Custom' })
      ).toBeInTheDocument();
    });
  });

  describe('Opening and Closing', () => {
    it('opens on trigger click', async () => {
      const user = userEvent.setup({ delay: null });
      render(<CommonDropdown items={basicItems} />);

      await user.click(screen.getByRole('button', { name: 'More actions' }));

      await waitFor(() => {
        expect(screen.getByRole('menu')).toBeInTheDocument();
      });
    });

    it('shows items when open', async () => {
      render(<CommonDropdown items={basicItems} open={true} />);

      await waitFor(() => {
        expect(screen.getByText('Edit')).toBeInTheDocument();
        expect(screen.getByText('Delete')).toBeInTheDocument();
      });
    });

    it('works in controlled mode', () => {
      const onOpenChange = vi.fn();
      const { rerender } = render(
        <CommonDropdown
          items={basicItems}
          open={false}
          onOpenChange={onOpenChange}
        />
      );
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();

      rerender(
        <CommonDropdown
          items={basicItems}
          open={true}
          onOpenChange={onOpenChange}
        />
      );
      expect(screen.getByRole('menu')).toBeInTheDocument();
    });

    it('calls onOpenChange when trigger is clicked', async () => {
      const onOpenChange = vi.fn();
      const user = userEvent.setup({ delay: null });
      render(<CommonDropdown items={basicItems} onOpenChange={onOpenChange} />);

      await user.click(screen.getByRole('button', { name: 'More actions' }));
      expect(onOpenChange).toHaveBeenCalledWith(true);
    });
  });

  describe('Action Items', () => {
    it('renders action items', () => {
      render(<CommonDropdown items={basicItems} open={true} />);
      expect(screen.getByText('Edit')).toBeInTheDocument();
      expect(screen.getByText('Delete')).toBeInTheDocument();
    });

    it('calls onClick when action item is clicked', async () => {
      const onClick = vi.fn();
      const items: CommonDropdownItem[] = [
        { type: 'action', id: 'edit', label: 'Edit', onClick },
      ];
      const user = userEvent.setup({ delay: null });
      render(<CommonDropdown items={items} open={true} />);

      await user.click(screen.getByText('Edit'));
      expect(onClick).toHaveBeenCalled();
    });

    it('renders item with icon', () => {
      const items: CommonDropdownItem[] = [
        {
          type: 'action',
          id: 'settings',
          label: 'Settings',
          icon: Settings,
          onClick: vi.fn(),
        },
      ];
      render(<CommonDropdown items={items} open={true} />);
      expect(screen.getByText('Settings')).toBeInTheDocument();
    });

    it('renders item with badge', () => {
      const items: CommonDropdownItem[] = [
        {
          type: 'action',
          id: 'notifications',
          label: 'Notifications',
          badge: { text: '5' },
          onClick: vi.fn(),
        },
      ];
      render(<CommonDropdown items={items} open={true} />);
      expect(screen.getByText('5')).toBeInTheDocument();
    });

    it('renders item with subText', () => {
      const items: CommonDropdownItem[] = [
        {
          type: 'action',
          id: 'profile',
          label: 'Profile',
          subText: 'user@test.com',
          onClick: vi.fn(),
        },
      ];
      render(<CommonDropdown items={items} open={true} />);
      expect(screen.getByText('user@test.com')).toBeInTheDocument();
    });

    it('renders item with shortcut', () => {
      const items: CommonDropdownItem[] = [
        {
          type: 'action',
          id: 'copy',
          label: 'Copy',
          shortcut: '⌘C',
          onClick: vi.fn(),
        },
      ];
      render(<CommonDropdown items={items} open={true} />);
      expect(screen.getByText('⌘C')).toBeInTheDocument();
    });

    it('renders disabled items', () => {
      const items: CommonDropdownItem[] = [
        {
          type: 'action',
          id: 'disabled',
          label: 'Disabled Item',
          onClick: vi.fn(),
          disabled: true,
        },
      ];
      render(<CommonDropdown items={items} open={true} />);
      const item = screen
        .getByText('Disabled Item')
        .closest('[role="menuitem"]');
      expect(item).toHaveAttribute('data-disabled');
    });

    it('renders selected action state with a trailing check', () => {
      const items: CommonDropdownItem[] = [
        {
          type: 'action',
          id: 'selected',
          label: 'Selected Item',
          onClick: vi.fn(),
          selected: true,
        },
      ];
      render(<CommonDropdown items={items} open={true} />);

      const item = screen
        .getByText('Selected Item')
        .closest('[role="menuitem"]');

      expect(item).toHaveAttribute('data-selected', 'true');
    });

    it('renders danger state as a destructive item variant', () => {
      const items: CommonDropdownItem[] = [
        {
          type: 'action',
          id: 'danger',
          label: 'Remove Access',
          onClick: vi.fn(),
          state: 'danger',
        },
      ];
      render(<CommonDropdown items={items} open={true} />);

      const item = screen
        .getByText('Remove Access')
        .closest('[role="menuitem"]');

      expect(item).toHaveAttribute('data-menu-variant', 'danger');
    });

    it('renders trailing custom content and descriptions', () => {
      const items: CommonDropdownItem[] = [
        {
          type: 'action',
          id: 'details',
          label: 'Detailed Item',
          description: 'Secondary context',
          trailing: <span data-testid='custom-trailing'>Live</span>,
          onClick: vi.fn(),
        },
      ];
      render(<CommonDropdown items={items} open={true} />);

      expect(screen.getByText('Secondary context')).toBeInTheDocument();
      expect(screen.getByTestId('custom-trailing')).toBeInTheDocument();
    });

    it('prevents loading action selection', async () => {
      const onClick = vi.fn();
      const items: CommonDropdownItem[] = [
        {
          type: 'action',
          id: 'loading',
          label: 'Syncing',
          loading: true,
          onClick,
        },
      ];
      const user = userEvent.setup({ delay: null });
      render(<CommonDropdown items={items} open={true} />);

      const item = screen.getByRole('menuitem', { name: 'Syncing' });
      expect(item).toHaveAttribute('data-disabled');

      await user.click(screen.getByText('Syncing'));
      expect(onClick).not.toHaveBeenCalled();
    });

    it('keeps the menu open when closeOnSelect is false', async () => {
      const onClick = vi.fn();
      const onOpenChange = vi.fn();
      const items: CommonDropdownItem[] = [
        {
          type: 'action',
          id: 'pin',
          label: 'Pin',
          closeOnSelect: false,
          onClick,
        },
      ];
      const user = userEvent.setup({ delay: null });
      render(
        <CommonDropdown items={items} open={true} onOpenChange={onOpenChange} />
      );

      await user.click(screen.getByText('Pin'));

      expect(onClick).toHaveBeenCalled();
      expect(onOpenChange).not.toHaveBeenCalledWith(false);
    });
  });

  describe('Separators', () => {
    it('renders separators', () => {
      render(<CommonDropdown items={basicItems} open={true} />);
      const separators = screen.getAllByRole('separator');
      expect(separators.length).toBeGreaterThan(0);
    });
  });

  describe('Labels', () => {
    it('renders label items', () => {
      const items: CommonDropdownItem[] = [
        { type: 'label', id: 'label-1', label: 'Section Header' },
        { type: 'action', id: 'item-1', label: 'Item 1', onClick: vi.fn() },
      ];
      render(<CommonDropdown items={items} open={true} />);
      expect(screen.getByText('Section Header')).toBeInTheDocument();
    });

    it('renders label with inset', () => {
      const items: CommonDropdownItem[] = [
        { type: 'label', id: 'label-1', label: 'Inset Label', inset: true },
      ];
      render(<CommonDropdown items={items} open={true} />);
      const label = screen.getByText('Inset Label');
      expect(label.className).toContain('pl-10');
    });
  });

  describe('Checkbox Items', () => {
    it('renders checkbox items', () => {
      const items: CommonDropdownItem[] = [
        {
          type: 'checkbox',
          id: 'cb-1',
          label: 'Show Toolbar',
          checked: false,
          onCheckedChange: vi.fn(),
        },
      ];
      render(<CommonDropdown items={items} open={true} />);
      expect(
        screen.getByRole('menuitemcheckbox', { name: 'Show Toolbar' })
      ).toBeInTheDocument();
    });

    it('renders checked checkbox', () => {
      const items: CommonDropdownItem[] = [
        {
          type: 'checkbox',
          id: 'cb-1',
          label: 'Show Toolbar',
          checked: true,
          onCheckedChange: vi.fn(),
        },
      ];
      render(<CommonDropdown items={items} open={true} />);
      expect(screen.getByRole('menuitemcheckbox')).toHaveAttribute(
        'data-state',
        'checked'
      );
    });

    it('calls onCheckedChange when toggled', async () => {
      const onCheckedChange = vi.fn();
      const items: CommonDropdownItem[] = [
        {
          type: 'checkbox',
          id: 'cb-1',
          label: 'Show Toolbar',
          checked: false,
          onCheckedChange,
        },
      ];
      const user = userEvent.setup({ delay: null });
      render(<CommonDropdown items={items} open={true} />);

      await user.click(screen.getByRole('menuitemcheckbox'));
      expect(onCheckedChange).toHaveBeenCalledWith(true);
    });

    it('renders checkbox description and count', () => {
      const items: CommonDropdownItem[] = [
        {
          type: 'checkbox',
          id: 'cb-1',
          label: 'Labels',
          description: 'Show release labels',
          checked: false,
          count: 12,
          onCheckedChange: vi.fn(),
        },
      ];
      render(<CommonDropdown items={items} open={true} />);

      expect(screen.getByText('Show release labels')).toBeInTheDocument();
      expect(screen.getByText('12')).toBeInTheDocument();
    });
  });

  describe('Radio Groups', () => {
    it('renders radio group items', () => {
      const items: CommonDropdownItem[] = [
        {
          type: 'radio',
          id: 'rg-1',
          value: 'small',
          onValueChange: vi.fn(),
          items: [
            { id: 'r-1', label: 'Small', value: 'small' },
            { id: 'r-2', label: 'Medium', value: 'medium' },
            { id: 'r-3', label: 'Large', value: 'large' },
          ],
        },
      ];
      render(<CommonDropdown items={items} open={true} />);
      expect(
        screen.getByRole('menuitemradio', { name: 'Small' })
      ).toBeInTheDocument();
      expect(
        screen.getByRole('menuitemradio', { name: 'Medium' })
      ).toBeInTheDocument();
      expect(
        screen.getByRole('menuitemradio', { name: 'Large' })
      ).toBeInTheDocument();
    });

    it('shows selected radio item', () => {
      const items: CommonDropdownItem[] = [
        {
          type: 'radio',
          id: 'rg-1',
          value: 'medium',
          onValueChange: vi.fn(),
          items: [
            { id: 'r-1', label: 'Small', value: 'small' },
            { id: 'r-2', label: 'Medium', value: 'medium' },
          ],
        },
      ];
      render(<CommonDropdown items={items} open={true} />);
      expect(
        screen.getByRole('menuitemradio', { name: 'Small' })
      ).toHaveAttribute('data-state', 'unchecked');
      expect(
        screen.getByRole('menuitemradio', { name: 'Medium' })
      ).toHaveAttribute('data-state', 'checked');
    });
  });

  describe('Custom Items', () => {
    it('renders custom items', () => {
      const items: CommonDropdownItem[] = [
        {
          type: 'custom',
          id: 'custom-1',
          render: () => <div data-testid='custom-content'>Custom Content</div>,
        },
      ];
      render(<CommonDropdown items={items} open={true} />);
      expect(screen.getByTestId('custom-content')).toBeInTheDocument();
      expect(screen.getByText('Custom Content')).toBeInTheDocument();
    });
  });

  describe('Loading State', () => {
    it('shows loading spinner when isLoading is true', () => {
      render(
        <CommonDropdown items={basicItems} open={true} isLoading={true} />
      );
      const menu = screen.getByRole('menu');
      expect(menu).toBeInTheDocument();
      expect(screen.getByRole('status')).toHaveTextContent(
        'Loading menu items'
      );
      // Items should not be rendered
      expect(screen.queryByText('Edit')).not.toBeInTheDocument();
    });
  });

  describe('Empty State', () => {
    it('shows empty message when no items', () => {
      render(<CommonDropdown items={[]} open={true} />);
      expect(screen.getByText('No items found')).toBeInTheDocument();
    });

    it('shows custom empty message', () => {
      render(
        <CommonDropdown
          items={[]}
          open={true}
          emptyMessage='Nothing to see here'
        />
      );
      expect(screen.getByText('Nothing to see here')).toBeInTheDocument();
    });
  });

  describe('Searchable', () => {
    it('renders search input when searchable is true', () => {
      render(
        <CommonDropdown items={basicItems} open={true} searchable={true} />
      );
      expect(screen.getByPlaceholderText('Search...')).toBeInTheDocument();
    });

    it('renders custom search placeholder', () => {
      render(
        <CommonDropdown
          items={basicItems}
          open={true}
          searchable={true}
          searchPlaceholder='Find items...'
        />
      );
      expect(screen.getByPlaceholderText('Find items...')).toBeInTheDocument();
    });

    it('filters items based on search query', async () => {
      const items: CommonDropdownItem[] = [
        { type: 'action', id: 'edit', label: 'Edit', onClick: vi.fn() },
        { type: 'action', id: 'delete', label: 'Delete', onClick: vi.fn() },
        { type: 'action', id: 'copy', label: 'Copy', onClick: vi.fn() },
      ];
      const user = userEvent.setup({ delay: null });
      render(<CommonDropdown items={items} open={true} searchable={true} />);

      await user.type(screen.getByPlaceholderText('Search...'), 'Ed');

      await waitFor(() => {
        expect(screen.getByText('Edit')).toBeInTheDocument();
        expect(screen.queryByText('Copy')).not.toBeInTheDocument();
      });
    });

    it('removes section labels when their section has no matching items', async () => {
      const items: CommonDropdownItem[] = [
        { type: 'label', id: 'people-label', label: 'People' },
        { type: 'action', id: 'owner', label: 'Owner', onClick: vi.fn() },
        { type: 'separator', id: 'section-break' },
        { type: 'label', id: 'actions-label', label: 'Actions' },
        { type: 'action', id: 'archive', label: 'Archive', onClick: vi.fn() },
      ];
      const user = userEvent.setup({ delay: null });
      render(<CommonDropdown items={items} open={true} searchable={true} />);

      await user.type(screen.getByPlaceholderText('Search...'), 'archive');

      await waitFor(() => {
        expect(screen.getByText('Actions')).toBeInTheDocument();
        expect(screen.getByText('Archive')).toBeInTheDocument();
        expect(screen.queryByText('People')).not.toBeInTheDocument();
        expect(screen.queryByText('Owner')).not.toBeInTheDocument();
      });
    });

    it('shows empty state when search has no results', async () => {
      const items: CommonDropdownItem[] = [
        { type: 'action', id: 'edit', label: 'Edit', onClick: vi.fn() },
      ];
      const user = userEvent.setup({ delay: null });
      render(<CommonDropdown items={items} open={true} searchable={true} />);

      await user.type(screen.getByPlaceholderText('Search...'), 'zzzzz');

      await waitFor(() => {
        expect(screen.getByText('No items found')).toBeInTheDocument();
      });
    });

    it('calls onSearch callback', async () => {
      const onSearch = vi.fn();
      const user = userEvent.setup({ delay: null });
      render(
        <CommonDropdown
          items={basicItems}
          open={true}
          searchable={true}
          onSearch={onSearch}
        />
      );

      await user.type(screen.getByPlaceholderText('Search...'), 'test');

      await waitFor(() => {
        expect(onSearch).toHaveBeenCalled();
      });
    });

    it('calls onSearchChange when clearing search', async () => {
      const onSearchChange = vi.fn();
      const user = userEvent.setup({ delay: null });
      render(
        <CommonDropdown
          items={basicItems}
          open={true}
          searchable={true}
          onSearchChange={onSearchChange}
        />
      );

      await user.type(screen.getByPlaceholderText('Search...'), 'edit');
      await user.click(screen.getByRole('button', { name: 'Clear search' }));

      expect(onSearchChange).toHaveBeenLastCalledWith('');
      expect(screen.getByPlaceholderText('Search...')).toHaveFocus();
    });

    it('preserves legacy onSearch for non-empty queries only', async () => {
      const onSearch = vi.fn();
      const user = userEvent.setup({ delay: null });
      render(
        <CommonDropdown
          items={basicItems}
          open={true}
          searchable={true}
          onSearch={onSearch}
        />
      );

      await user.type(screen.getByPlaceholderText('Search...'), 'edit');
      await user.click(screen.getByRole('button', { name: 'Clear search' }));

      expect(onSearch).toHaveBeenCalledWith('edit');
      expect(onSearch).not.toHaveBeenCalledWith('');
    });

    it('lets Escape clear search before dismissing the menu', async () => {
      const user = userEvent.setup({ delay: null });
      render(<CommonDropdown items={basicItems} searchable={true} />);

      await user.click(screen.getByRole('button', { name: 'More actions' }));
      await user.type(screen.getByPlaceholderText('Search...'), 'edit');
      await waitFor(() => {
        expect(screen.getByPlaceholderText('Search...')).toHaveValue('edit');
      });

      fireEvent.keyDown(screen.getByPlaceholderText('Search...'), {
        key: 'Escape',
      });
      expect(screen.getByRole('menu')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Search...')).toHaveValue('');

      fireEvent.keyDown(screen.getByPlaceholderText('Search...'), {
        key: 'Escape',
      });

      await waitFor(() => {
        expect(screen.queryByRole('menu')).not.toBeInTheDocument();
      });
    });

    it('lets menu navigation keys leave the search field', async () => {
      const onClick = vi.fn();
      const items: CommonDropdownItem[] = [
        { type: 'action', id: 'edit', label: 'Edit', onClick },
      ];
      const user = userEvent.setup({ delay: null });
      render(<CommonDropdown items={items} searchable={true} />);

      await user.click(screen.getByRole('button', { name: 'More actions' }));
      const input = screen.getByPlaceholderText('Search...');
      await user.type(input, 'edit');

      await user.keyboard('{ArrowDown}');
      await user.keyboard('{Enter}');

      expect(onClick).toHaveBeenCalled();
    });

    it('only reports one empty search value when a controlled menu closes', async () => {
      const onSearchChange = vi.fn();
      const user = userEvent.setup({ delay: null });
      const { rerender } = render(
        <CommonDropdown
          items={basicItems}
          open={true}
          searchable={true}
          onSearchChange={onSearchChange}
        />
      );

      await user.type(screen.getByPlaceholderText('Search...'), 'edit');
      onSearchChange.mockClear();

      rerender(
        <CommonDropdown
          items={basicItems}
          open={false}
          searchable={true}
          onSearchChange={onSearchChange}
        />
      );

      await waitFor(() => {
        expect(screen.queryByRole('menu')).not.toBeInTheDocument();
      });

      expect(
        onSearchChange.mock.calls.filter(([query]) => query === '')
      ).toHaveLength(1);
    });

    it('uses custom filters for radio item search', async () => {
      const items: CommonDropdownItem[] = [
        {
          type: 'radio',
          id: 'density',
          value: 'comfortable',
          onValueChange: vi.fn(),
          items: [
            { id: 'compact', label: 'Compact', value: 'density-compact' },
            {
              id: 'comfortable',
              label: 'Comfortable',
              value: 'density-comfortable',
            },
          ],
        },
      ];
      const user = userEvent.setup({ delay: null });
      render(
        <CommonDropdown
          items={items}
          open={true}
          searchable={true}
          filterItem={(item, query) =>
            item.type === 'radio'
              ? item.value === query
              : item.label.toLowerCase().includes(query)
          }
        />
      );

      await user.type(
        screen.getByPlaceholderText('Search...'),
        'density-compact'
      );

      await waitFor(() => {
        expect(screen.getByText('Compact')).toBeInTheDocument();
        expect(screen.queryByText('Comfortable')).not.toBeInTheDocument();
      });
    });

    it('keeps matching submenu branches during recursive search', async () => {
      const items: CommonDropdownItem[] = [
        { type: 'action', id: 'archive', label: 'Archive', onClick: vi.fn() },
        {
          type: 'submenu',
          id: 'share',
          label: 'Share',
          icon: Star,
          items: [
            {
              type: 'action',
              id: 'spotify',
              label: 'Spotify',
              onClick: vi.fn(),
            },
          ],
        },
      ];
      const user = userEvent.setup({ delay: null });
      render(
        <CommonDropdown
          items={items}
          open={true}
          searchable={true}
          searchMode='recursive'
        />
      );

      await user.type(screen.getByPlaceholderText('Search...'), 'spotify');

      await waitFor(() => {
        expect(screen.getByText('Share')).toBeInTheDocument();
        expect(screen.queryByText('Archive')).not.toBeInTheDocument();
      });
    });

    it('keeps submenu descendants when the submenu label matches', async () => {
      const items: CommonDropdownItem[] = [
        {
          type: 'submenu',
          id: 'share',
          label: 'Share',
          items: [
            {
              type: 'action',
              id: 'spotify',
              label: 'Spotify',
              onClick: vi.fn(),
            },
          ],
        },
      ];
      const user = userEvent.setup({ delay: null });
      render(
        <CommonDropdown
          items={items}
          open={true}
          searchable={true}
          searchMode='recursive'
        />
      );

      await user.type(screen.getByPlaceholderText('Search...'), 'share');
      await user.hover(screen.getByText('Share'));

      await waitFor(() => {
        expect(screen.getByText('Spotify')).toBeInTheDocument();
        expect(screen.queryByText('No items found')).not.toBeInTheDocument();
      });
    });

    it('uses submenu-local filters when matching recursive branches', async () => {
      const items: CommonDropdownItem[] = [
        { type: 'action', id: 'archive', label: 'Archive', onClick: vi.fn() },
        {
          type: 'submenu',
          id: 'platforms',
          label: 'Platforms',
          filterItem: (item, query) =>
            item.id === 'platforms' && query === 'destinations',
          items: [
            {
              type: 'action',
              id: 'spotify',
              label: 'Spotify',
              onClick: vi.fn(),
            },
          ],
        },
      ];
      const user = userEvent.setup({ delay: null });
      render(
        <CommonDropdown
          items={items}
          open={true}
          searchable={true}
          searchMode='recursive'
        />
      );

      await user.type(screen.getByPlaceholderText('Search...'), 'destinations');

      await waitFor(() => {
        expect(screen.getByText('Platforms')).toBeInTheDocument();
        expect(screen.queryByText('Archive')).not.toBeInTheDocument();
      });
    });
  });

  describe('Submenus', () => {
    it('renders nested submenu triggers', () => {
      const items: CommonDropdownItem[] = [
        {
          type: 'submenu',
          id: 'share',
          label: 'Share',
          items: [
            {
              type: 'submenu',
              id: 'social',
              label: 'Social',
              items: [
                {
                  type: 'action',
                  id: 'copy-link',
                  label: 'Copy Link',
                  onClick: vi.fn(),
                },
              ],
            },
          ],
        },
      ];

      render(<CommonDropdown items={items} open={true} />);

      expect(
        screen.getByRole('menuitem', { name: 'Share' })
      ).toBeInTheDocument();
    });

    it('opens a searchable submenu and filters child items', async () => {
      const items: CommonDropdownItem[] = [
        {
          type: 'submenu',
          id: 'platforms',
          label: 'Platforms',
          searchable: true,
          searchPlaceholder: 'Search Platforms',
          items: [
            {
              type: 'action',
              id: 'spotify',
              label: 'Spotify',
              onClick: vi.fn(),
            },
            {
              type: 'action',
              id: 'apple',
              label: 'Apple Music',
              onClick: vi.fn(),
            },
          ],
        },
      ];
      const user = userEvent.setup({ delay: null });
      render(<CommonDropdown items={items} open={true} />);

      await user.hover(screen.getByText('Platforms'));

      await waitFor(() => {
        expect(
          screen.getByPlaceholderText('Search Platforms')
        ).toBeInTheDocument();
      });

      fireEvent.change(screen.getByPlaceholderText('Search Platforms'), {
        target: { value: 'apple' },
      });

      await waitFor(() => {
        expect(screen.getByText('Apple Music')).toBeInTheDocument();
        expect(screen.queryByText('Spotify')).not.toBeInTheDocument();
      });
    });

    it('renders submenu loading and empty states', async () => {
      const items: CommonDropdownItem[] = [
        {
          type: 'submenu',
          id: 'loading',
          label: 'Loading Group',
          searchable: true,
          isLoading: true,
          items: [],
        },
        {
          type: 'submenu',
          id: 'empty',
          label: 'Empty Group',
          searchable: true,
          emptyMessage: 'No child items',
          items: [],
        },
      ];
      const user = userEvent.setup({ delay: null });
      render(<CommonDropdown items={items} open={true} />);

      await user.hover(screen.getByText('Loading Group'));
      await waitFor(() => {
        expect(screen.getByRole('menu')).toBeInTheDocument();
      });

      await user.hover(screen.getByText('Empty Group'));
      await waitFor(() => {
        expect(screen.getByText('No child items')).toBeInTheDocument();
      });
    });

    it('keeps only one sibling submenu open at a time', async () => {
      const items: CommonDropdownItem[] = [
        {
          type: 'submenu',
          id: 'share',
          label: 'Share',
          items: [
            {
              type: 'action',
              id: 'copy-link',
              label: 'Copy Link',
              onClick: vi.fn(),
            },
          ],
        },
        {
          type: 'submenu',
          id: 'metadata',
          label: 'Copy Metadata',
          items: [
            {
              type: 'action',
              id: 'copy-isrc',
              label: 'Copy ISRC',
              onClick: vi.fn(),
            },
          ],
        },
      ];
      const user = userEvent.setup({ delay: null });
      render(<CommonDropdown items={items} open={true} />);

      await user.click(screen.getByRole('menuitem', { name: 'Share' }));

      await waitFor(() => {
        expect(screen.getByText('Copy Link')).toBeInTheDocument();
      });

      await user.click(screen.getByRole('menuitem', { name: 'Copy Metadata' }));

      await waitFor(() => {
        expect(screen.getByText('Copy ISRC')).toBeInTheDocument();
        expect(screen.queryByText('Copy Link')).not.toBeInTheDocument();
      });
    });

    it('keeps only one context-menu sibling submenu open at a time', async () => {
      const items: CommonDropdownItem[] = [
        {
          type: 'submenu',
          id: 'share',
          label: 'Share',
          items: [
            {
              type: 'action',
              id: 'copy-link',
              label: 'Copy Link',
              onClick: vi.fn(),
            },
          ],
        },
        {
          type: 'submenu',
          id: 'metadata',
          label: 'Copy Metadata',
          items: [
            {
              type: 'action',
              id: 'copy-isrc',
              label: 'Copy ISRC',
              onClick: vi.fn(),
            },
          ],
        },
      ];
      const user = userEvent.setup({ delay: null });
      render(
        <CommonDropdown items={items} variant='context'>
          <div data-testid='context-target'>Target</div>
        </CommonDropdown>
      );

      fireEvent.contextMenu(screen.getByTestId('context-target'));

      await user.click(screen.getByRole('menuitem', { name: 'Share' }));

      await waitFor(() => {
        expect(screen.getByText('Copy Link')).toBeInTheDocument();
      });

      await user.click(screen.getByRole('menuitem', { name: 'Copy Metadata' }));

      await waitFor(() => {
        expect(screen.getByText('Copy ISRC')).toBeInTheDocument();
        expect(screen.queryByText('Copy Link')).not.toBeInTheDocument();
      });
    });

    it('keeps only one nested sibling submenu open at a time', async () => {
      const items: CommonDropdownItem[] = [
        {
          type: 'submenu',
          id: 'share',
          label: 'Share',
          items: [
            {
              type: 'submenu',
              id: 'tracked-links',
              label: 'Tracked Links',
              items: [
                {
                  type: 'submenu',
                  id: 'facebook',
                  label: 'Facebook',
                  items: [
                    {
                      type: 'action',
                      id: 'facebook-post',
                      label: 'Facebook Post',
                      onClick: vi.fn(),
                    },
                  ],
                },
                {
                  type: 'submenu',
                  id: 'reddit',
                  label: 'Reddit',
                  items: [
                    {
                      type: 'action',
                      id: 'reddit-post',
                      label: 'Reddit Post',
                      onClick: vi.fn(),
                    },
                  ],
                },
              ],
            },
          ],
        },
      ];
      const user = userEvent.setup({ delay: null });
      render(<CommonDropdown items={items} open={true} />);

      screen.getByRole('menuitem', { name: 'Share' }).focus();
      await user.keyboard('{ArrowRight}');
      await waitFor(() => {
        expect(screen.getByText('Tracked Links')).toBeInTheDocument();
      });
      screen.getByRole('menuitem', { name: 'Tracked Links' }).focus();
      await user.keyboard('{ArrowRight}');
      await waitFor(() => {
        expect(screen.getByText('Facebook')).toBeInTheDocument();
      });
      screen.getByRole('menuitem', { name: 'Facebook' }).focus();
      await user.keyboard('{ArrowRight}');

      await waitFor(() => {
        expect(screen.getByText('Facebook Post')).toBeInTheDocument();
      });

      screen.getByRole('menuitem', { name: 'Reddit' }).focus();
      await user.keyboard('{ArrowRight}');

      await waitFor(() => {
        expect(screen.getByText('Reddit Post')).toBeInTheDocument();
        expect(screen.queryByText('Facebook Post')).not.toBeInTheDocument();
      });
    });

    it('inherits submenu min-width from the trigger row when no override is provided', async () => {
      const items: CommonDropdownItem[] = [
        {
          type: 'submenu',
          id: 'share',
          label: 'Share',
          items: [
            {
              type: 'action',
              id: 'copy-link',
              label: 'Copy Link',
              onClick: vi.fn(),
            },
          ],
        },
      ];
      const user = userEvent.setup({ delay: null });
      render(<CommonDropdown items={items} open={true} />);

      const shareTrigger = screen.getByRole('menuitem', { name: 'Share' });
      const triggerRectSpy = vi
        .spyOn(shareTrigger, 'getBoundingClientRect')
        .mockReturnValue(new DOMRect(0, 0, 236.6, 32));

      await user.hover(shareTrigger);

      await waitFor(() => {
        const submenu = screen
          .getByRole('menuitem', { name: 'Copy Link' })
          .closest('[role="menu"]');
        expect(submenu).toHaveStyle({ minWidth: '237px' });
      });

      expect(triggerRectSpy).toHaveBeenCalled();
    });

    it('keeps an explicit submenu min-width override when present', async () => {
      const items: CommonDropdownItem[] = [
        {
          type: 'submenu',
          id: 'share',
          label: 'Share',
          minWidth: '320px',
          items: [
            {
              type: 'action',
              id: 'copy-link',
              label: 'Copy Link',
              onClick: vi.fn(),
            },
          ],
        },
      ];
      const user = userEvent.setup({ delay: null });
      render(<CommonDropdown items={items} open={true} />);

      const shareTrigger = screen.getByRole('menuitem', { name: 'Share' });
      vi.spyOn(shareTrigger, 'getBoundingClientRect').mockReturnValue(
        new DOMRect(0, 0, 240, 32)
      );

      await user.hover(shareTrigger);

      await waitFor(() => {
        const submenu = screen
          .getByRole('menuitem', { name: 'Copy Link' })
          .closest('[role="menu"]');
        expect(submenu).toHaveStyle({ minWidth: '320px' });
      });
    });

    it('preserves leading slot structure for icon-less submenu rows', async () => {
      const items: CommonDropdownItem[] = [
        {
          type: 'submenu',
          id: 'share',
          label: 'Share',
          items: [
            {
              type: 'action',
              id: 'copy-link',
              label: 'Copy Link',
              onClick: vi.fn(),
            },
          ],
        },
      ];
      const user = userEvent.setup({ delay: null });
      render(<CommonDropdown items={items} open={true} />);

      const shareTrigger = screen.getByRole('menuitem', { name: 'Share' });
      const triggerLeadingSlot = shareTrigger.firstElementChild as HTMLElement;

      expect(triggerLeadingSlot.tagName).toBe('SPAN');
      expect(triggerLeadingSlot.className).toContain('h-4 w-4');
      expect(triggerLeadingSlot.querySelector('svg')).toBeNull();

      await user.hover(shareTrigger);

      await waitFor(() => {
        const submenuItem = screen.getByRole('menuitem', { name: 'Copy Link' });
        const submenuLeadingSlot = submenuItem.firstElementChild as HTMLElement;
        const submenuTrailingSlot = submenuItem.lastElementChild as HTMLElement;

        expect(submenuLeadingSlot.tagName).toBe('SPAN');
        expect(submenuLeadingSlot.className).toContain('h-4 w-4');
        expect(submenuLeadingSlot.querySelector('svg')).toBeNull();
        expect(submenuTrailingSlot.tagName).toBe('SPAN');
        expect(submenuTrailingSlot.className).toContain('min-w-4');
      });
    });
  });

  describe('Disabled State', () => {
    it('disables the trigger when disabled is true', () => {
      render(<CommonDropdown items={basicItems} disabled={true} />);
      expect(
        screen.getByRole('button', { name: 'More actions' })
      ).toBeDisabled();
    });
  });

  describe('Context Menu Variant', () => {
    it('renders context menu trigger with children', () => {
      render(
        <CommonDropdown items={basicItems} variant='context'>
          <div data-testid='context-area'>Right click me</div>
        </CommonDropdown>
      );
      expect(screen.getByTestId('context-area')).toBeInTheDocument();
    });

    it('opens on right-click', async () => {
      render(
        <CommonDropdown items={basicItems} variant='context'>
          <div data-testid='context-area'>Right click me</div>
        </CommonDropdown>
      );
      fireEvent.contextMenu(screen.getByTestId('context-area'));

      await waitFor(() => {
        expect(screen.getByText('Edit')).toBeInTheDocument();
      });
    });
  });

  describe('Size Variants', () => {
    it('renders with default size', () => {
      render(<CommonDropdown items={basicItems} open={true} size='default' />);
      expect(screen.getByRole('menu')).toBeInTheDocument();
    });

    it('renders with compact size', () => {
      render(<CommonDropdown items={basicItems} open={true} size='compact' />);
      expect(screen.getByRole('menu')).toBeInTheDocument();
    });
  });

  describe('Styling', () => {
    it('applies contentClassName to menu content', () => {
      render(
        <CommonDropdown
          items={basicItems}
          open={true}
          contentClassName='custom-content'
        />
      );
      const menu = screen.getByRole('menu');
      expect(menu.className).toContain('custom-content');
    });

    it('applies triggerClassName to trigger', () => {
      render(
        <CommonDropdown items={basicItems} triggerClassName='custom-trigger' />
      );
      const trigger = screen.getByRole('button', { name: 'More actions' });
      expect(trigger.className).toContain('custom-trigger');
    });
  });

  describe('Accessibility', () => {
    it('has role menu for dropdown content', () => {
      render(<CommonDropdown items={basicItems} open={true} />);
      expect(screen.getByRole('menu')).toBeInTheDocument();
    });

    it('items have role menuitem', () => {
      render(<CommonDropdown items={basicItems} open={true} />);
      const items = screen.getAllByRole('menuitem');
      expect(items.length).toBeGreaterThan(0);
    });
  });
});
