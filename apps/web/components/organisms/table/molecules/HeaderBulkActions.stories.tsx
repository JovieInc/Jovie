import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { HeaderBulkActions } from './HeaderBulkActions';

const meta: Meta<typeof HeaderBulkActions> = {
  title: 'Organisms/Table/HeaderBulkActions',
  component: HeaderBulkActions,
  parameters: {
    layout: 'centered',
    jovie: {
      uncoveredProps: ['disabled'],
    },
  },
};

export default meta;
type Story = StoryObj<typeof HeaderBulkActions>;

export const Selected: Story = {
  args: {
    selectedCount: 3,
    bulkActions: [
      { label: 'Archive', onClick: () => undefined },
      { label: 'Export', onClick: () => undefined, disabled: true },
      { label: 'Delete', onClick: () => undefined, variant: 'destructive' },
    ],
    onClearSelection: () => undefined,
  },
};
