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
