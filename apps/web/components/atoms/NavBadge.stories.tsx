import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { NavBadge } from './NavBadge';

const meta = {
  title: 'Atoms/NavBadge',
  component: NavBadge,
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<typeof NavBadge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Count: Story = {
  args: {
    variant: 'count',
    count: 3,
  },
};

export const CountOverflow: Story = {
  args: {
    variant: 'count',
    count: '99+',
  },
};

export const Pro: Story = {
  args: {
    variant: 'pro',
  },
};

export const New: Story = {
  args: {
    variant: 'new',
  },
};
