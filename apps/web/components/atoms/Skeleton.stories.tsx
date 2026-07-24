import { Skeleton } from '@jovie/ui';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';

const meta: Meta<typeof Skeleton> = {
  title: 'Atoms/Skeleton',
  component: Skeleton,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    className: 'h-12 w-48',
  },
};

export const Rectangular: Story = {
  args: {
    className: 'h-24 w-24 rounded-2xl',
  },
};
