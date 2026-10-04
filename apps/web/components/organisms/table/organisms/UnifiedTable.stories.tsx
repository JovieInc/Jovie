import '@/styles/system-b-app.css';
import { Button } from '@jovie/ui';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { useState } from 'react';
import type { ColumnDef } from '@/lib/tanstack-table';
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
