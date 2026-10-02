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

export const Default: Story = {
  args: {
    helper: {
      title: 'What to include',
      intro: ['Add a short summary of the release.'],
      bullets: ['Release date', 'Primary artist', 'Feature credits'],
    },
    onBeginEditing: () => {},
  },
};
