import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Archive } from 'lucide-react';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { HeaderBulkActions } from './HeaderBulkActions';

const SAMPLE_ACTIONS = [
  { label: 'Archive', icon: <Archive />, onClick: vi.fn() },
  { label: 'Export', onClick: vi.fn(), disabled: true },
  { label: 'Delete', onClick: vi.fn(), variant: 'destructive' as const },
];

describe('HeaderBulkActions', () => {
  it('renders nothing when nothing is selected', () => {
    const { container } = render(
      <HeaderBulkActions selectedCount={0} bulkActions={[]} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('keeps compact 28px layout, accessible labels, and shared hit targets', () => {
    const { container } = render(
      <HeaderBulkActions
        selectedCount={3}
        bulkActions={SAMPLE_ACTIONS}
        onClearSelection={vi.fn()}
      />
    );

    const root = container.firstElementChild;
    expect(root).toHaveClass('h-7');
    expect(screen.getByText('3 selected')).toBeInTheDocument();

    const actions = screen.getByRole('button', { name: 'Actions' });
    expect(actions).toHaveAttribute('data-size', 'sm');
    expect(actions.className).toContain('h-7');
    expect(actions.className).toContain('before:h-11');
    expect(actions.className).toContain('rounded-full');
    expect(actions.className).not.toContain('normal-case');
    expect(actions.className).not.toMatch(
      /hover:(?:bg|border|text)-(?:blue|cyan|sky|indigo)/
    );
    expect(actions.className).not.toMatch(/hover:(?:-?translate|scale)/);

    const clear = screen.getByRole('button', { name: 'Clear Selection' });
    expect(clear).toHaveAttribute('data-size', 'icon-sm');
    expect(clear.className).toContain('h-7');
    expect(clear.className).toContain('w-7');
    expect(clear.className).toContain('rounded-full');
    expect(clear.className).toContain('overflow-visible');
    expect(clear.className).toContain('before:h-11');
    expect(clear.className).toContain('before:w-11');
    expect(clear.className).toContain('focus-visible:ring-focus/55');
    expect(clear.className).toContain('hover:bg-interactive-hover');
    expect(clear.className).not.toContain('rounded-md');
    expect(clear.className).not.toContain('hover:bg-surface-1');
    expect(clear.className).not.toMatch(
      /hover:(?:bg|border|text)-(?:blue|cyan|sky|indigo)/
    );
    expect(clear.className).not.toMatch(/hover:(?:-?translate|scale)/);
  });

  it('opens the menu and uses semantic destructive item state', async () => {
    const user = userEvent.setup();
    const onArchive = vi.fn();
    const onExport = vi.fn();
    const onDelete = vi.fn();

    render(
      <HeaderBulkActions
        selectedCount={2}
        bulkActions={[
          { label: 'Archive', onClick: onArchive },
          { label: 'Export', onClick: onExport, disabled: true },
          { label: 'Delete', onClick: onDelete, variant: 'destructive' },
        ]}
        onClearSelection={vi.fn()}
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

  it('keeps the header cluster geometry stable while the menu is open', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <HeaderBulkActions
        selectedCount={4}
        bulkActions={SAMPLE_ACTIONS}
        onClearSelection={vi.fn()}
      />
    );

    const root = container.firstElementChild as HTMLElement;
    const before = root.className;
    await user.click(screen.getByRole('button', { name: 'Actions' }));
    await screen.findByRole('menuitem', { name: 'Archive' });

    expect(root).toHaveClass('h-7');
    expect(root.className).toBe(before);
    expect(screen.getByText('4 selected')).toBeInTheDocument();
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
    const clear = screen.getByRole('button', { name: 'Clear Selection' });
    clear.focus();
    await user.keyboard('{Enter}');
    expect(onClearSelection).toHaveBeenCalledOnce();
  });

  it('has no accessibility violations in the selected idle state', async () => {
    const { container } = render(
      <HeaderBulkActions
        selectedCount={3}
        bulkActions={SAMPLE_ACTIONS}
        onClearSelection={vi.fn()}
      />
    );
    await expectNoA11yViolations(container);
  });
});
