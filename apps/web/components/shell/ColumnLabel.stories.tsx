import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import { ColumnLabel } from './ColumnLabel';

type Field = 'title' | 'artist' | 'releaseDate';

const meta = {
  title: 'Shell/ColumnLabel',
  component: ColumnLabel<Field>,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => (
      <div className='bg-base p-4'>
        <Story />
      </div>
    ),
  ],
  args: {
    field: 'title',
    label: 'Title',
    align: 'left',
    sortBy: 'title',
    sortDir: 'asc',
    onSort: fn(),
  },
} satisfies Meta<typeof ColumnLabel<Field>>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ActiveAscending: Story = {};

export const ActiveDescending: Story = {
  args: {
    sortDir: 'desc',
  },
};

export const Inactive: Story = {
  args: {
    sortBy: 'artist',
  },
};

export const RightAligned: Story = {
  args: {
    field: 'releaseDate',
    label: 'Release date',
    align: 'right',
    sortBy: 'releaseDate',
  },
};
