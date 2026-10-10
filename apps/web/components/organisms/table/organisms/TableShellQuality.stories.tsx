import '@/styles/system-b-app.css';
import { Button } from '@jovie/ui';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { useState } from 'react';
import { PresenceIdentityPhoto } from '@/app/app/(shell)/profiles/PresenceIdentityPhoto';
import type { ColumnDef } from '@/lib/tanstack-table';
import { UnifiedTable } from './UnifiedTable';

type Row = { id: string; title: string; group: string };
const columns: ColumnDef<Row, unknown>[] = [
  { accessorKey: 'title', header: 'Page' },
];
const data: Row[] = Array.from({ length: 1000 }, (_, index) => ({
  id: `row-${index}`,
  title: `Page ${index + 1}`,
  group: index < 30 ? 'Marketing' : 'Editorial',
}));
const grouping = {
  getGroupKey: (row: Row) => row.group,
  getGroupLabel: (group: string) => group,
};

function GroupedFixture() {
  const [count, setCount] = useState(30);
  const [loading, setLoading] = useState(false);
  const [headerHidden, setHeaderHidden] = useState(false);
  return (
    <div className='space-y-3'>
      <Button onClick={() => setHeaderHidden(value => !value)}>
        Toggle column header
      </Button>
      <output aria-label='Loaded pages'>{count}</output>
      <UnifiedTable
        caption='Grouped Presence quality fixture'
        data={data.slice(0, count)}
        columns={columns}
        groupingConfig={grouping}
        hideHeader={headerHidden}
        enableVirtualization={false}
        enableKeyboardNavigation
        onRowClick={() => undefined}
        getRowId={row => row.id}
        getRowTestId={row => row.id}
        containerClassName='h-72'
        onLoadMore={() => setLoading(true)}
        isFetchingNextPage={loading}
        hasNextPage={count < 60}
      />
      <Button
        disabled={!loading}
        onClick={() => {
          setCount(60);
          setLoading(false);
        }}
      >
        Resolve next page
      </Button>
    </div>
  );
}

function VirtualFixture() {
  return (
    <div className='space-y-3'>
      <input
        aria-label='Other work'
        className='border border-subtle bg-surface-1 text-primary-token'
      />
      <UnifiedTable
        caption='Virtual Presence quality fixture'
        data={data}
        columns={columns}
        enableVirtualization
        enableKeyboardNavigation
        onRowClick={() => undefined}
        getRowId={row => row.id}
        getRowTestId={row => row.id}
        containerClassName='h-72'
        rowHeight={56}
      />
    </div>
  );
}

const meta = {
  title: 'Organisms/Table/ShellQuality',
  component: UnifiedTable<Row>,
  args: { data: [], columns },
  parameters: { layout: 'padded' },
} satisfies Meta<typeof UnifiedTable<Row>>;
export default meta;
type Story = StoryObj<typeof meta>;
export const GroupedPagination: Story = { render: () => <GroupedFixture /> };
export const VirtualKeyboard: Story = { render: () => <VirtualFixture /> };

const identityColumns: ColumnDef<Row, unknown>[] = [
  {
    accessorKey: 'title',
    header: 'Platform / Page',
    size: 260,
    cell: context => (
      <div className='flex min-w-0 items-center gap-2.5'>
        <PresenceIdentityPhoto
          artistName='Example artist'
          subject={{
            kind: 'profile',
            platform: 'facebook',
            label: context.row.original.title,
            handle: 'example-artist',
            url: 'https://www.facebook.com/example-artist',
            monitoringState: 'monitored',
          }}
        />
        <div className='min-w-0'>
          <div className='truncate'>{context.row.original.title}</div>
          <div className='truncate text-secondary-token'>@example-artist</div>
        </div>
      </div>
    ),
  },
  { accessorKey: 'group', header: 'Type', size: 140 },
];

function IdentityFixture({
  grouped = false,
  virtual = false,
}: {
  grouped?: boolean;
  virtual?: boolean;
}) {
  const [canonical, setCanonical] = useState(false);
  return (
    <div className='space-y-3'>
      <Button
        onClick={() => setCanonical(value => !value)}
        aria-pressed={canonical}
      >
        Use two-line rows
      </Button>
      <div style={{ height: 400, width: '100%', maxWidth: 720 }}>
        <UnifiedTable
          caption='Presence identity geometry fixture'
          data={data.slice(0, 60)}
          columns={identityColumns}
          rowHeight={56}
          rowMode={canonical ? 'two-line' : undefined}
          groupingConfig={grouped ? grouping : undefined}
          enableVirtualization={virtual}
          enableKeyboardNavigation
          onRowClick={() => undefined}
          getRowId={row => row.id}
          getRowTestId={row => row.id}
          containerClassName='h-full'
          minWidth='0'
        />
      </div>
    </div>
  );
}

export const ProfileIdentityCells: Story = {
  render: () => <IdentityFixture />,
};
export const ProfileIdentityCellsGrouped: Story = {
  render: () => <IdentityFixture grouped />,
};
export const ProfileIdentityCellsVirtual: Story = {
  render: () => <IdentityFixture virtual />,
};
