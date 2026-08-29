import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Archive, Trash2 } from 'lucide-react';
import { HeaderBulkActions } from './HeaderBulkActions';

const meta: Meta<typeof HeaderBulkActions> = {
  title: 'Organisms/Table/HeaderBulkActions',
  component: HeaderBulkActions,
  parameters: {
    layout: 'centered',
  },
};

export default meta;
type Story = StoryObj<typeof HeaderBulkActions>;

export const Selected: Story = {
  args: {
    selectedCount: 3,
    bulkActions: [
      { label: 'Archive', icon: <Archive />, onClick: () => undefined },
      { label: 'Export', onClick: () => undefined, disabled: true },
      {
        label: 'Delete',
        icon: <Trash2 />,
        onClick: () => undefined,
        variant: 'destructive',
      },
    ],
    onClearSelection: () => undefined,
  },
};

export const ClearOnly: Story = {
  args: {
    selectedCount: 2,
    bulkActions: [],
    onClearSelection: () => undefined,
  },
};
