import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ThreadView } from './ThreadView';

const meta = {
  title: 'Shell/ThreadView',
  component: ThreadView,
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
