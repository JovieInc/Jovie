import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import {
  getCoreRowModel,
  type Header,
  useReactTable,
} from '@/lib/tanstack-table';
import { TableHeaderCell } from './TableHeaderCell';

type Row = { title: string };

/** A real header from a one-column table, so the story needs no type casts. */
function useHeader(label: string, placeholder: boolean): Header<Row, unknown> {
  const table = useReactTable<Row>({
    data: [],
    columns: [{ id: 'col', header: label, accessorFn: row => row.title }],
    getCoreRowModel: getCoreRowModel(),
  });
  const header = table.getFlatHeaders()[0];
  if (!header) throw new Error('the story table has one column');
  return placeholder ? { ...header, isPlaceholder: true } : header;
}

const meta: Meta<typeof TableHeaderCell<Row>> = {
  title: 'Organisms/Table/TableHeaderCell/States',
  component: TableHeaderCell,
  parameters: { layout: 'centered' },
};

export default meta;
type Story = StoryObj<typeof TableHeaderCell<Row>>;

function HeaderFrame({
  label,
  placeholder = false,
  canSort,
  dir,
}: {
  readonly label: string;
  readonly placeholder?: boolean;
  readonly canSort: boolean;
  readonly dir?: 'rtl';
}) {
  const header = useHeader(label, placeholder);
  return (
    <table dir={dir} className='w-48 table-fixed'>
      <thead>
        <tr>
          <TableHeaderCell
            header={header}
            canSort={canSort}
            sortDirection='desc'
            stickyHeaderClass='sticky top-0 bg-surface-1'
            tableHeaderClass='text-sm font-medium text-primary-token'
            onToggleSort={() => undefined}
          />
        </tr>
      </thead>
    </table>
  );
}

/** Empty: a placeholder header renders its cell with no content. */
export const Empty: Story = {
  render: () => <HeaderFrame label='Group' placeholder canSort={false} />,
};

/** Partial: a plain header that cannot be sorted. */
export const Partial: Story = {
  render: () => <HeaderFrame label='Actions' canSort={false} />,
};

/** LongContent: a long label truncates beside the sort indicator. */
export const LongContent: Story = {
  render: () => (
    <HeaderFrame
      label='Monthly listeners across every connected platform'
      canSort
    />
  ),
};

/** Rtl: the sort indicator mirrors to the end edge. */
export const Rtl: Story = {
  render: () => <HeaderFrame label='العنوان' canSort dir='rtl' />,
};
