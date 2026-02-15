import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import * as React from 'react';
import { describe, expect, it, vi } from 'vitest';

import {
  ContextMenu,
  ContextMenuCheckboxItem,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuRadioGroup,
  ContextMenuRadioItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from './context-menu';

// Helper: right-click on an element
function rightClick(element: HTMLElement) {
  fireEvent.contextMenu(element);
}

// Helper component for basic testing
const TestContextMenu = ({ onItemClick }: { onItemClick?: () => void }) => (
  <ContextMenu>
    <ContextMenuTrigger>
      <div data-testid='trigger-area' style={{ width: 200, height: 200 }}>
        Right click me
      </div>
    </ContextMenuTrigger>
    <ContextMenuContent>
      <ContextMenuLabel>Actions</ContextMenuLabel>
      <ContextMenuSeparator />
      <ContextMenuItem onClick={onItemClick}>Edit</ContextMenuItem>
      <ContextMenuItem>Copy</ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem variant='destructive'>Delete</ContextMenuItem>
    </ContextMenuContent>
  </ContextMenu>
);

describe('ContextMenu', () => {
  describe('Basic Functionality', () => {
    it('renders trigger area', () => {
      render(<TestContextMenu />);
      expect(screen.getByTestId('trigger-area')).toBeInTheDocument();
      expect(screen.getByText('Right click me')).toBeInTheDocument();
    });

    it('does not show content initially', () => {
      render(<TestContextMenu />);
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });

    it('shows menu on right-click', async () => {
      render(<TestContextMenu />);
      rightClick(screen.getByTestId('trigger-area'));

      await waitFor(() => {
        expect(screen.getByRole('menu')).toBeInTheDocument();
      });
    });

    it('shows menu items when open', async () => {
      render(<TestContextMenu />);
      rightClick(screen.getByTestId('trigger-area'));

      await waitFor(() => {
        expect(screen.getByText('Edit')).toBeInTheDocument();
        expect(screen.getByText('Copy')).toBeInTheDocument();
      });
    });

    it('calls onClick when item is clicked', async () => {
      const onItemClick = vi.fn();
      render(<TestContextMenu onItemClick={onItemClick} />);
      rightClick(screen.getByTestId('trigger-area'));

      await waitFor(() => {
        expect(screen.getByText('Edit')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Edit'));
      expect(onItemClick).toHaveBeenCalled();
    });

    it('closes on escape key', async () => {
      render(<TestContextMenu />);
      rightClick(screen.getByTestId('trigger-area'));

      await waitFor(() => {
        expect(screen.getByRole('menu')).toBeInTheDocument();
      });

      fireEvent.keyDown(document, { key: 'Escape' });

      await waitFor(() => {
        expect(screen.queryByRole('menu')).not.toBeInTheDocument();
      });
    });
  });

  describe('ContextMenuLabel', () => {
    it('renders label text', async () => {
      render(<TestContextMenu />);
      rightClick(screen.getByTestId('trigger-area'));

      await waitFor(() => {
        expect(screen.getByText('Actions')).toBeInTheDocument();
      });
    });

    it('supports inset prop', async () => {
      render(
        <ContextMenu>
          <ContextMenuTrigger>
            <div data-testid='trigger'>Trigger</div>
          </ContextMenuTrigger>
          <ContextMenuContent>
            <ContextMenuLabel inset data-testid='label'>
              Label
            </ContextMenuLabel>
          </ContextMenuContent>
        </ContextMenu>
      );
      rightClick(screen.getByTestId('trigger'));

      await waitFor(() => {
        const label = screen.getByTestId('label');
        expect(label.className).toContain('pl-10');
      });
    });
  });

  describe('ContextMenuItem', () => {
    it('renders menu item', async () => {
      render(<TestContextMenu />);
      rightClick(screen.getByTestId('trigger-area'));

      await waitFor(() => {
        expect(
          screen.getByRole('menuitem', { name: 'Edit' })
        ).toBeInTheDocument();
      });
    });

    it('supports destructive variant', async () => {
      render(<TestContextMenu />);
      rightClick(screen.getByTestId('trigger-area'));

      await waitFor(() => {
        const deleteItem = screen.getByText('Delete');
        expect(deleteItem.closest('[role="menuitem"]')).toBeInTheDocument();
      });
    });

    it('supports inset prop', async () => {
      render(
        <ContextMenu>
          <ContextMenuTrigger>
            <div data-testid='trigger'>Trigger</div>
          </ContextMenuTrigger>
          <ContextMenuContent>
            <ContextMenuItem inset data-testid='item'>
              Item
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
      );
      rightClick(screen.getByTestId('trigger'));

      await waitFor(() => {
        const item = screen.getByTestId('item');
        expect(item.className).toContain('pl-10');
      });
    });
  });

  describe('ContextMenuSeparator', () => {
    it('renders separator', async () => {
      render(<TestContextMenu />);
      rightClick(screen.getByTestId('trigger-area'));

      await waitFor(() => {
        const separators = screen.getAllByRole('separator');
        expect(separators.length).toBeGreaterThan(0);
      });
    });
  });

  describe('ContextMenuCheckboxItem', () => {
    it('renders checkbox item', async () => {
      render(
        <ContextMenu>
          <ContextMenuTrigger>
            <div data-testid='trigger'>Trigger</div>
          </ContextMenuTrigger>
          <ContextMenuContent>
            <ContextMenuCheckboxItem checked={false}>
              Show Grid
            </ContextMenuCheckboxItem>
          </ContextMenuContent>
        </ContextMenu>
      );
      rightClick(screen.getByTestId('trigger'));

      await waitFor(() => {
        expect(
          screen.getByRole('menuitemcheckbox', { name: 'Show Grid' })
        ).toBeInTheDocument();
      });
    });

    it('shows checked state', async () => {
      render(
        <ContextMenu>
          <ContextMenuTrigger>
            <div data-testid='trigger'>Trigger</div>
          </ContextMenuTrigger>
          <ContextMenuContent>
            <ContextMenuCheckboxItem checked={true}>
              Show Grid
            </ContextMenuCheckboxItem>
          </ContextMenuContent>
        </ContextMenu>
      );
      rightClick(screen.getByTestId('trigger'));

      await waitFor(() => {
        const item = screen.getByRole('menuitemcheckbox');
        expect(item).toHaveAttribute('data-state', 'checked');
      });
    });

    it('shows unchecked state', async () => {
      render(
        <ContextMenu>
          <ContextMenuTrigger>
            <div data-testid='trigger'>Trigger</div>
          </ContextMenuTrigger>
          <ContextMenuContent>
            <ContextMenuCheckboxItem checked={false}>
              Show Grid
            </ContextMenuCheckboxItem>
          </ContextMenuContent>
        </ContextMenu>
      );
      rightClick(screen.getByTestId('trigger'));

      await waitFor(() => {
        const item = screen.getByRole('menuitemcheckbox');
        expect(item).toHaveAttribute('data-state', 'unchecked');
      });
    });

    it('calls onCheckedChange when clicked', async () => {
      const onCheckedChange = vi.fn();
      render(
        <ContextMenu>
          <ContextMenuTrigger>
            <div data-testid='trigger'>Trigger</div>
          </ContextMenuTrigger>
          <ContextMenuContent>
            <ContextMenuCheckboxItem
              checked={false}
              onCheckedChange={onCheckedChange}
            >
              Show Grid
            </ContextMenuCheckboxItem>
          </ContextMenuContent>
        </ContextMenu>
      );
      rightClick(screen.getByTestId('trigger'));

      await waitFor(() => {
        expect(screen.getByRole('menuitemcheckbox')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('menuitemcheckbox'));
      expect(onCheckedChange).toHaveBeenCalledWith(true);
    });
  });

  describe('ContextMenuRadioGroup', () => {
    it('renders radio items', async () => {
      render(
        <ContextMenu>
          <ContextMenuTrigger>
            <div data-testid='trigger'>Trigger</div>
          </ContextMenuTrigger>
          <ContextMenuContent>
            <ContextMenuRadioGroup value='small'>
              <ContextMenuRadioItem value='small'>Small</ContextMenuRadioItem>
              <ContextMenuRadioItem value='medium'>Medium</ContextMenuRadioItem>
              <ContextMenuRadioItem value='large'>Large</ContextMenuRadioItem>
            </ContextMenuRadioGroup>
          </ContextMenuContent>
        </ContextMenu>
      );
      rightClick(screen.getByTestId('trigger'));

      await waitFor(() => {
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
    });

    it('shows selected radio item', async () => {
      render(
        <ContextMenu>
          <ContextMenuTrigger>
            <div data-testid='trigger'>Trigger</div>
          </ContextMenuTrigger>
          <ContextMenuContent>
            <ContextMenuRadioGroup value='medium'>
              <ContextMenuRadioItem value='small'>Small</ContextMenuRadioItem>
              <ContextMenuRadioItem value='medium'>Medium</ContextMenuRadioItem>
            </ContextMenuRadioGroup>
          </ContextMenuContent>
        </ContextMenu>
      );
      rightClick(screen.getByTestId('trigger'));

      await waitFor(() => {
        const small = screen.getByRole('menuitemradio', { name: 'Small' });
        const medium = screen.getByRole('menuitemradio', { name: 'Medium' });
        expect(small).toHaveAttribute('data-state', 'unchecked');
        expect(medium).toHaveAttribute('data-state', 'checked');
      });
    });
  });

  describe('ContextMenuShortcut', () => {
    it('renders shortcut text', async () => {
      render(
        <ContextMenu>
          <ContextMenuTrigger>
            <div data-testid='trigger'>Trigger</div>
          </ContextMenuTrigger>
          <ContextMenuContent>
            <ContextMenuItem>
              Copy <ContextMenuShortcut>⌘C</ContextMenuShortcut>
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
      );
      rightClick(screen.getByTestId('trigger'));

      await waitFor(() => {
        expect(screen.getByText('⌘C')).toBeInTheDocument();
      });
    });
  });

  describe('Submenu', () => {
    it('renders submenu trigger', async () => {
      render(
        <ContextMenu>
          <ContextMenuTrigger>
            <div data-testid='trigger'>Trigger</div>
          </ContextMenuTrigger>
          <ContextMenuContent>
            <ContextMenuSub>
              <ContextMenuSubTrigger>More Options</ContextMenuSubTrigger>
              <ContextMenuSubContent>
                <ContextMenuItem>Sub Item</ContextMenuItem>
              </ContextMenuSubContent>
            </ContextMenuSub>
          </ContextMenuContent>
        </ContextMenu>
      );
      rightClick(screen.getByTestId('trigger'));

      await waitFor(() => {
        expect(screen.getByText('More Options')).toBeInTheDocument();
      });
    });

    it('supports inset prop on sub trigger', async () => {
      render(
        <ContextMenu>
          <ContextMenuTrigger>
            <div data-testid='trigger'>Trigger</div>
          </ContextMenuTrigger>
          <ContextMenuContent>
            <ContextMenuSub>
              <ContextMenuSubTrigger inset data-testid='subtrigger'>
                More
              </ContextMenuSubTrigger>
              <ContextMenuSubContent>
                <ContextMenuItem>Sub Item</ContextMenuItem>
              </ContextMenuSubContent>
            </ContextMenuSub>
          </ContextMenuContent>
        </ContextMenu>
      );
      rightClick(screen.getByTestId('trigger'));

      await waitFor(() => {
        const subtrigger = screen.getByTestId('subtrigger');
        expect(subtrigger.className).toContain('pl-10');
      });
    });
  });

  describe('Accessibility', () => {
    it('has role menu for content', async () => {
      render(<TestContextMenu />);
      rightClick(screen.getByTestId('trigger-area'));

      await waitFor(() => {
        expect(screen.getByRole('menu')).toBeInTheDocument();
      });
    });

    it('menu items have role menuitem', async () => {
      render(<TestContextMenu />);
      rightClick(screen.getByTestId('trigger-area'));

      await waitFor(() => {
        const items = screen.getAllByRole('menuitem');
        expect(items.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Styling', () => {
    it('applies custom className to content', async () => {
      render(
        <ContextMenu>
          <ContextMenuTrigger>
            <div data-testid='trigger'>Trigger</div>
          </ContextMenuTrigger>
          <ContextMenuContent className='custom-content'>
            <ContextMenuItem>Item</ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
      );
      rightClick(screen.getByTestId('trigger'));

      await waitFor(() => {
        const menu = screen.getByRole('menu');
        expect(menu.className).toContain('custom-content');
      });
    });

    it('applies custom className to item', async () => {
      render(
        <ContextMenu>
          <ContextMenuTrigger>
            <div data-testid='trigger'>Trigger</div>
          </ContextMenuTrigger>
          <ContextMenuContent>
            <ContextMenuItem className='custom-item'>Item</ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
      );
      rightClick(screen.getByTestId('trigger'));

      await waitFor(() => {
        const item = screen.getByRole('menuitem');
        expect(item.className).toContain('custom-item');
      });
    });

    it('applies custom className to separator', async () => {
      render(
        <ContextMenu>
          <ContextMenuTrigger>
            <div data-testid='trigger'>Trigger</div>
          </ContextMenuTrigger>
          <ContextMenuContent>
            <ContextMenuSeparator
              className='custom-separator'
              data-testid='sep'
            />
          </ContextMenuContent>
        </ContextMenu>
      );
      rightClick(screen.getByTestId('trigger'));

      await waitFor(() => {
        const sep = screen.getByTestId('sep');
        expect(sep.className).toContain('custom-separator');
      });
    });

    it('applies custom className to label', async () => {
      render(
        <ContextMenu>
          <ContextMenuTrigger>
            <div data-testid='trigger'>Trigger</div>
          </ContextMenuTrigger>
          <ContextMenuContent>
            <ContextMenuLabel className='custom-label' data-testid='label'>
              Label
            </ContextMenuLabel>
          </ContextMenuContent>
        </ContextMenu>
      );
      rightClick(screen.getByTestId('trigger'));

      await waitFor(() => {
        const label = screen.getByTestId('label');
        expect(label.className).toContain('custom-label');
      });
    });

    it('applies custom className to shortcut', async () => {
      render(
        <ContextMenu>
          <ContextMenuTrigger>
            <div data-testid='trigger'>Trigger</div>
          </ContextMenuTrigger>
          <ContextMenuContent>
            <ContextMenuItem>
              Copy{' '}
              <ContextMenuShortcut className='custom-shortcut'>
                ⌘C
              </ContextMenuShortcut>
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
      );
      rightClick(screen.getByTestId('trigger'));

      await waitFor(() => {
        const shortcut = screen.getByText('⌘C');
        expect(shortcut.className).toContain('custom-shortcut');
      });
    });
  });

  describe('Ref Forwarding', () => {
    it('forwards ref on ContextMenuItem', async () => {
      const ref = React.createRef<HTMLDivElement>();
      render(
        <ContextMenu>
          <ContextMenuTrigger>
            <div data-testid='trigger'>Trigger</div>
          </ContextMenuTrigger>
          <ContextMenuContent>
            <ContextMenuItem ref={ref}>Item</ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
      );
      rightClick(screen.getByTestId('trigger'));

      await waitFor(() => {
        expect(ref.current).toBeInstanceOf(HTMLDivElement);
      });
    });

    it('forwards ref on ContextMenuLabel', async () => {
      const ref = React.createRef<HTMLDivElement>();
      render(
        <ContextMenu>
          <ContextMenuTrigger>
            <div data-testid='trigger'>Trigger</div>
          </ContextMenuTrigger>
          <ContextMenuContent>
            <ContextMenuLabel ref={ref}>Label</ContextMenuLabel>
          </ContextMenuContent>
        </ContextMenu>
      );
      rightClick(screen.getByTestId('trigger'));

      await waitFor(() => {
        expect(ref.current).toBeInstanceOf(HTMLDivElement);
      });
    });

    it('forwards ref on ContextMenuSeparator', async () => {
      const ref = React.createRef<HTMLDivElement>();
      render(
        <ContextMenu>
          <ContextMenuTrigger>
            <div data-testid='trigger'>Trigger</div>
          </ContextMenuTrigger>
          <ContextMenuContent>
            <ContextMenuSeparator ref={ref} />
          </ContextMenuContent>
        </ContextMenu>
      );
      rightClick(screen.getByTestId('trigger'));

      await waitFor(() => {
        expect(ref.current).toBeInstanceOf(HTMLDivElement);
      });
    });
  });
});
