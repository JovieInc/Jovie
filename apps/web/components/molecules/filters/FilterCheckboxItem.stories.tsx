import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import { FilterCheckboxItem } from './FilterCheckboxItem';

const meta = {
  title: 'Molecules/Filters/FilterCheckboxItem',
  component: FilterCheckboxItem,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => (
      <div
        className='w-64 rounded-md border border-subtle bg-surface-1 p-1'
        role='menu'
      >
        <Story />
      </div>
    ),
  ],
  args: {
    label: 'Todo',
    count: 2,
    checked: false,
    onCheckedChange: fn(),
  },
} satisfies Meta<typeof FilterCheckboxItem>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Unchecked: Story = {};

export const Checked: Story = {
  args: {
    checked: true,
  },
};

export const CountOnly: Story = {
  args: {
    label: 'Needs review',
    count: 7,
  },
};
