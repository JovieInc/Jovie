import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { IconBadge } from './IconBadge';

const meta = {
  title: 'Atoms/IconBadge',
  component: IconBadge,
  parameters: {
    layout: 'centered',
  },
  args: {
    name: 'Music',
    colorVar: '--color-accent',
  },
} satisfies Meta<typeof IconBadge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Success: Story = {
  args: {
    name: 'CheckCircle',
    colorVar: '--color-success',
  },
};

export const WithAccessibleLabel: Story = {
  args: {
    name: 'Bell',
    colorVar: '--color-warning',
    ariaLabel: 'Notification',
  },
};
