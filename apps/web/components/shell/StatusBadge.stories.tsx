import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { StatusBadge } from './StatusBadge';

const meta = {
  title: 'Shell/StatusBadge',
  component: StatusBadge,
  parameters: {
    layout: 'centered',
  },
  args: {
    status: 'live',
  },
} satisfies Meta<typeof StatusBadge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Live: Story = {};

export const Scheduled: Story = {
  args: {
    status: 'scheduled',
  },
};

export const Announced: Story = {
  args: {
    status: 'announced',
  },
};

export const Draft: Story = {
  args: {
    status: 'draft',
  },
};

export const Hidden: Story = {
  args: {
    status: 'hidden',
  },
};
