import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from './dropdown-menu';

// Helper component for basic testing
const TestDropdownMenu = ({
  open,
  onOpenChange,
  onItemClick,
}: {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onItemClick?: () => void;
}) => (
  <DropdownMenu open={open} onOpenChange={onOpenChange}>
    <DropdownMenuTrigger asChild>
      <button type='button'>Open Menu</button>
    </DropdownMenuTrigger>
    <DropdownMenuContent>
      <DropdownMenuLabel>My Account</DropdownMenuLabel>
      <DropdownMenuSeparator />
      <DropdownMenuItem onClick={onItemClick}>Profile</DropdownMenuItem>
      <DropdownMenuItem>Settings</DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem variant='destructive'>Logout</DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
);

describe('DropdownMenu', () => {
  describe('Basic Functionality', () => {
    it('renders trigger button', () => {
      render(<TestDropdownMenu />);
      expect(
        screen.getByRole('button', { name: /open menu/i })
      ).toBeInTheDocument();
    });

    it('opens on trigger click', async () => {
      const user = userEvent.setup({ delay: null });
      render(<TestDropdownMenu />);

      const trigger = screen.getByRole('button', { name: /open menu/i });
      await user.click(trigger);

      await waitFor(() => {
        expect(screen.getByRole('menu')).toBeInTheDocument();
      });
    });

    it('shows menu items when open', () => {
      render(<TestDropdownMenu open={true} />);
      expect(screen.getByRole('menu')).toBeInTheDocument();
      expect(screen.getByText('Profile')).toBeInTheDocument();
      expect(screen.getByText('Settings')).toBeInTheDocument();
    });

    it('closes on escape key', async () => {
      const onOpenChange = vi.fn();
      render(<TestDropdownMenu open={true} onOpenChange={onOpenChange} />);

      fireEvent.keyDown(document, { key: 'Escape' });

      expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it('closes on item click', async () => {
      const onOpenChange = vi.fn();
      const onItemClick = vi.fn();
      const user = userEvent.setup({ delay: null });
      render(
        <TestDropdownMenu
          open={true}
          onOpenChange={onOpenChange}
          onItemClick={onItemClick}
        />
      );

      await user.click(screen.getByText('Profile'));

      expect(onItemClick).toHaveBeenCalled();
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  describe('Controlled Mode', () => {
    it('works in controlled mode', () => {
      const onOpenChange = vi.fn();
      const { rerender } = render(
        <TestDropdownMenu open={false} onOpenChange={onOpenChange} />
      );

      expect(screen.queryByRole('menu')).not.toBeInTheDocument();

      rerender(<TestDropdownMenu open={true} onOpenChange={onOpenChange} />);
      expect(screen.getByRole('menu')).toBeInTheDocument();
    });

    it('calls onOpenChange when trigger is clicked', async () => {
      const onOpenChange = vi.fn();
      const user = userEvent.setup({ delay: null });
      render(<TestDropdownMenu onOpenChange={onOpenChange} />);

      await user.click(screen.getByRole('button', { name: /open menu/i }));

      expect(onOpenChange).toHaveBeenCalledWith(true);
    });
  });

  describe('DropdownMenuLabel', () => {
    it('renders label text', () => {
      render(<TestDropdownMenu open={true} />);
      expect(screen.getByText('My Account')).toBeInTheDocument();
    });

    it('supports inset prop', () => {
      render(
        <DropdownMenu open={true}>
          <DropdownMenuTrigger>Trigger</DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuLabel inset data-testid='label'>
              Label
            </DropdownMenuLabel>
          </DropdownMenuContent>
        </DropdownMenu>
      );
      const label = screen.getByTestId('label');
      expect(label.className).toContain('pl-10');
    });
  });

  describe('DropdownMenuItem', () => {
    it('renders menu item', () => {
      render(<TestDropdownMenu open={true} />);
      expect(
        screen.getByRole('menuitem', { name: 'Profile' })
      ).toBeInTheDocument();
    });

    it('supports destructive variant', () => {
      render(<TestDropdownMenu open={true} />);
      const logoutItem = screen.getByText('Logout');
      // Destructive items have specific styling
      expect(logoutItem.closest('[role="menuitem"]')).toBeInTheDocument();
    });

    it('supports inset prop', () => {
      render(
        <DropdownMenu open={true}>
          <DropdownMenuTrigger>Trigger</DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem inset data-testid='item'>
              Item
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      );
      const item = screen.getByTestId('item');
      expect(item.className).toContain('pl-10');
    });
  });

  describe('DropdownMenuSeparator', () => {
    it('renders separator', () => {
      render(<TestDropdownMenu open={true} />);
      const separators = screen.getAllByRole('separator');
      expect(separators.length).toBeGreaterThan(0);
    });
  });

  describe('DropdownMenuCheckboxItem', () => {
    it('renders checkbox item', () => {
      render(
        <DropdownMenu open={true}>
          <DropdownMenuTrigger>Trigger</DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuCheckboxItem checked={false}>
              Show Toolbar
            </DropdownMenuCheckboxItem>
          </DropdownMenuContent>
        </DropdownMenu>
      );
      expect(
        screen.getByRole('menuitemcheckbox', { name: 'Show Toolbar' })
      ).toBeInTheDocument();
    });

    it('shows checked state', () => {
      render(
        <DropdownMenu open={true}>
          <DropdownMenuTrigger>Trigger</DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuCheckboxItem checked={true}>
              Show Toolbar
            </DropdownMenuCheckboxItem>
          </DropdownMenuContent>
        </DropdownMenu>
      );
      const item = screen.getByRole('menuitemcheckbox');
      expect(item).toHaveAttribute('data-state', 'checked');
    });
  });

  describe('DropdownMenuRadioGroup', () => {
    it('renders radio items', () => {
      render(
        <DropdownMenu open={true}>
          <DropdownMenuTrigger>Trigger</DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuRadioGroup value='option1'>
              <DropdownMenuRadioItem value='option1'>
                Option 1
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value='option2'>
                Option 2
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      );
      expect(
        screen.getByRole('menuitemradio', { name: 'Option 1' })
      ).toBeInTheDocument();
      expect(
        screen.getByRole('menuitemradio', { name: 'Option 2' })
      ).toBeInTheDocument();
    });

    it('shows selected radio item', () => {
      render(
        <DropdownMenu open={true}>
          <DropdownMenuTrigger>Trigger</DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuRadioGroup value='option1'>
              <DropdownMenuRadioItem value='option1'>
                Option 1
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value='option2'>
                Option 2
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      );
      const option1 = screen.getByRole('menuitemradio', { name: 'Option 1' });
      const option2 = screen.getByRole('menuitemradio', { name: 'Option 2' });
      expect(option1).toHaveAttribute('data-state', 'checked');
      expect(option2).toHaveAttribute('data-state', 'unchecked');
    });
  });

  describe('DropdownMenuShortcut', () => {
    it('renders shortcut text', () => {
      render(
        <DropdownMenu open={true}>
          <DropdownMenuTrigger>Trigger</DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem>
              Copy <DropdownMenuShortcut>⌘C</DropdownMenuShortcut>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      );
      expect(screen.getByText('⌘C')).toBeInTheDocument();
    });
  });

  describe('Submenu', () => {
    it('renders submenu trigger', () => {
      render(
        <DropdownMenu open={true}>
          <DropdownMenuTrigger>Trigger</DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>More Options</DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuItem>Sub Item</DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          </DropdownMenuContent>
        </DropdownMenu>
      );
      expect(screen.getByText('More Options')).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('has proper aria attributes on trigger', async () => {
      const user = userEvent.setup({ delay: null });
      render(<TestDropdownMenu />);

      const trigger = screen.getByRole('button', { name: /open menu/i });
      expect(trigger).toHaveAttribute('aria-haspopup', 'menu');

      await user.click(trigger);

      await waitFor(() => {
        expect(trigger).toHaveAttribute('aria-expanded', 'true');
      });
    });

    it('has role menu for content', () => {
      render(<TestDropdownMenu open={true} />);
      expect(screen.getByRole('menu')).toBeInTheDocument();
    });

    it('menu items have role menuitem', () => {
      render(<TestDropdownMenu open={true} />);
      const items = screen.getAllByRole('menuitem');
      expect(items.length).toBeGreaterThan(0);
    });
  });

  describe('Styling', () => {
    it('applies custom className to content', () => {
      render(
        <DropdownMenu open={true}>
          <DropdownMenuTrigger>Trigger</DropdownMenuTrigger>
          <DropdownMenuContent className='custom-content'>
            <DropdownMenuItem>Item</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      );
      const menu = screen.getByRole('menu');
      expect(menu.className).toContain('custom-content');
    });

    it('applies custom className to item', () => {
      render(
        <DropdownMenu open={true}>
          <DropdownMenuTrigger>Trigger</DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem className='custom-item'>Item</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      );
      const item = screen.getByRole('menuitem');
      expect(item.className).toContain('custom-item');
    });
  });
});
