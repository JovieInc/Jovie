import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { TaskBoard } from './TaskBoard';

const meta = {
  title: 'Features/Dashboard/Tasks/TaskBoard',
  component: TaskBoard,
  parameters: {
    layout: 'centered',
    jovie: {
      uncoveredProps: [
        'board',
        'visibleStatuses',
        'isLoading',
        'selectedTaskId',
        'onOpenTask',
        'onCreateTask',
        'onMoveTask',
        'getTaskContextMenuItems',
      ],
    },
  },
} satisfies Meta<typeof TaskBoard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
