import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import {
  type ColumnDef,
  createColumnHelper,
  getCoreRowModel,
  type Row,
  useReactTable,
} from '@/lib/tanstack-table';
import { VirtualizedTableRow } from './VirtualizedTableRow';

type Item = { id: string; name: string };

function mockRow(id: string, name: string): Row<Item> {
  return {
    id,
    original: { id, name },
    getVisibleCells: () => [
      {
        id: `${id}-name`,
        column: {
          id: 'name',
          columnDef: {
            cell: () => name,
            meta: undefined,
          },
          getSize: () => 160,
        },
        getContext: () => ({}),
      },
    ],
    getIsSelected: () => false,
  } as unknown as Row<Item>;
}

const meta: Meta<typeof VirtualizedTableRow> = {
  title: 'Organisms/Table/VirtualizedTableRow',
  component: VirtualizedTableRow,
  parameters: {
    layout: 'padded',
  },
};

export default meta;
type Story = StoryObj<typeof VirtualizedTableRow>;

export const Default: Story = {
  render: () => (
    <table className='w-full border border-subtle bg-surface text-primary'>
      <tbody>
        <VirtualizedTableRow
          row={mockRow('1', 'Alpha')}
          rowIndex={0}
          rowRefsMap={new Map()}
          shouldEnableKeyboardNav={false}
          shouldVirtualize={false}
          isFocused={false}
          onKeyDown={() => undefined}
          onFocusChange={() => undefined}
        />
      </tbody>
    </table>
  ),
};

type Release = {
  readonly id: string;
  readonly title: string;
  readonly artist?: string;
  readonly status?: string;
};

const releaseColumn = createColumnHelper<Release>();
// TanStack column arrays mix value types, so the value slot is any.
const releaseColumns: ColumnDef<Release, any>[] = [
  releaseColumn.accessor('title', { header: 'Title' }),
  releaseColumn.accessor('artist', {
    header: 'Artist',
    cell: info => info.getValue() ?? null,
  }),
  releaseColumn.accessor('status', {
    header: 'Status',
    cell: info => info.getValue() ?? null,
  }),
];

// Cells come from row.getVisibleCells(), so the row is built by a real table
// model rather than by hand.
function ReleaseRow({
  release,
  dir,
  caption,
}: {
  readonly release: Release;
  readonly dir?: 'rtl';
  readonly caption: string;
}) {
  const table = useReactTable({
    data: [release],
    columns: releaseColumns,
    getRowId: row => row.id,
    getCoreRowModel: getCoreRowModel(),
  });
  const [row] = table.getRowModel().rows;
  return (
    <table
      dir={dir}
      lang={dir === 'rtl' ? 'ar' : undefined}
      className='w-full max-w-xl table-fixed border border-subtle bg-surface text-sm text-primary-token'
    >
      <caption className='sr-only'>{caption}</caption>
      <tbody>
        <VirtualizedTableRow
          row={row}
          rowIndex={0}
          rowRefsMap={new Map()}
          shouldEnableKeyboardNav
          shouldVirtualize={false}
          isFocused
          onRowClick={() => undefined}
          onKeyDown={() => undefined}
          onFocusChange={() => undefined}
        />
      </tbody>
    </table>
  );
}

export const EmptyCellValues: Story = {
  render: () => (
    <ReleaseRow caption='Untitled release' release={{ id: 'r0', title: '' }} />
  ),
};

export const PartialMissingArtist: Story = {
  render: () => (
    <ReleaseRow
      caption='Release without an artist'
      release={{ id: 'r1', title: 'First Light', status: 'Draft' }}
    />
  ),
};

export const LongTitle: Story = {
  render: () => (
    <ReleaseRow
      caption='Release with a long title'
      release={{
        id: 'r2',
        title:
          'First Light (Extended Anniversary Remaster featuring The Midnight Orchestra and Friends)',
        artist: 'The Extraordinarily Long Named Midnight Orchestra Collective',
        status: 'Scheduled For Worldwide Release',
      }}
    />
  ),
};

export const RtlRelease: Story = {
  render: () => (
    <ReleaseRow
      dir='rtl'
      caption='إصدار'
      release={{
        id: 'r3',
        title: 'أول ضوء',
        artist: 'فرقة منتصف الليل',
        status: 'صدر',
      }}
    />
  ),
};
