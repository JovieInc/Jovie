import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { TasksRouteSkeleton } from './TasksRouteSkeleton';

const meta = {
  title: 'Shell/TasksRouteSkeleton',
  component: TasksRouteSkeleton,
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<typeof TasksRouteSkeleton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
