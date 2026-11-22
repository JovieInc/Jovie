import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Copy, Pencil, Trash2 } from 'lucide-react';
import { TableRowActionBar } from './TableRowActionBar';

const meta: Meta<typeof TableRowActionBar> = {
  title: 'Organisms/Table/TableRowActionBar',
  component: TableRowActionBar,
  parameters: {
    layout: 'centered',
  },
};

export default meta;
type Story = StoryObj<typeof TableRowActionBar>;

export const RankedPrimaryAndOverflow: Story = {
  args: {
    actions: [
      {
        id: 'edit',
        label: 'Edit',
        icon: Pencil,
        priority: 10,
        onClick: () => undefined,
      },
      {
        id: 'copy',
        label: 'Copy',
        icon: Copy,
        priority: 20,
        onClick: () => undefined,
      },
      {
        id: 'delete',
        label: 'Delete',
        icon: Trash2,
        variant: 'destructive',
        onClick: () => undefined,
      },
    ],
  },
};

export const OverflowOnly: Story = {
  args: {
    maxPrimary: 0,
    overflowAriaLabel: 'Row actions',
    actions: [
      {
        id: 'edit',
        label: 'Edit',
        icon: Pencil,
        onClick: () => undefined,
      },
      {
        id: 'delete',
        label: 'Delete',
        icon: Trash2,
        variant: 'destructive',
        onClick: () => undefined,
      },
    ],
  },
};

export const HoverReveal: Story = {
  args: {
    visibility: 'hover',
    maxPrimary: 0,
    actions: [
      {
        id: 'edit',
        label: 'Edit',
        icon: Pencil,
        onClick: () => undefined,
      },
    ],
  },
  decorators: [
    Story => (
      <div className='group rounded-md border border-subtle p-6'>
        <Story />
      </div>
    ),
  ],
};
