import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { JovieIcon } from './JovieIcon';

const meta = {
  title: 'Atoms/JovieIcon',
  component: JovieIcon,
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<typeof JovieIcon>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    size: 32,
    className: 'text-primary-token',
  },
};

export const Compact: Story = {
  args: {
    size: 20,
    className: 'text-accent',
  },
};
