import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { ColumnDef } from '@/lib/tanstack-v8-compat';
import { UnifiedTableSkeleton } from './UnifiedTableSkeleton';

type RowData = { id: string; title: string };

const COLUMNS: ColumnDef<RowData, unknown>[] = [
  {
    accessorKey: 'title',
    id: 'title',
    header: 'Track',
    size: 320,
  },
  {
    accessorKey: 'id',
    id: 'id',
    header: 'ID',
    size: 120,
  },
];

const meta: Meta<typeof UnifiedTableSkeleton<RowData>> = {
  title: 'Organisms/Table/UnifiedTableSkeleton',
  component: UnifiedTableSkeleton,
  parameters: { layout: 'padded' },
};

export default meta;
type Story = StoryObj<typeof UnifiedTableSkeleton<RowData>>;

export const StreamingSkeleton: Story = {
  render: args => <UnifiedTableSkeleton {...args} />,
  args: {
    columns: COLUMNS,
    skeletonRows: 8,
  },
};

export const CompactRowHeight: Story = {
  render: args => <UnifiedTableSkeleton {...args} />,
  args: {
    columns: COLUMNS,
    skeletonRows: 4,
    rowHeight: 40,
  },
};
