import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { ComponentProps } from 'react';
import {
  type ColumnDef,
  createColumnHelper,
  getCoreRowModel,
  type Row,
  useReactTable,
} from '@/lib/tanstack-table';
import { VirtualizedTableBody } from './VirtualizedTableBody';

type RowData = { id: string; title: string };

const data: RowData[] = [
  { id: 'one', title: 'Never Say A Word' },
  { id: 'two', title: 'Seaside Heights' },
];
// TanStack column arrays mix value types, so the value slot is any.
const columns: ColumnDef<RowData, any>[] = [
  createColumnHelper<RowData>().accessor('title', { header: 'Title' }),
];

// The body renders row.getVisibleCells(), so rows must come from a real
// table model, not hand-built objects.
function TableBodyWithModel(
  props: Omit<ComponentProps<typeof VirtualizedTableBody<RowData>>, 'rows'>
) {
  const table = useReactTable({
    data,
    columns,
    getRowId: row => row.id,
    getCoreRowModel: getCoreRowModel(),
  });
  const rows: Row<RowData>[] = table.getRowModel().rows;
  return <VirtualizedTableBody {...props} rows={rows} />;
}

const meta: Meta<typeof VirtualizedTableBody<RowData>> = {
  title: 'Organisms/Table/VirtualizedTableBody',
  component: VirtualizedTableBody,
  parameters: { layout: 'padded' },
};

export default meta;
type Story = StoryObj<typeof VirtualizedTableBody<RowData>>;

export const SearchableContextActions: Story = {
  render: args => (
    <table className='w-full text-primary-token'>
      <TableBodyWithModel {...args} />
    </table>
  ),
  args: {
    rows: [],
    shouldVirtualize: false,
    rowRefsMap: new Map(),
    shouldEnableKeyboardNav: false,
    focusedIndex: -1,
    onFocusChange: () => undefined,
    onKeyDown: () => undefined,
    columnCount: 1,
    contextMenuSearchable: true,
    contextMenuSearchPlaceholder: 'Search actions',
    contextMenuSearchMode: 'recursive',
    getContextMenuItems: row => [
      {
        id: 'copy-title',
        label: `Copy ${row.title}`,
        onClick: () => undefined,
      },
    ],
  },
};
