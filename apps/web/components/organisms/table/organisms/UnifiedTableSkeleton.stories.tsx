import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { ColumnDef } from '@/lib/tanstack-table';
import { UnifiedTableSkeleton } from './UnifiedTableSkeleton';

type RowData = { id: string; title: string; artist: string };

const columns: ColumnDef<RowData, unknown>[] = [
  { accessorKey: 'title', header: 'Title' },
  { accessorKey: 'artist', header: 'Artist' },
];

const meta: Meta<typeof UnifiedTableSkeleton<RowData>> = {
  title: 'Organisms/Table/UnifiedTableSkeleton',
  component: UnifiedTableSkeleton,
  parameters: {
    layout: 'padded',
  },
};

export default meta;
type Story = StoryObj<typeof UnifiedTableSkeleton<RowData>>;

export const Default: Story = {
  args: {
    columns,
    skeletonRows: 8,
  },
};

export const HiddenHeader: Story = {
  args: {
    columns,
    skeletonRows: 8,
    hideHeader: true,
  },
};

export const LoadingReleases: Story = {
  args: {
    columns,
    skeletonRows: 6,
    skeletonColumnConfig: [
      { width: '240px', variant: 'release' },
      { width: '160px', variant: 'person' },
    ],
  },
};

export const PartialColumnConfig: Story = {
  args: {
    columns,
    skeletonRows: 6,
    skeletonColumnConfig: [{ width: '240px', variant: 'release' }],
  },
};

const longColumns: ColumnDef<RowData, unknown>[] = [
  {
    accessorKey: 'title',
    header: 'Release Title Including Every Featured Artist And Remix Credit',
  },
  {
    accessorKey: 'artist',
    header: 'Primary Artist Or Collective Responsible For The Release',
  },
];

export const LongHeaderLabels: Story = {
  args: {
    columns: longColumns,
    skeletonRows: 6,
  },
  decorators: [
    Story => (
      <div className='w-112'>
        <Story />
      </div>
    ),
  ],
};

const arabicColumns: ColumnDef<RowData, unknown>[] = [
  { accessorKey: 'title', header: 'العنوان' },
  { accessorKey: 'artist', header: 'الفنان' },
];

export const RtlHeaders: Story = {
  args: {
    columns: arabicColumns,
    skeletonRows: 6,
  },
  decorators: [
    Story => (
      <div dir='rtl' lang='ar'>
        <Story />
      </div>
    ),
  ],
};
