import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { TableActionMenu } from '@/components/atoms/table-action-menu/TableActionMenu';

describe('TableActionMenu interactions', () => {
  it('fires onClick handlers for action items', async () => {
    const user = userEvent.setup({ delay: null });
    const editClick = vi.fn();

    render(
      <TableActionMenu
        open={true}
        items={[{ id: 'edit', label: 'Edit', onClick: editClick }]}
      />
    );

    await user.click(screen.getByRole('menuitem', { name: 'Edit' }));

    expect(editClick).toHaveBeenCalledTimes(1);
  });

  it('renders separators and submenu triggers', () => {
    render(
      <TableActionMenu
        open={true}
        items={[
          { id: 'edit', label: 'Edit', onClick: vi.fn() },
          { id: 'separator', label: '' },
          {
            id: 'share',
            label: 'Share',
            children: [
              { id: 'copy-link', label: 'Copy link', onClick: vi.fn() },
            ],
          },
        ]}
      />
    );

    expect(screen.getByRole('separator')).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Share' })).toBeInTheDocument();
  });

  it('supports the custom trigger variant', async () => {
    const user = userEvent.setup({ delay: null });

    render(
      <TableActionMenu
        trigger='custom'
        items={[{ id: 'edit', label: 'Edit', onClick: vi.fn() }]}
      >
        <button type='button'>Open actions</button>
      </TableActionMenu>
    );

    await user.click(screen.getByRole('button', { name: 'Open actions' }));

    expect(
      await screen.findByRole('menuitem', { name: 'Edit' })
    ).toBeInTheDocument();
  });
});
