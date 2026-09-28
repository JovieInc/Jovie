import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { AdminStepUp } from './AdminStepUp';

const meta = {
  title: 'Features/Admin/AdminStepUp',
  component: AdminStepUp,
  parameters: {
    layout: 'centered',
  },
  args: {
    onUnlock: () => {},
  },
} satisfies Meta<typeof AdminStepUp>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Idle: Story = {
  args: { status: 'idle' },
};

export const Working: Story = {
  args: { status: 'working' },
};

export const Error: Story = {
  args: { status: 'error' },
};
