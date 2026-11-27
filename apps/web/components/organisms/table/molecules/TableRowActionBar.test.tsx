import { ACTION_OVERFLOW_MAX_PRIMARY } from '@jovie/ui';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Copy, Pencil, Trash2 } from 'lucide-react';
import { describe, expect, it, vi } from 'vitest';
import { TableRowActionBar } from './TableRowActionBar';

describe('TableRowActionBar', () => {
  it('keeps the shared max-primary capacity inline and overflows the rest', async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    const onCopy = vi.fn();
    const onDelete = vi.fn();

    render(
      <TableRowActionBar
        actions={[
          {
            id: 'edit',
            label: 'Edit',
            icon: Pencil,
            priority: 10,
            onClick: onEdit,
          },
          {
            id: 'copy',
            label: 'Copy',
            icon: Copy,
            priority: 20,
            onClick: onCopy,
          },
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

    expect(ACTION_OVERFLOW_MAX_PRIMARY).toBe(2);
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy' })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Delete' })
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'More actions' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Delete' }));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it('renders overflow-only when every action is forced into the menu', () => {
    render(
      <TableRowActionBar
        maxPrimary={0}
        actions={[
          {
            id: 'edit',
            label: 'Edit',
            icon: Pencil,
            onClick: () => {},
          },
        ]}
      />
    );

    expect(
      screen.queryByRole('button', { name: 'Edit' })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'More actions' })
    ).toBeInTheDocument();
  });
});
