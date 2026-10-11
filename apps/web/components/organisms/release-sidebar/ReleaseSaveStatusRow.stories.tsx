import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import { ReleaseSaveStatusRow } from './ReleaseSaveStatusRow';

const meta = {
  title: 'Organisms/ReleaseSidebar/ReleaseSaveStatusRow',
  component: ReleaseSaveStatusRow,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => (
      <div className='w-64'>
        <Story />
      </div>
    ),
  ],
  args: {
    status: 'idle',
  },
} satisfies Meta<typeof ReleaseSaveStatusRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Idle: Story = {};

export const Saving: Story = {
  args: {
    status: 'saving',
  },
};

export const Saved: Story = {
  args: {
    status: 'saved',
  },
};

export const ErrorFeedback: Story = {
  args: {
    status: 'error',
    feedback: {
      message: "Couldn't save changes.",
      actionLabel: 'Retry',
      onRetry: fn(),
    },
  },
};
