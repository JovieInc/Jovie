import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { TaskStatusIcon } from './TaskStatusIcon';

const meta = {
  title: 'Shell/TaskStatusIcon',
  component: TaskStatusIcon,
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<typeof TaskStatusIcon>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Backlog: Story = {
  args: {
    status: 'backlog',
  },
};

export const Todo: Story = {
  args: {
    status: 'todo',
  },
};

export const InProgress: Story = {
  args: {
    status: 'in_progress',
  },
};

export const InProgressWithAgentRunning: Story = {
  args: {
    status: 'in_progress',
    agentRunning: true,
  },
};

export const Done: Story = {
  args: {
    status: 'done',
  },
};

export const Cancelled: Story = {
  args: {
    status: 'cancelled',
  },
};
