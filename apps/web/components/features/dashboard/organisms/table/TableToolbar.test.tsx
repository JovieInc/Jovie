import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { TableToolbar } from './TableToolbar';

type Props = ComponentProps<typeof TableToolbar>;

function renderToolbar(overrides: Partial<Props> = {}) {
  const onSelectAll = vi.fn();
  const onDeselectAll = vi.fn();
  const view = render(
    <TableToolbar
      totalCount={42}
      onSelectAll={onSelectAll}
      onDeselectAll={onDeselectAll}
      bulkActions={<button type='button'>Delete</button>}
      actions={<button type='button'>Export</button>}
      {...overrides}
    />
  );
  return { ...view, onSelectAll, onDeselectAll };
}

describe('TableToolbar certificate', () => {
  it('selects every row from an empty selection and shows primary actions', async () => {
    const user = userEvent.setup();
    const { container, onSelectAll, onDeselectAll } = renderToolbar();

    const checkbox = screen.getByRole('checkbox', { name: 'Select All Rows' });
    expect(checkbox).not.toBeChecked();
    expect(screen.getByText('42 total')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Export' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull();
    await expectNoA11yViolations(container);

    await user.click(checkbox);
    expect(onSelectAll).toHaveBeenCalledTimes(1);
    expect(onDeselectAll).not.toHaveBeenCalled();
  });

  it('clears the selection when every row is selected and swaps in bulk actions', async () => {
    const user = userEvent.setup();
    const { container, onSelectAll, onDeselectAll } = renderToolbar({
      selectedCount: 42,
    });

    const checkbox = screen.getByRole('checkbox', { name: 'Select All Rows' });
    expect(checkbox).toBeChecked();
    expect(screen.getByText('42 selected')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Export' })).toBeNull();
    await expectNoA11yViolations(container);

    await user.click(checkbox);
    expect(onDeselectAll).toHaveBeenCalledTimes(1);
    expect(onSelectAll).not.toHaveBeenCalled();
  });

  it('is mixed for a partial selection and selects the rest from the keyboard', async () => {
    const user = userEvent.setup();
    const { container, onSelectAll } = renderToolbar({ selectedCount: 5 });

    const checkbox = screen.getByRole('checkbox', { name: 'Select All Rows' });
    expect(checkbox).toHaveAttribute('aria-checked', 'mixed');
    expect(screen.getByText('5 selected')).toBeInTheDocument();
    await expectNoA11yViolations(container);

    await user.tab();
    expect(checkbox).toHaveFocus();
    await user.keyboard(' ');
    expect(onSelectAll).toHaveBeenCalledTimes(1);
  });

  it.each<[string, Partial<Props>]>([
    ['no select-all handler', { onSelectAll: undefined }],
    ['no deselect-all handler', { onDeselectAll: undefined }],
  ])('omits the checkbox with %s', async (_case, overrides) => {
    const { container } = renderToolbar({
      ...overrides,
      totalCount: 0,
      actions: undefined,
      bulkActions: undefined,
    });

    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByText('0 total')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('merges a caller class onto the toolbar', () => {
    const { container } = renderToolbar({ className: 'sticky top-0' });
    expect(container.firstElementChild).toHaveClass('sticky', 'top-0', 'flex');
  });
});
