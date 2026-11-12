import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { TaskWorkspaceLoadingRows } from './TaskWorkspaceLoadingRows';

const meta = {
  title: 'Features/Dashboard/Tasks/TaskWorkspaceLoadingRows',
  component: TaskWorkspaceLoadingRows,
  parameters: {
    layout: 'fullscreen',
  },
  decorators: [
    Story => (
      <div className='flex h-112 flex-col bg-base'>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof TaskWorkspaceLoadingRows>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The Tasks route and client share this geometry while tasks load. */
export const LoadingTasks: Story = {};

/** Phone width uses the wider gutter the loaded list uses. */
export const LoadingPhoneWidth: Story = {
  parameters: {
    viewport: { defaultViewport: 'mobile1' },
  },
};
