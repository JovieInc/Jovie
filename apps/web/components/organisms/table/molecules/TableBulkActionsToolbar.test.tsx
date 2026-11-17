import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { TableBulkActionsToolbar } from './TableBulkActionsToolbar';

describe('TableBulkActionsToolbar', () => {
  it('runs an action from the menu and clears the selection', async () => {
    const user = userEvent.setup();
    const onArchive = vi.fn();
    const onDelete = vi.fn();
    const onClearSelection = vi.fn();
    const { container } = render(
      <TableBulkActionsToolbar
        selectedCount={3}
        onClearSelection={onClearSelection}
        actions={[
          { label: 'Archive', onClick: onArchive },
          { label: 'Delete', onClick: onDelete, variant: 'destructive' },
        ]}
      />
    );

    expect(screen.getByText('3 selected')).toBeInTheDocument();
    await expectNoA11yViolations(container);

    await user.click(screen.getByRole('button', { name: 'Actions' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Archive' }));
    expect(onArchive).toHaveBeenCalledTimes(1);
    expect(onDelete).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Clear' }));
    expect(onClearSelection).toHaveBeenCalledTimes(1);
  });

  it('marks a disabled action as disabled in the menu', async () => {
    const user = userEvent.setup();
    const onExport = vi.fn();
    render(
      <TableBulkActionsToolbar
        selectedCount={1}
        onClearSelection={vi.fn()}
        actions={[{ label: 'Export', onClick: onExport, disabled: true }]}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Actions' }));
    const item = await screen.findByRole('menuitem', { name: 'Export' });
    // pointer-events-none (CSS) blocks the click in a browser; jsdom has no
    // stylesheet, so assert the disabled contract Radix exposes instead.
    expect(item).toHaveAttribute('aria-disabled', 'true');
    expect(item).toHaveAttribute('data-disabled');
    expect(onExport).not.toHaveBeenCalled();
  });

  it('omits the menu when there are no actions', async () => {
    const { container } = render(
      <TableBulkActionsToolbar
        selectedCount={2}
        onClearSelection={vi.fn()}
        actions={[]}
      />
    );

    expect(screen.queryByRole('button', { name: 'Actions' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Clear' })).toBeEnabled();
    await expectNoA11yViolations(container);
  });

  it('keeps a hidden overlay with no controls when nothing is selected', async () => {
    const { container } = render(
      <TableBulkActionsToolbar
        selectedCount={0}
        onClearSelection={vi.fn()}
        actions={[{ label: 'Archive', onClick: vi.fn() }]}
        className='custom'
      />
    );

    expect(container.firstElementChild).toHaveAttribute('data-state', 'hidden');
    expect(container.firstElementChild).toHaveClass('custom');
    expect(screen.queryByRole('button')).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('stays axe-clean with a long count in an RTL document', async () => {
    const { container } = render(
      <div dir='rtl'>
        <TableBulkActionsToolbar
          selectedCount={12480}
          onClearSelection={vi.fn()}
          actions={[{ label: 'أرشفة', onClick: vi.fn() }]}
        />
      </div>
    );

    expect(screen.getByText('12480 selected')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
