import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { AdminStepUpButton } from './AdminStepUpButton';

const meta = {
  title: 'Features/Admin/AdminStepUpButton',
  component: AdminStepUpButton,
  parameters: {
    layout: 'centered',
  },
  args: {
    onUnlock: () => {},
  },
} satisfies Meta<typeof AdminStepUpButton>;

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
