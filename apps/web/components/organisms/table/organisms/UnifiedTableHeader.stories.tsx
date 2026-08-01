import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import {
  createColumnHelper,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { UnifiedTableHeader } from './UnifiedTableHeader';

type Row = { id: string; title: string; count: number };

const columnHelper = createColumnHelper<Row>();

function HeaderHarness() {
  const columns = [
    columnHelper.accessor('title', {
      header: 'Title',
      enableSorting: true,
    }),
    columnHelper.accessor('count', {
      header: 'Count',
      enableSorting: true,
    }),
    columnHelper.display({
      id: 'actions',
      header: 'Actions',
      enableSorting: false,
    }),
  ];

  const table = useReactTable({
    data: [
      { id: '1', title: 'Alpha', count: 2 },
      { id: '2', title: 'Beta', count: 1 },
    ],
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <table className='w-full border border-subtle bg-surface text-primary'>
      <UnifiedTableHeader
        headerGroups={table.getHeaderGroups()}
        caption='Dense table header'
      />
    </table>
  );
}

const meta: Meta<typeof UnifiedTableHeader> = {
  title: 'Organisms/Table/UnifiedTableHeader',
  component: UnifiedTableHeader,
  parameters: {
    layout: 'padded',
  },
};

export default meta;
type Story = StoryObj<typeof UnifiedTableHeader>;

export const Default: Story = {
  render: () => <HeaderHarness />,
};
