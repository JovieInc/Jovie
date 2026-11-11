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

/** The route-level loading frame the Tasks route shows while it streams. */
export const Loading: Story = {
  parameters: { layout: 'fullscreen' },
  render: () => (
    <div className='relative h-120 w-full bg-base'>
      <TasksRouteSkeleton />
    </div>
  ),
};

export const Rtl: Story = {
  parameters: { layout: 'fullscreen' },
  render: () => (
    <div dir='rtl' lang='ar' className='relative h-120 w-full bg-base'>
      <TasksRouteSkeleton />
    </div>
  ),
};
