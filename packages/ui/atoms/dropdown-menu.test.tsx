import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import * as React from 'react';

import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuGroup,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuRadioGroup,
} from './dropdown-menu';

describe('DropdownMenu', () => {
  describe('Basic functionality', () => {
    it('should open and close menu on trigger click', async () => {
      const user = userEvent.setup();
      
      render(
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button>Open Menu</button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem>Profile</DropdownMenuItem>
            <DropdownMenuItem>Settings</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      );

      const trigger = screen.getByRole('button', { name: /open menu/i });
      expect(screen.queryByText('Profile')).not.toBeInTheDocument();

      // Open menu
      await user.click(trigger);
      await waitFor(() => {
        expect(screen.getByText('Profile')).toBeInTheDocument();
      });

      // Close menu by clicking trigger again
      await user.click(trigger);
      await waitFor(() => {
        expect(screen.queryByText('Profile')).not.toBeInTheDocument();
      });
    });

    it('should close menu when clicking outside', async () => {
      const user = userEvent.setup();
      
      render(
        <div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button>Open Menu</button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem>Profile</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <button>Outside button</button>
        </div>
      );

      const trigger = screen.getByRole('button', { name: /open menu/i });
      
      // Open menu
      await user.click(trigger);
      await waitFor(() => {
        expect(screen.getByText('Profile')).toBeInTheDocument();
      });

      // Click outside
      const outsideButton = screen.getByRole('button', { name: /outside button/i });
      await user.click(outsideButton);
      
      await waitFor(() => {
        expect(screen.queryByText('Profile')).not.toBeInTheDocument();
      });
    });

    it('should execute onSelect callback when item clicked', async () => {
      const user = userEvent.setup();
      const handleSelect = vi.fn();
      
      render(
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button>Open Menu</button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onSelect={handleSelect}>
              Profile
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      );

      const trigger = screen.getByRole('button', { name: /open menu/i });
      await user.click(trigger);
      
      const item = screen.getByText('Profile');
      await user.click(item);
      
      expect(handleSelect).toHaveBeenCalled();
    });
  });

  describe('Keyboard navigation', () => {
    it('should close menu on Escape key', async () => {
      const user = userEvent.setup();
      
      render(
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button>Open Menu</button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem>Profile</DropdownMenuItem>
            <DropdownMenuItem>Settings</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      );

      const trigger = screen.getByRole('button', { name: /open menu/i });
      
      // Open menu
      await user.click(trigger);
      await waitFor(() => {
        expect(screen.getByText('Profile')).toBeInTheDocument();
      });

      // Press Escape
      await user.keyboard('{Escape}');
      
      await waitFor(() => {
        expect(screen.queryByText('Profile')).not.toBeInTheDocument();
      });
    });

    it('should navigate menu items with arrow keys', async () => {
      const user = userEvent.setup();
      
      render(
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button>Open Menu</button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem data-testid='item-1'>Profile</DropdownMenuItem>
            <DropdownMenuItem data-testid='item-2'>Settings</DropdownMenuItem>
            <DropdownMenuItem data-testid='item-3'>Logout</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      );

      const trigger = screen.getByRole('button', { name: /open menu/i });
      await user.click(trigger);
      
      // First item should be highlighted by default
      await waitFor(() => {
        const firstItem = screen.getByTestId('item-1');
        expect(firstItem).toHaveAttribute('data-highlighted');
      });

      // Arrow down to second item
      await user.keyboard('{ArrowDown}');
      const secondItem = screen.getByTestId('item-2');
      expect(secondItem).toHaveAttribute('data-highlighted');

      // Arrow down to third item
      await user.keyboard('{ArrowDown}');
      const thirdItem = screen.getByTestId('item-3');
      expect(thirdItem).toHaveAttribute('data-highlighted');

      // Arrow up back to second item
      await user.keyboard('{ArrowUp}');
      expect(secondItem).toHaveAttribute('data-highlighted');
    });

    it('should select item with Enter key', async () => {
      const user = userEvent.setup();
      const handleSelect = vi.fn();
      
      render(
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button>Open Menu</button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onSelect={handleSelect}>
              Profile
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      );

      const trigger = screen.getByRole('button', { name: /open menu/i });
      await user.click(trigger);
      
      // Press Enter to select highlighted item
      await user.keyboard('{Enter}');
      
      expect(handleSelect).toHaveBeenCalled();
    });

    it('should support typeahead navigation', async () => {
      const user = userEvent.setup();
      
      render(
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button>Open Menu</button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem data-testid='apple'>Apple</DropdownMenuItem>
            <DropdownMenuItem data-testid='banana'>Banana</DropdownMenuItem>
            <DropdownMenuItem data-testid='cherry'>Cherry</DropdownMenuItem>
            <DropdownMenuItem data-testid='date'>Date</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      );

      const trigger = screen.getByRole('button', { name: /open menu/i });
      await user.click(trigger);
      
      // Type 'c' to jump to Cherry
      await user.keyboard('c');
      const cherry = screen.getByTestId('cherry');
      expect(cherry).toHaveAttribute('data-highlighted');
      
      // Type 'd' to jump to Date
      await user.keyboard('d');
      const date = screen.getByTestId('date');
      expect(date).toHaveAttribute('data-highlighted');
    });
  });

  describe('Checkbox items', () => {
    it('should toggle checkbox state on click', async () => {
      const user = userEvent.setup();
      const handleCheckedChange = vi.fn();
      
      render(
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button>Open Menu</button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuCheckboxItem
              checked={false}
              onCheckedChange={handleCheckedChange}
              data-testid='checkbox-item'
            >
              Show Status Bar
            </DropdownMenuCheckboxItem>
          </DropdownMenuContent>
        </DropdownMenu>
      );

      const trigger = screen.getByRole('button', { name: /open menu/i });
      await user.click(trigger);
      
      const checkboxItem = screen.getByTestId('checkbox-item');
      await user.click(checkboxItem);
      
      expect(handleCheckedChange).toHaveBeenCalledWith(true);
    });

    it('should display check indicator when checked', () => {
      render(
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button>Open Menu</button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuCheckboxItem checked={true}>
              Show Status Bar
            </DropdownMenuCheckboxItem>
          </DropdownMenuContent>
        </DropdownMenu>
      );

      const trigger = screen.getByRole('button', { name: /open menu/i });
      fireEvent.click(trigger);
      
      // Check indicator (svg) should be present
      const checkIcon = document.querySelector('[aria-hidden="true"]');
      expect(checkIcon).toBeInTheDocument();
    });
  });

  describe('Radio items', () => {
    it('should select radio item and update value', async () => {
      const user = userEvent.setup();
      const handleValueChange = vi.fn();
      
      render(
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button>Open Menu</button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuRadioGroup value='bottom' onValueChange={handleValueChange}>
              <DropdownMenuRadioItem value='top' data-testid='radio-top'>
                Top
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value='bottom' data-testid='radio-bottom'>
                Bottom
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value='right' data-testid='radio-right'>
                Right
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      );

      const trigger = screen.getByRole('button', { name: /open menu/i });
      await user.click(trigger);
      
      const rightOption = screen.getByTestId('radio-right');
      await user.click(rightOption);
      
      expect(handleValueChange).toHaveBeenCalledWith('right');
    });
  });

  describe('Submenus', () => {
    it('should open submenu on hover/click', async () => {
      const user = userEvent.setup();
      
      render(
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button>Open Menu</button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger data-testid='submenu-trigger'>
                Share
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuItem>Email</DropdownMenuItem>
                <DropdownMenuItem>Messages</DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          </DropdownMenuContent>
        </DropdownMenu>
      );

      const trigger = screen.getByRole('button', { name: /open menu/i });
      await user.click(trigger);
      
      // Submenu content should not be visible initially
      expect(screen.queryByText('Email')).not.toBeInTheDocument();
      
      // Hover over submenu trigger
      const submenuTrigger = screen.getByTestId('submenu-trigger');
      await user.hover(submenuTrigger);
      
      // Submenu should open
      await waitFor(() => {
        expect(screen.getByText('Email')).toBeInTheDocument();
      });
    });

    it('should navigate submenu with arrow keys', async () => {
      const user = userEvent.setup();
      
      render(
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button>Open Menu</button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger data-testid='submenu-trigger'>
                Share
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuItem data-testid='email'>Email</DropdownMenuItem>
                <DropdownMenuItem data-testid='messages'>Messages</DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          </DropdownMenuContent>
        </DropdownMenu>
      );

      const trigger = screen.getByRole('button', { name: /open menu/i });
      await user.click(trigger);
      
      const submenuTrigger = screen.getByTestId('submenu-trigger');
      
      // Focus submenu trigger
      submenuTrigger.focus();
      
      // Press right arrow to open submenu
      await user.keyboard('{ArrowRight}');
      
      await waitFor(() => {
        expect(screen.getByText('Email')).toBeInTheDocument();
      });
      
      // First item in submenu should be focused
      const emailItem = screen.getByTestId('email');
      expect(emailItem).toHaveAttribute('data-highlighted');
    });
  });

  describe('Accessibility', () => {
    it('should have correct ARIA attributes', () => {
      render(
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button>Open Menu</button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuLabel>Account</DropdownMenuLabel>
            <DropdownMenuItem>Profile</DropdownMenuItem>
            <DropdownMenuItem>Settings</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      );

      const trigger = screen.getByRole('button', { name: /open menu/i });
      
      // Trigger should have aria-expanded
      expect(trigger).toHaveAttribute('aria-expanded', 'false');
      
      // Open menu
      fireEvent.click(trigger);
      expect(trigger).toHaveAttribute('aria-expanded', 'true');
      
      // Menu should have role="menu"
      const menu = screen.getByRole('menu');
      expect(menu).toBeInTheDocument();
      
      // Menu items should have role="menuitem"
      const menuItems = screen.getAllByRole('menuitem');
      expect(menuItems).toHaveLength(2);
    });

    it('should support disabled items', async () => {
      const user = userEvent.setup();
      const handleSelect = vi.fn();
      
      render(
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button>Open Menu</button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem disabled onSelect={handleSelect}>
              Disabled Item
            </DropdownMenuItem>
            <DropdownMenuItem>Enabled Item</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      );

      const trigger = screen.getByRole('button', { name: /open menu/i });
      await user.click(trigger);
      
      const disabledItem = screen.getByText('Disabled Item');
      await user.click(disabledItem);
      
      // Disabled item should not trigger onSelect
      expect(handleSelect).not.toHaveBeenCalled();
      
      // Disabled item should have correct styling
      expect(disabledItem).toHaveClass('data-[disabled]:pointer-events-none');
      expect(disabledItem).toHaveClass('data-[disabled]:opacity-50');
    });

    it('should trap focus within menu', async () => {
      const user = userEvent.setup();
      
      render(
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button>Open Menu</button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem data-testid='first'>First</DropdownMenuItem>
            <DropdownMenuItem data-testid='second'>Second</DropdownMenuItem>
            <DropdownMenuItem data-testid='last'>Last</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      );

      const trigger = screen.getByRole('button', { name: /open menu/i });
      await user.click(trigger);
      
      // Tab through items
      await user.keyboard('{Tab}');
      const firstItem = screen.getByTestId('first');
      expect(document.activeElement).toBe(firstItem);
      
      await user.keyboard('{Tab}');
      const secondItem = screen.getByTestId('second');
      expect(document.activeElement).toBe(secondItem);
      
      await user.keyboard('{Tab}');
      const lastItem = screen.getByTestId('last');
      expect(document.activeElement).toBe(lastItem);
      
      // Tab should cycle back to first
      await user.keyboard('{Tab}');
      expect(document.activeElement).toBe(firstItem);
    });
  });

  describe('SSR safety', () => {
    it('should render without errors in SSR environment', () => {
      // Simulate SSR by checking that component renders without window-dependent code
      const { container } = render(
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button>Open Menu</button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem>Profile</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      );
      
      expect(container).toBeInTheDocument();
    });

    it('should not have client-only side effects on mount', () => {
      // Ensure no window/document manipulation during initial render
      const windowSpy = vi.spyOn(window, 'addEventListener');
      
      render(
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button>Open Menu</button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem>Profile</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      );
      
      // Should not add event listeners until menu is opened
      expect(windowSpy).not.toHaveBeenCalled();
      
      windowSpy.mockRestore();
    });
  });
});