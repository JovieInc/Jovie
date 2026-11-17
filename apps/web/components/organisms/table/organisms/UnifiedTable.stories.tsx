import '@/styles/system-b-app.css';
import { Button } from '@jovie/ui';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { useState } from 'react';
import type { ColumnDef, RowSelectionState } from '@/lib/tanstack-table';
import { PersonCell } from '../atoms/PersonCell';
import { TableEmptyState } from '../atoms/TableEmptyState';
import { UnifiedTable } from './UnifiedTable';

type RowData = { id: string; title: string; artist: string };

const columns: ColumnDef<RowData, unknown>[] = [
  { accessorKey: 'title', header: 'Title' },
  { accessorKey: 'artist', header: 'Artist' },
];

const data: RowData[] = [
  { id: 'one', title: 'Never Say A Word', artist: 'Tim White' },
  { id: 'two', title: 'Seaside Heights', artist: 'Tim White' },
];

const meta: Meta<typeof UnifiedTable<RowData>> = {
  title: 'Organisms/Table/UnifiedTable',
  component: UnifiedTable,
  parameters: {
    layout: 'padded',
    jovie: { uncoveredProps: ['loading'] },
  },
};

export default meta;
type Story = StoryObj<typeof UnifiedTable<RowData>>;

export const SearchableContextActions: Story = {
  args: {
    data,
    columns,
    enableVirtualization: false,
    getRowId: row => row.id,
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

export const Loading: Story = {
  args: {
    data,
    columns,
    isLoading: true,
    skeletonRows: 2,
  },
};

function ResponsiveColumnsExample() {
  const [showArtist, setShowArtist] = useState(true);
  return (
    <div className='space-y-3'>
      <Button onClick={() => setShowArtist(value => !value)}>
        {showArtist ? 'Hide artist column' : 'Show artist column'}
      </Button>
      <UnifiedTable
        data={data}
        columns={columns}
        columnVisibility={{ artist: showArtist }}
        enableVirtualization={false}
      />
    </div>
  );
}

export const ResponsiveColumns: Story = {
  render: () => <ResponsiveColumnsExample />,
};

function RowModeScrollFixture() {
  const [loading, setLoading] = useState(true);
  return (
    <div className='space-y-3'>
      <Button onClick={() => setLoading(value => !value)}>
        {loading ? 'Show rows' : 'Show loading'}
      </Button>
      <UnifiedTable
        data={Array.from({ length: 200 }, (_, index) => ({
          id: `row-${index}`,
          title: `Release ${index + 1}`,
          artist: 'Fixture artist',
        }))}
        columns={columns}
        rowMode='two-line'
        isLoading={loading}
        skeletonRows={7}
        enableVirtualization
        containerClassName='h-96'
        getRowId={row => row.id}
      />
    </div>
  );
}

export const RowModeLoadingAndScroll: Story = {
  render: () => <RowModeScrollFixture />,
};

type PersonRow = {
  id: string;
  name: string;
  email: string;
  role: string;
  city: string;
  lastSeen: string;
};

const people: PersonRow[] = [
  ['Maya Okafor', 'maya@example.com', 'Superfan', 'Lagos', '2m'],
  ['Jonas Feld', 'jonas@example.com', 'Subscriber', 'Berlin', '14m'],
  ['Priya Raman', 'priya@example.com', 'Buyer', 'Chennai', '1h'],
  ['Luca Moretti', 'luca@example.com', 'Subscriber', 'Milan', '3h'],
  ['Ana Souza', 'ana@example.com', 'Superfan', 'São Paulo', '5h'],
  ['Kenji Arai', 'kenji@example.com', 'Tipper', 'Osaka', '1d'],
  ['Zoë Laurent', 'zoe@example.com', 'Subscriber', 'Lyon', '2d'],
  ['Sam Rivers', 'sam@example.com', 'Buyer', 'Austin', '3d'],
].map(([name, email, role, city, lastSeen], index) => ({
  id: `person-${index}`,
  name,
  email,
  role,
  city,
  lastSeen,
}));

const peopleColumns: ColumnDef<PersonRow, unknown>[] = [
  {
    id: 'person',
    header: 'Name',
    cell: ({ row }) => (
      <PersonCell name={row.original.name} secondary={row.original.email} />
    ),
    size: 320,
  },
  { accessorKey: 'role', header: 'Role', size: 140 },
  { accessorKey: 'city', header: 'City', size: 140 },
  {
    accessorKey: 'lastSeen',
    header: 'Last seen',
    size: 96,
    meta: { align: 'right' },
  },
];

function DensePeopleExample() {
  const [selected, setSelected] = useState<RowSelectionState>({
    'person-1': true,
  });
  return (
    <UnifiedTable
      data={people}
      columns={peopleColumns}
      rowMode='dense'
      enableVirtualization={false}
      enableKeyboardNavigation
      getRowId={row => row.id}
      rowSelection={selected}
      onToggleRowSelection={row =>
        setSelected(previous => {
          const next = { ...previous };
          if (next[row.id]) delete next[row.id];
          else next[row.id] = true;
          return next;
        })
      }
      onRowClick={() => undefined}
    />
  );
}

/** The one people row: 32px, 20px face, j/k, x selects, Shift+J/K extends. */
export const DensePeople: Story = {
  render: () => <DensePeopleExample />,
};

export const DensePeopleLoading: Story = {
  render: () => (
    <UnifiedTable
      data={[]}
      columns={peopleColumns}
      rowMode='dense'
      isLoading
      skeletonRows={6}
      skeletonColumnConfig={[
        { width: '220px', variant: 'person' },
        { width: '72px', variant: 'text' },
        { width: '72px', variant: 'text' },
        { width: '32px', variant: 'text' },
      ]}
    />
  ),
};

type CatalogRow = {
  readonly id: string;
  readonly title: string;
  readonly artist?: string;
  readonly status?: string;
};

const catalogColumns: ColumnDef<CatalogRow, unknown>[] = [
  { accessorKey: 'title', header: 'Title', size: 280 },
  {
    accessorKey: 'artist',
    header: 'Artist',
    size: 200,
    cell: ({ getValue }) => (getValue() as string | undefined) ?? null,
  },
  {
    accessorKey: 'status',
    header: 'Status',
    size: 140,
    cell: ({ getValue }) => (getValue() as string | undefined) ?? null,
  },
];

const NO_CATALOG_ROWS: CatalogRow[] = [];

export const EmptyCatalog: Story = {
  render: () => (
    <UnifiedTable
      data={NO_CATALOG_ROWS}
      columns={catalogColumns}
      enableVirtualization={false}
      caption='Releases'
      emptyState={
        <TableEmptyState
          heading='No releases yet'
          description='Add your first release to start building your smart links.'
          action={{ label: 'Add Release', onClick: () => undefined }}
        />
      }
    />
  ),
};

export const PartialMissingValues: Story = {
  render: () => (
    <UnifiedTable
      data={[
        {
          id: 'one',
          title: 'Never Say A Word',
          artist: 'Tim White',
          status: 'Released',
        },
        { id: 'two', title: 'Seaside Heights', status: 'Draft' },
        { id: 'three', title: 'Untitled Demo' },
      ]}
      columns={catalogColumns}
      enableVirtualization={false}
      getRowId={row => row.id}
      caption='Releases'
    />
  ),
};

export const LongCellContent: Story = {
  render: () => (
    <div className='max-w-2xl'>
      <UnifiedTable
        data={[
          {
            id: 'one',
            title:
              'First Light (Extended Anniversary Remaster featuring The Midnight Orchestra and Friends)',
            artist:
              'The Extraordinarily Long Named Midnight Orchestra Collective',
            status: 'Scheduled For Worldwide Release',
          },
          {
            id: 'two',
            title: 'Seaside Heights',
            artist: 'Tim White',
            status: 'Released',
          },
        ]}
        columns={catalogColumns}
        enableVirtualization={false}
        getRowId={row => row.id}
        caption='Releases'
      />
    </div>
  ),
};

export const OfflineEmptyState: Story = {
  render: () => (
    <UnifiedTable
      data={NO_CATALOG_ROWS}
      columns={catalogColumns}
      enableVirtualization={false}
      caption='Releases'
      emptyState={
        <TableEmptyState
          variant='error'
          heading='You are offline'
          description='Reconnect to the internet to load your releases.'
          action={{ label: 'Try Again', onClick: () => undefined }}
        />
      }
    />
  ),
};

export const PermissionDeniedEmptyState: Story = {
  render: () => (
    <UnifiedTable
      data={NO_CATALOG_ROWS}
      columns={catalogColumns}
      enableVirtualization={false}
      caption='Team releases'
      emptyState={
        <TableEmptyState
          variant='permission'
          heading='You do not have access to these releases'
          description='Ask a workspace owner to share the catalog with you.'
        />
      }
    />
  ),
};

const arabicColumns: ColumnDef<CatalogRow, unknown>[] = [
  { accessorKey: 'title', header: 'العنوان', size: 240 },
  { accessorKey: 'artist', header: 'الفنان', size: 200 },
  { accessorKey: 'status', header: 'الحالة', size: 120 },
];

export const RtlCatalog: Story = {
  render: () => (
    <div dir='rtl' lang='ar'>
      <UnifiedTable
        data={[
          {
            id: 'one',
            title: 'أول ضوء',
            artist: 'فرقة منتصف الليل',
            status: 'صدر',
          },
          {
            id: 'two',
            title: 'مرتفعات الشاطئ',
            artist: 'ليلى حداد',
            status: 'مسودة',
          },
        ]}
        columns={arabicColumns}
        enableVirtualization={false}
        getRowId={row => row.id}
        caption='الإصدارات'
      />
    </div>
  ),
};
