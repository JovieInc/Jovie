import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { ReactNode } from 'react';
import { ThreadView } from './ThreadView';

function Frame(Story: () => ReactNode) {
  return (
    <div className='h-96 w-176 max-w-full'>
      <Story />
    </div>
  );
}

function RtlFrame(Story: () => ReactNode) {
  return (
    <div dir='rtl' className='h-96 w-176 max-w-full'>
      <Story />
    </div>
  );
}

/**
 * State coverage for the thread view. The canonical story stays in
 * ThreadView.stories.tsx; these show an empty thread, a thread without a
 * linked entity, a very long title and the document direction.
 */
const meta = {
  title: 'Shell/ThreadView States',
  component: ThreadView,
  parameters: {
    layout: 'centered',
    jovie: { uncoveredProps: ['thread'] },
  },
  decorators: [Frame],
  args: {
    thread: { id: 'thread-1', title: 'Release plan', status: 'running' },
    children: 'Thread turns render here.',
  },
} satisfies Meta<typeof ThreadView>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: a new thread with no turns yet. */
export const EmptyNoTurns: Story = { args: { children: null } };

/** Partial: the thread has no linked entity, so the link line is omitted. */
export const PartialNoEntity: Story = {};

/** Long content: a long title clamps to two lines. */
export const LongContentTitle: Story = {
  args: {
    thread: {
      id: 'thread-2',
      title:
        'Plan the full rollout of the autumn release campaign across every platform, including lyric videos, canvases, pre-save pages and the press kit for the label',
      status: 'running',
    },
  },
};

/** Rtl: the thread follows the document direction. */
export const RtlDirection: Story = { decorators: [RtlFrame] };
