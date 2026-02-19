import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Settings } from 'lucide-react';
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
      // Loading spinner uses Loader2 with animate-spin
      const menu = screen.getByRole('menu');
      expect(menu).toBeInTheDocument();
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
