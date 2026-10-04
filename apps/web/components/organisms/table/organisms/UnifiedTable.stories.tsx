import '@/styles/system-b-app.css';
import { Button } from '@jovie/ui';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { useState } from 'react';
import type { ColumnDef } from '@/lib/tanstack-table';
import { PersonCell } from '../atoms/PersonCell';
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
  const [selected, setSelected] = useState<Record<string, boolean>>({
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
        setSelected(previous => ({ ...previous, [row.id]: !previous[row.id] }))
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
