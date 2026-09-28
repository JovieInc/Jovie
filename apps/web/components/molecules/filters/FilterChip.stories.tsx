import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import { FilterChip } from './FilterChip';

const meta = {
  title: 'Molecules/Filters/FilterChip',
  component: FilterChip,
  parameters: {
    layout: 'centered',
  },
  args: {
    pressed: false,
    onClick: fn(),
    children: 'Overdue',
  },
} satisfies Meta<typeof FilterChip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Pressed: Story = {
  args: {
    pressed: true,
  },
};

export const Disabled: Story = {
  args: {
    disabled: true,
  },
};
