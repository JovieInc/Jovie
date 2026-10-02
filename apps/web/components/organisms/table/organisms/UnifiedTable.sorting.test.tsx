import { render, screen, within } from '@testing-library/react';
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

const data = [
  { id: 'fan', name: 'Fan', engagement: 'High', lastSeen: 'Today' },
];
const responsiveColumns: ColumnDef<(typeof data)[number], unknown>[] = [
  { accessorKey: 'name', header: 'Fan' },
  { accessorKey: 'engagement', header: 'Engagement' },
  { accessorKey: 'lastSeen', header: 'Last Seen' },
];

describe('UnifiedTable responsive columns', () => {
  it.each([false, true])(
    'keeps body cells aligned when columns change (grouped: %s)',
    grouped => {
      const props = {
        data,
        columns: responsiveColumns,
        enableVirtualization: false,
        groupingConfig: grouped
          ? { getGroupKey: () => 'fans', getGroupLabel: () => 'Fans' }
          : undefined,
      };
      const { rerender } = render(<UnifiedTable {...props} />);
      const cells = () =>
        within(screen.getByRole('cell', { name: /^Fan$/ }).closest('tr')!)
          .getAllByRole('cell')
          .map(cell => cell.textContent);

      expect(cells()).toEqual(['Fan', 'High', 'Today']);
      rerender(
        <UnifiedTable {...props} columnVisibility={{ engagement: false }} />
      );
      expect(screen.getAllByRole('columnheader')).toHaveLength(2);
      expect(cells()).toEqual(['Fan', 'Today']);

      rerender(
        <UnifiedTable {...props} columnVisibility={{ engagement: true }} />
      );
      expect(screen.getAllByRole('columnheader')).toHaveLength(3);
      expect(cells()).toEqual(['Fan', 'High', 'Today']);
    }
  );
});

describe('UnifiedTable row mode geometry', () => {
  it.each([
    ['two-line', '56px', '48px'],
    ['description', '72px', '64px'],
    ['controls', '96px', '88px'],
  ] as const)(
    'shares the %s geometry between loading and data rows',
    (rowMode, rowHeight, contentHeight) => {
      const { rerender } = render(
        <UnifiedTable
          data={contacts}
          columns={columns}
          rowMode={rowMode}
          isLoading
          enableVirtualization={false}
        />
      );
      const table = screen.getByRole('table');
      expect(table.style.getPropertyValue('--table-row-height')).toBe(
        rowHeight
      );
      expect(table.style.getPropertyValue('--table-cell-content-height')).toBe(
        contentHeight
      );
      expect(table.querySelector('tbody tr')).toHaveStyle({
        height: rowHeight,
      });
      rerender(
        <UnifiedTable
          data={contacts}
          columns={columns}
          rowMode={rowMode}
          enableVirtualization={false}
        />
      );
      expect(screen.getByRole('table')).toHaveAttribute(
        'data-table-row-mode',
        rowMode
      );
      expect(
        screen
          .getByRole('table')
          .style.getPropertyValue('--table-cell-content-height')
      ).toBe(contentHeight);
      expect(roleOrder()).toEqual(['press', 'bookings', 'management']);
    }
  );
});
