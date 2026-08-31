import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Archive } from 'lucide-react';
import { describe, expect, it, vi } from 'vitest';
import { TABLE_TOOLBAR_OVERLAY_CLASS } from '@/components/organisms/table/molecules/PageToolbar';
import { TableBulkActionsToolbar } from '@/components/organisms/table/molecules/TableBulkActionsToolbar';

const TOOLBAR_SOURCE = readFileSync(
  join(
    process.cwd(),
    'components/organisms/table/molecules/TableBulkActionsToolbar.tsx'
  ),
  'utf8'
);

const SAMPLE_ACTIONS = [
  { label: 'Archive', icon: <Archive />, onClick: vi.fn() },
  { label: 'Export', onClick: vi.fn(), disabled: true },
  { label: 'Delete', onClick: vi.fn(), variant: 'destructive' as const },
];

describe('TableBulkActionsToolbar', () => {
  it('keeps a hidden mounted overlay when no rows are selected', () => {
    const { container } = render(
      <TableBulkActionsToolbar
        selectedCount={0}
        onClearSelection={vi.fn()}
        actions={[]}
      />
    );

    const toolbar = container.firstElementChild;
    expect(toolbar).toBeInTheDocument();
    expect(toolbar).toHaveAttribute('aria-hidden', 'true');
    expect(toolbar).toHaveAttribute('data-state', 'hidden');
    expect(toolbar).toHaveClass('absolute', 'min-h-11', 'opacity-0');
    expect(screen.queryByRole('button', { name: 'Clear' })).toBeNull();
  });

  it('keeps the overlay on the shared horizontal overflow rail', () => {
    expect(TABLE_TOOLBAR_OVERLAY_CLASS).toContain(
      'overflow-x-auto overflow-y-hidden'
    );
    expect(TABLE_TOOLBAR_OVERLAY_CLASS).toContain('min-h-11');
  });

  it('renders selected count and overflow actions in the visible overlay', () => {
    render(
      <TableBulkActionsToolbar
        selectedCount={2}
        onClearSelection={vi.fn()}
        actions={SAMPLE_ACTIONS}
      />
    );

    expect(screen.getByText('2 selected')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Actions' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Clear' })).toBeEnabled();
    expect(
      screen.queryByRole('button', { name: 'Delete' })
    ).not.toBeInTheDocument();
  });

  it('opens the overflow menu and uses semantic destructive item state', async () => {
    const user = userEvent.setup();
    const onArchive = vi.fn();
    const onExport = vi.fn();
    const onDelete = vi.fn();

    render(
      <TableBulkActionsToolbar
        selectedCount={2}
        onClearSelection={vi.fn()}
        actions={[
          { label: 'Archive', onClick: onArchive },
          { label: 'Export', onClick: onExport, disabled: true },
          { label: 'Delete', onClick: onDelete, variant: 'destructive' },
        ]}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Actions' }));

    const deleteItem = await screen.findByRole('menuitem', { name: 'Delete' });
    expect(deleteItem.className).toContain('text-error');
    expect(deleteItem.className).toContain('hover:bg-error-subtle');
    expect(deleteItem.className).not.toContain('text-destructive');

    const exportItem = screen.getByRole('menuitem', { name: 'Export' });
    expect(exportItem).toHaveAttribute('data-disabled');
    expect(exportItem).toHaveAttribute('aria-disabled', 'true');

    await user.click(deleteItem);
    expect(onDelete).toHaveBeenCalledOnce();
    expect(onExport).not.toHaveBeenCalled();
  });

  it('rejects the retired text-destructive overlay styling', () => {
    expect(TOOLBAR_SOURCE).toContain('variant={action.variant}');
    expect(TOOLBAR_SOURCE).not.toContain('text-destructive');
  });
});
