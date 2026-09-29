import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { SkeletonCell } from './SkeletonCell';

const meta = {
  title: 'Organisms/Table/Atoms/SkeletonCell',
  component: SkeletonCell,
  parameters: {
    layout: 'centered',
  },
  args: {
    variant: 'text',
  },
} satisfies Meta<typeof SkeletonCell>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Text: Story = {};

export const Avatar: Story = {
  args: {
    variant: 'avatar',
  },
};

export const Badge: Story = {
  args: {
    variant: 'badge',
  },
};

export const Button: Story = {
  args: {
    variant: 'button',
  },
};

export const Release: Story = {
  args: {
    variant: 'release',
    width: '240px',
  },
};

export const MetaVariant: Story = {
  args: {
    variant: 'meta',
    width: '120px',
  },
};
