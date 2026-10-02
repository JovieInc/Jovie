import '@/styles/system-b-app.css';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { ColumnDef } from '@/lib/tanstack-table';
import { UnifiedTable } from './UnifiedTable';

interface DemoRow {
  readonly id: string;
  readonly fan: string;
  readonly state: string;
  readonly alerts: string;
  readonly engagement: string;
  readonly last: string;
}

const rows: DemoRow[] = [
  {
    id: '1',
    fan: 'Avery Chen',
    state: 'Active',
    alerts: 'SMS',
    engagement: '82',
    last: '2h',
  },
  {
    id: '2',
    fan: 'Jordan Blake',
    state: 'New',
    alerts: 'Email',
    engagement: '40',
    last: '1d',
  },
];

const columns: ColumnDef<DemoRow, unknown>[] = [
  {
    accessorKey: 'fan',
    header: 'Fan',
    size: 9999,
    minSize: 220,
    meta: { primary: true, minWidth: 380 },
  },
  {
    id: 'state',
    accessorKey: 'state',
    header: 'State',
    size: 96,
    meta: {
      priority: 2,
      minWidth: 200,
      compact: row => row.state,
    },
  },
  {
    id: 'last',
    accessorKey: 'last',
    header: 'Last Seen',
    size: 72,
    meta: {
      priority: 2,
      minWidth: 140,
      compact: row => row.last,
    },
  },
  {
    id: 'alerts',
    accessorKey: 'alerts',
    header: 'Alerts',
    size: 96,
    meta: {
      priority: 1,
      minWidth: 120,
      compact: row => row.alerts,
    },
  },
  {
    id: 'engagement',
    accessorKey: 'engagement',
    header: 'Engagement',
    size: 96,
    meta: {
      priority: 1,
      minWidth: 120,
      compact: row => row.engagement,
    },
  },
];

function PriorityWidthFrame({ width }: { readonly width: number }) {
  return (
    <div className='space-y-2' style={{ width }}>
      <p className='text-2xs text-tertiary-token tabular-nums'>
        {width}px container
      </p>
      <UnifiedTable
        data={rows}
        columns={columns}
        enableVirtualization={false}
        getRowId={row => row.id}
        minWidth='0'
        caption='Audience'
      />
    </div>
  );
}

const meta: Meta<typeof PriorityWidthFrame> = {
  title: 'Organisms/Table/ColumnPriority',
  component: PriorityWidthFrame,
  parameters: { layout: 'padded' },
};

export default meta;
type Story = StoryObj<typeof PriorityWidthFrame>;

export const Narrow: Story = {
  render: () => <PriorityWidthFrame width={640} />,
};

export const Medium: Story = {
  render: () => <PriorityWidthFrame width={800} />,
};

export const Wide: Story = {
  render: () => <PriorityWidthFrame width={1100} />,
};
