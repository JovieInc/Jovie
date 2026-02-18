import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Pencil, Trash2 } from 'lucide-react';
import { describe, expect, it, vi } from 'vitest';

import { TableActionMenu } from '@/components/atoms/table-action-menu';

describe('TableActionMenu interaction tests', () => {
  describe('action items fire onClick', () => {
    it('calls onClick when an action item is clicked', async () => {
      const handleEdit = vi.fn();
      const user = userEvent.setup();

      render(
        <TableActionMenu
          items={[
            { id: 'edit', label: 'Edit', icon: Pencil, onClick: handleEdit },
          ]}
        />
      );

      await user.click(screen.getByRole('button', { name: /more actions/i }));
      await user.click(screen.getByRole('menuitem', { name: /edit/i }));

      expect(handleEdit).toHaveBeenCalledTimes(1);
    });

    it('calls each onClick independently when multiple actions exist', async () => {
      const handleEdit = vi.fn();
      const handleDelete = vi.fn();
      const user = userEvent.setup();

      render(
        <TableActionMenu
          items={[
            { id: 'edit', label: 'Edit', icon: Pencil, onClick: handleEdit },
            {
              id: 'delete',
              label: 'Delete',
              icon: Trash2,
              onClick: handleDelete,
            },
          ]}
        />
      );

      await user.click(screen.getByRole('button', { name: /more actions/i }));
      await user.click(screen.getByRole('menuitem', { name: /edit/i }));

      expect(handleEdit).toHaveBeenCalledTimes(1);
      expect(handleDelete).not.toHaveBeenCalled();
    });

    it('calls destructive variant onClick', async () => {
      const handleDelete = vi.fn();
      const user = userEvent.setup();

      render(
        <TableActionMenu
          items={[
            {
              id: 'delete',
              label: 'Delete',
              icon: Trash2,
              onClick: handleDelete,
              variant: 'destructive',
            },
          ]}
        />
      );

      await user.click(screen.getByRole('button', { name: /more actions/i }));
      await user.click(screen.getByRole('menuitem', { name: /delete/i }));

      expect(handleDelete).toHaveBeenCalledTimes(1);
    });

    it('does not throw when onClick is not provided', async () => {
      const user = userEvent.setup();

      render(<TableActionMenu items={[{ id: 'view', label: 'View' }]} />);

      await user.click(screen.getByRole('button', { name: /more actions/i }));
      await expect(
        user.click(screen.getByRole('menuitem', { name: /view/i }))
      ).resolves.not.toThrow();
    });

    it('renders disabled items with data-disabled attribute and does not fire onClick', async () => {
      const handleEdit = vi.fn();
      const user = userEvent.setup();

      render(
        <TableActionMenu
          open={true}
          items={[
            {
              id: 'edit',
              label: 'Edit',
              icon: Pencil,
              onClick: handleEdit,
              disabled: true,
            },
          ]}
        />
      );

      const item = screen.getByRole('menuitem', { name: /edit/i });
      expect(item).toHaveAttribute('data-disabled');

      await user.click(item);
      expect(handleEdit).not.toHaveBeenCalled();
    });

    it('renders subText on action items', () => {
      render(
        <TableActionMenu
          open={true}
          items={[
            {
              id: 'edit',
              label: 'Edit',
              subText: 'Modify record',
              onClick: vi.fn(),
            },
          ]}
        />
      );

      expect(screen.getByText('Modify record')).toBeInTheDocument();
    });
  });

  describe('separator and submenu rendering', () => {
    it('renders a separator between action items', async () => {
      const user = userEvent.setup();

      render(
        <TableActionMenu
          items={[
            { id: 'edit', label: 'Edit', onClick: vi.fn() },
            { id: 'separator', label: '' },
            { id: 'delete', label: 'Delete', onClick: vi.fn() },
          ]}
        />
      );

      await user.click(screen.getByRole('button', { name: /more actions/i }));

      expect(screen.getAllByRole('menuitem')).toHaveLength(2);
      expect(screen.getByRole('separator')).toBeInTheDocument();
    });

    it('renders separator in open=true controlled mode', () => {
      render(
        <TableActionMenu
          open={true}
          items={[
            { id: 'edit', label: 'Edit', onClick: vi.fn() },
            { id: 'separator', label: '' },
            { id: 'delete', label: 'Delete', onClick: vi.fn() },
          ]}
        />
      );

      expect(screen.getByRole('separator')).toBeInTheDocument();
      expect(screen.getAllByRole('menuitem')).toHaveLength(2);
    });

    it('renders submenu trigger with aria-haspopup and chevron icon', async () => {
      const user = userEvent.setup();

      render(
        <TableActionMenu
          items={[
            {
              id: 'more',
              label: 'More',
              children: [
                { id: 'child-a', label: 'Child A', onClick: vi.fn() },
                { id: 'child-b', label: 'Child B', onClick: vi.fn() },
              ],
            },
          ]}
        />
      );

      await user.click(screen.getByRole('button', { name: /more actions/i }));

      const submenuTrigger = screen.getByRole('menuitem', { name: /more/i });
      expect(submenuTrigger).toBeInTheDocument();
      // Submenu triggers have aria-haspopup="menu"
      expect(submenuTrigger).toHaveAttribute('aria-haspopup', 'menu');
      // Submenu triggers render a chevron SVG indicator
      expect(submenuTrigger.querySelector('svg')).toBeInTheDocument();
    });

    it('submenu trigger is rendered as a menuitem in open state', () => {
      render(
        <TableActionMenu
          open={true}
          items={[
            {
              id: 'more',
              label: 'More',
              children: [{ id: 'child-a', label: 'Child A', onClick: vi.fn() }],
            },
          ]}
        />
      );

      const trigger = screen.getByRole('menuitem', { name: /more/i });
      expect(trigger).toBeInTheDocument();
      expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
      expect(trigger).toHaveAttribute('aria-expanded', 'false');
    });

    it('renders mixed items with separator and submenu', () => {
      render(
        <TableActionMenu
          open={true}
          items={[
            { id: 'edit', label: 'Edit', onClick: vi.fn() },
            { id: 'separator', label: '' },
            {
              id: 'more',
              label: 'More',
              children: [{ id: 'child-a', label: 'Child A', onClick: vi.fn() }],
            },
          ]}
        />
      );

      // Edit + submenu trigger = 2 menuitems
      expect(screen.getAllByRole('menuitem')).toHaveLength(2);
      expect(screen.getByRole('separator')).toBeInTheDocument();
      expect(screen.getByRole('menuitem', { name: /more/i })).toHaveAttribute(
        'aria-haspopup',
        'menu'
      );
    });
  });

  describe('custom trigger variant', () => {
    it('renders with custom trigger child instead of default button', async () => {
      const user = userEvent.setup();

      render(
        <TableActionMenu
          trigger='custom'
          items={[{ id: 'edit', label: 'Edit', onClick: vi.fn() }]}
        >
          <button type='button' aria-label='Custom trigger'>
            Open Menu
          </button>
        </TableActionMenu>
      );

      const customTrigger = screen.getByRole('button', {
        name: /custom trigger/i,
      });
      expect(customTrigger).toBeInTheDocument();
      expect(customTrigger).toHaveTextContent('Open Menu');

      await user.click(customTrigger);
      expect(
        screen.getByRole('menuitem', { name: /edit/i })
      ).toBeInTheDocument();
    });

    it('fires action onClick when triggered from custom trigger', async () => {
      const handleEdit = vi.fn();
      const user = userEvent.setup();

      render(
        <TableActionMenu
          trigger='custom'
          items={[{ id: 'edit', label: 'Edit', onClick: handleEdit }]}
        >
          <button type='button' aria-label='Custom trigger'>
            Open
          </button>
        </TableActionMenu>
      );

      await user.click(screen.getByRole('button', { name: /custom trigger/i }));
      await user.click(screen.getByRole('menuitem', { name: /edit/i }));

      expect(handleEdit).toHaveBeenCalledTimes(1);
    });

    it('renders default button trigger when trigger prop is omitted', () => {
      render(
        <TableActionMenu
          items={[{ id: 'edit', label: 'Edit', onClick: vi.fn() }]}
        />
      );

      expect(
        screen.getByRole('button', { name: /more actions/i })
      ).toBeInTheDocument();
    });

    it('menu closes after selecting an action from custom trigger', async () => {
      const user = userEvent.setup();

      render(
        <TableActionMenu
          trigger='custom'
          items={[{ id: 'edit', label: 'Edit', onClick: vi.fn() }]}
        >
          <button type='button' aria-label='Custom trigger'>
            Open
          </button>
        </TableActionMenu>
      );

      await user.click(screen.getByRole('button', { name: /custom trigger/i }));
      expect(screen.getByRole('menu')).toBeInTheDocument();

      await user.click(screen.getByRole('menuitem', { name: /edit/i }));
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });

    it('supports onOpenChange callback with custom trigger for open and close', async () => {
      const onOpenChange = vi.fn();
      const user = userEvent.setup();

      render(
        <TableActionMenu
          trigger='custom'
          onOpenChange={onOpenChange}
          items={[{ id: 'edit', label: 'Edit', onClick: vi.fn() }]}
        >
          <button type='button' aria-label='Custom trigger'>
            Open
          </button>
        </TableActionMenu>
      );

      await user.click(screen.getByRole('button', { name: /custom trigger/i }));
      expect(onOpenChange).toHaveBeenCalledWith(true);

      // Close by pressing Escape and assert onOpenChange called with false
      await user.keyboard('{Escape}');
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });
});
