import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { HeaderBulkActions } from './HeaderBulkActions';

describe('HeaderBulkActions', () => {
  it('renders nothing when nothing is selected', () => {
    const { container } = render(
      <HeaderBulkActions selectedCount={0} bulkActions={[]} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('exposes a Title Case clear-selection control', async () => {
    const user = userEvent.setup();
    const onClearSelection = vi.fn();

    render(
      <HeaderBulkActions
        selectedCount={3}
        bulkActions={[]}
        onClearSelection={onClearSelection}
      />
    );

    expect(screen.getByText('3 selected')).toBeInTheDocument();
    const clearButton = screen.getByRole('button', {
      name: 'Clear Selection',
    });
    expect(clearButton).toHaveAttribute('data-size', 'icon-sm');
    expect(clearButton).toHaveClass(
      'h-7',
      'w-7',
      'rounded-full',
      'before:h-11',
      'before:w-11',
      'overflow-visible',
      'hover:bg-interactive-hover'
    );
    expect(clearButton.className).not.toMatch(
      /hover:(?:bg|border|text)-(?:blue|cyan|sky|indigo)/
    );
    expect(clearButton.className).not.toMatch(/hover:(?:-?translate|scale)/);

    await user.click(clearButton);
    expect(onClearSelection).toHaveBeenCalledOnce();
  });

  it('keeps action behavior and semantic destructive state in the shared menu', async () => {
    const user = userEvent.setup();
    const onArchive = vi.fn();
    const onDelete = vi.fn();

    render(
      <HeaderBulkActions
        selectedCount={2}
        bulkActions={[
          {
            label: 'Archive',
            icon: <span aria-hidden='true'>A</span>,
            onClick: onArchive,
          },
          {
            label: 'Export',
            onClick: vi.fn(),
            disabled: true,
          },
          {
            label: 'Delete',
            onClick: onDelete,
            variant: 'destructive',
          },
        ]}
      />
    );

    const trigger = screen.getByRole('button', { name: 'Actions' });
    expect(trigger).toHaveAttribute('data-size', 'sm');
    expect(trigger).toHaveClass('h-7', 'before:h-11', 'before:min-w-11');
    expect(trigger.className).not.toMatch(/hover:(?:-?translate|scale)/);

    await user.click(trigger);

    const archive = await screen.findByRole('menuitem', { name: 'Archive' });
    const exportAction = screen.getByRole('menuitem', { name: 'Export' });
    const destructive = screen.getByRole('menuitem', { name: 'Delete' });
    expect(exportAction).toHaveAttribute('data-disabled');
    expect(destructive).toHaveClass(
      'text-destructive',
      'focus:text-destructive'
    );

    await user.click(archive);
    expect(onArchive).toHaveBeenCalledOnce();
    expect(onDelete).not.toHaveBeenCalled();
  });
});
