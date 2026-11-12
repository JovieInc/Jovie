import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Copy, Trash2 } from 'lucide-react';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { TableActionMenu } from './TableActionMenu';

describe('TableActionMenu', () => {
  it('opens from its trigger and runs the chosen action', async () => {
    const user = userEvent.setup();
    const onCopy = vi.fn();
    const onDelete = vi.fn();
    const { container } = render(
      <TableActionMenu
        items={[
          { id: 'copy', label: 'Copy Title', icon: Copy, onClick: onCopy },
          { id: 'separator', label: '' },
          {
            id: 'delete',
            label: 'Delete',
            icon: Trash2,
            variant: 'destructive',
            onClick: onDelete,
          },
        ]}
      />
    );

    await expectNoA11yViolations(container);
    await user.click(screen.getByRole('button', { name: 'More actions' }));
    expect(screen.getByRole('separator')).toBeInTheDocument();
    await expectNoA11yViolations(screen.getByRole('menu'));
    await user.click(screen.getByRole('menuitem', { name: 'Copy Title' }));

    expect(onCopy).toHaveBeenCalledOnce();
    expect(onDelete).not.toHaveBeenCalled();
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('keeps disabled actions inert', async () => {
    const user = userEvent.setup();
    const onArchive = vi.fn();
    render(
      <TableActionMenu
        open
        items={[
          {
            id: 'archive',
            label: 'Archive',
            disabled: true,
            onClick: onArchive,
          },
        ]}
      />
    );

    const item = screen.getByRole('menuitem', { name: 'Archive' });
    expect(item).toHaveAttribute('aria-disabled', 'true');
    await user.click(item);
    expect(onArchive).not.toHaveBeenCalled();
  });

  it('reports open changes from a custom trigger', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(
      <TableActionMenu
        trigger='custom'
        onOpenChange={onOpenChange}
        items={[{ id: 'copy', label: 'Copy Title', onClick: vi.fn() }]}
      >
        <button type='button'>Row Actions</button>
      </TableActionMenu>
    );

    await user.click(screen.getByRole('button', { name: 'Row Actions' }));
    expect(onOpenChange).toHaveBeenCalledWith(true);
  });

  it('has no axe violations when open with no items', async () => {
    render(<TableActionMenu open items={[]} />);
    // The shared dropdown shows one disabled empty-state row instead.
    const empty = screen.getByRole('menuitem');
    expect(empty).toHaveAttribute('data-slot', 'common-dropdown-empty');
    expect(empty).toHaveAttribute('aria-disabled', 'true');
    await expectNoA11yViolations(screen.getByRole('menu'));
  });

  it('has no axe violations when open with long labels', async () => {
    render(
      <TableActionMenu
        open
        items={[
          {
            id: 'copy',
            label:
              'Copy The Extraordinarily Long Album Title (Deluxe Anniversary Remastered Edition)',
            subText: 'Includes every featured artist and the full edition name',
            onClick: vi.fn(),
          },
        ]}
      />
    );
    expect(
      screen.getByRole('menuitem', { name: /Extraordinarily Long Album Title/ })
    ).toBeInTheDocument();
    await expectNoA11yViolations(screen.getByRole('menu'));
  });

  // A modal menu aria-hides the page behind it while open, which axe
  // reports as aria-hidden-focus; held-open audits use the non-modal menu.
  it('passes the modal through so open-menu audits can run non-modal', () => {
    render(
      <TableActionMenu
        open
        searchable
        items={[{ id: 'edit', label: 'Edit', onClick: () => undefined }]}
        modal={false}
      />
    );
    // A searchable non-modal surface presents as a group.
    expect(screen.getByRole('group')).toBeInTheDocument();
  });

  it('has no axe violations in a right-to-left document', async () => {
    const user = userEvent.setup();
    const onCopy = vi.fn();
    render(
      <div dir='rtl' lang='ar'>
        <TableActionMenu
          open
          items={[{ id: 'copy', label: 'نسخ العنوان', onClick: onCopy }]}
        />
      </div>
    );

    await expectNoA11yViolations(screen.getByRole('menu'));
    await user.click(screen.getByRole('menuitem', { name: 'نسخ العنوان' }));
    expect(onCopy).toHaveBeenCalledOnce();
  });
});
