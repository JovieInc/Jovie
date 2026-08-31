import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { TaskDescriptionHelper } from './TaskDescriptionHelper';

const meta = {
  title: 'Features/Dashboard/Tasks/TaskDescriptionHelper',
  component: TaskDescriptionHelper,
  parameters: {
    layout: 'centered',
    jovie: {
      uncoveredProps: ['helper', 'onBeginEditing'],
    },
  },
} satisfies Meta<typeof TaskDescriptionHelper>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
