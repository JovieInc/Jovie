import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ThreadView } from './ThreadView';

const meta = {
  title: 'Shell/ThreadView',
  component: ThreadView,
  decorators: [
    Story => (
      // Give the thread a real viewport so its scroll region does not overflow
      // (an overflowing scroller needs a keyboard entry point).
      <div className='h-96 w-176 max-w-full'>
        <Story />
      </div>
    ),
  ],
  parameters: {
    layout: 'centered',
    jovie: {
      uncoveredProps: ['thread'],
    },
  },
} satisfies Meta<typeof ThreadView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    thread: { id: 'thread-1', title: 'Release plan', status: 'running' },
    children: 'Thread turns render here.',
  },
};
