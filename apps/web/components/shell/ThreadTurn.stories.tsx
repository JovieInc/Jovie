import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ThreadTurn } from './ThreadTurn';

const meta = {
  title: 'Shell/ThreadTurn',
  component: ThreadTurn,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => (
      <div className='w-80 space-y-2 bg-base p-3'>
        <Story />
      </div>
    ),
  ],
  args: {
    speaker: 'jovie',
    children: "Here's what I found for your release.",
  },
} satisfies Meta<typeof ThreadTurn>;

export default meta;
type Story = StoryObj<typeof meta>;

export const FromJovie: Story = {};

export const FromMe: Story = {
  args: {
    speaker: 'me',
    children: 'Show me my top tracks',
  },
};

export const Subtle: Story = {
  args: {
    subtle: true,
    children: 'Generating…',
  },
};
