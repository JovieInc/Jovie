import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { SortableHeaderButton } from './SortableHeaderButton';

const meta = {
  title: 'Organisms/Table/SortableHeaderButton',
  component: SortableHeaderButton,
  parameters: {
    layout: 'centered',
  },
  args: {
    label: 'Release Date',
    onClick: () => undefined,
  },
} satisfies Meta<typeof SortableHeaderButton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Unsorted: Story = {};

export const Ascending: Story = {
  args: {
    direction: 'asc',
  },
};

export const Descending: Story = {
  args: {
    direction: 'desc',
  },
};
