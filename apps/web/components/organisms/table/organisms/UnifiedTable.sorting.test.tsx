import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { ColumnDef, OnChangeFn, SortingState } from '@/lib/tanstack-table';
import { UnifiedTable } from './UnifiedTable';

type ContactRow = { id: string; role: string };
const contacts: ContactRow[] = [
  { id: 'press', role: 'press' },
  { id: 'bookings', role: 'bookings' },
  { id: 'management', role: 'management' },
];
const columns: ColumnDef<ContactRow, unknown>[] = [
  { accessorKey: 'role', header: 'Role' },
];
function roleOrder() {
  return screen.getAllByRole('cell').map(cell => cell.textContent);
}
function ControlledContacts({
  onChange,
}: {
  onChange: OnChangeFn<SortingState>;
}) {
  const [sorting, setSorting] = useState<SortingState>([]);
  return (
    <UnifiedTable
      data={contacts}
      columns={columns}
      enableVirtualization={false}
      sorting={sorting}
      onSortingChange={updater => {
        onChange(updater);
        setSorting(updater);
      }}
    />
  );
}

describe('UnifiedTable sorting ownership', () => {
  it('sorts uncontrolled contact roles by pointer and keeps header focus', async () => {
    const user = userEvent.setup();
    render(
      <UnifiedTable
        data={contacts}
        columns={columns}
        enableVirtualization={false}
      />
    );
    expect(roleOrder()).toEqual(['press', 'bookings', 'management']);
    const header = screen.getByRole('button', {
      name: 'Role: not sorted, activate to sort',
    });
    await user.click(header);
    expect(roleOrder()).toEqual(['bookings', 'management', 'press']);
    expect(screen.getByRole('columnheader')).toHaveAttribute(
      'aria-sort',
      'ascending'
    );
    expect(header).toHaveAccessibleName('Role: sorted ascending');
    expect(header).toHaveFocus();
  });

  it('cycles uncontrolled role sorting with Enter and Space', async () => {
    const user = userEvent.setup();
    render(
      <UnifiedTable
        data={contacts}
        columns={columns}
        enableVirtualization={false}
      />
    );
    const header = screen.getByRole('button', {
      name: 'Role: not sorted, activate to sort',
    });
    header.focus();
    await user.keyboard('{Enter}');
    expect(roleOrder()).toEqual(['bookings', 'management', 'press']);
    expect(header).toHaveAccessibleName('Role: sorted ascending');
    await user.keyboard(' ');
    expect(roleOrder()).toEqual(['press', 'management', 'bookings']);
    expect(screen.getByRole('columnheader')).toHaveAttribute(
      'aria-sort',
      'descending'
    );
    expect(header).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(roleOrder()).toEqual(['press', 'bookings', 'management']);
    expect(screen.getByRole('columnheader')).toHaveAttribute(
      'aria-sort',
      'none'
    );
  });

  it('retains controlled sorting ownership and follows the owner updates', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ControlledContacts onChange={onChange} />);
    await user.click(screen.getByRole('button', { name: /Role: not sorted/ }));
    expect(onChange).toHaveBeenCalledOnce();
    expect(roleOrder()).toEqual(['bookings', 'management', 'press']);
    await user.keyboard('{Enter}');
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(roleOrder()).toEqual(['press', 'management', 'bookings']);
  });

  it('does not override controlled state before its owner accepts a sort', async () => {
    const user = userEvent.setup();
    const onSortingChange = vi.fn();
    render(
      <UnifiedTable
        data={contacts}
        columns={columns}
        enableVirtualization={false}
        sorting={[]}
        onSortingChange={onSortingChange}
      />
    );
    await user.click(screen.getByRole('button', { name: /Role: not sorted/ }));
    expect(onSortingChange).toHaveBeenCalledOnce();
    expect(roleOrder()).toEqual(['press', 'bookings', 'management']);
    expect(screen.getByRole('columnheader')).toHaveAttribute(
      'aria-sort',
      'none'
    );
  });
});
