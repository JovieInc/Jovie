import { useRef } from 'react';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { Row, Table } from '@/lib/tanstack-v8-compat';
import { createSelectionColumnFactory } from './createSelectionColumnFactory';

type RowData = { id: string; title: string };

const rows: RowData[] = [
  { id: 'one', title: 'Cosmic Gate — EDC Set' },
  { id: 'two', title: 'Seaside Heights (Extended Mix)' },
];

/**
 * Selection column factory — header/cell renderer pair used by the checkbox
 * column of dense workspace tables (admin users, waitlist, releases).
 */
const meta: Meta<typeof createSelectionColumnFactory> = {
  title: 'Organisms/Table/SelectionColumnFactory',
  parameters: { layout: 'padded' },
};

export default meta;
type Story = StoryObj<typeof createSelectionColumnFactory>;

export const HeaderAndCellRenderers: Story = {
  render: () => {
    const selectedIdsRef = useRef(new Set(['one']));
    const headerCheckboxStateRef = useRef<boolean | 'indeterminate'>(
      'indeterminate'
    );

    const { createHeaderRenderer, createCellRenderer } =
      createSelectionColumnFactory<RowData>({
        selectedIdsRef,
        headerCheckboxStateRef,
        getRowId: row => row.id,
        onToggleSelect: () => undefined,
        onToggleSelectAll: () => undefined,
      });

    const SelectHeader = createHeaderRenderer();
    const SelectCell = createCellRenderer();
    const mockTable = {} as Table<RowData>;

    return (
      <table className='w-full text-primary-token'>
        <thead>
          <tr>
            <th>
              <SelectHeader table={mockTable} />
            </th>
            <th>Track</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, index) => (
            <tr key={r.id}>
              <td>
                <SelectCell row={{ original: r, index } as Row<RowData>} />
              </td>
              <td>{r.title}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  },
};
