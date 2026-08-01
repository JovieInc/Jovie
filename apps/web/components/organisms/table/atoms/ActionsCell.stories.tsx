import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ActionsCell } from './ActionsCell';

const meta: Meta<typeof ActionsCell> = {
  title: 'Organisms/Table/ActionsCell',
  component: ActionsCell,
  parameters: {
    layout: 'centered',
  },
};

export default meta;
type Story = StoryObj<typeof ActionsCell>;

export const Default: Story = {
  args: {
    children: (
      <button
        type='button'
        className='rounded-full border border-subtle bg-surface px-3 py-1 text-sm text-primary'
      >
        Open
      </button>
    ),
  },
};

export const DenseContextual: Story = {
  args: {
    className: 'system-b-table-contextual-action-cell',
    children: (
      <button
        type='button'
        className='rounded-full border border-subtle bg-surface px-3 py-1 text-sm text-primary'
      >
        More
      </button>
    ),
  },
};
