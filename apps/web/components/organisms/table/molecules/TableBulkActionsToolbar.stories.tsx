import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Archive, Trash2 } from 'lucide-react';
import { TableBulkActionsToolbar } from './TableBulkActionsToolbar';

const meta: Meta<typeof TableBulkActionsToolbar> = {
  title: 'Organisms/Table/TableBulkActionsToolbar',
  component: TableBulkActionsToolbar,
  parameters: {
    layout: 'padded',
  },
  decorators: [
    Story => (
      <div className='relative min-h-11'>
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof TableBulkActionsToolbar>;

export const Hidden: Story = {
  args: {
    selectedCount: 0,
    onClearSelection: () => undefined,
    actions: [],
  },
};

export const Selected: Story = {
  args: {
    selectedCount: 3,
    onClearSelection: () => undefined,
    actions: [
      { label: 'Archive', icon: <Archive />, onClick: () => undefined },
      { label: 'Export', onClick: () => undefined, disabled: true },
      {
        label: 'Delete',
        icon: <Trash2 />,
        onClick: () => undefined,
        variant: 'destructive',
      },
    ],
  },
};
