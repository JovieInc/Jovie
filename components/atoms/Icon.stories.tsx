import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Icon } from './Icon';

const meta: Meta<typeof Icon> = {
  title: 'Atoms/Icon',
  component: Icon,
  tags: ['autodocs'],
  argTypes: {
    name: { control: 'text' },
    size: { control: 'number' },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    name: 'Music',
    size: 32,
    className: 'text-indigo-600',
  },
};

export const Colored: Story = {
  args: {
    name: 'Heart',
    size: 28,
    className: 'text-rose-500',
  },
};
