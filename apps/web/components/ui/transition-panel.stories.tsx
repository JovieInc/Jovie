import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { useState } from 'react';
import { TransitionPanel } from './transition-panel';

const meta = {
  title: 'UI/TransitionPanel',
  component: TransitionPanel,
  parameters: {
    layout: 'centered',
    // Nested variant keys; stories exercise activeIndex + children instead.
    jovie: { uncoveredProps: ['enter', 'center', 'exit'] },
  },
} satisfies Meta<typeof TransitionPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Steps: Story = {
  args: {
    activeIndex: 0,
    children: ['Find You', 'Claim Your Name', 'Go Live'],
  },
  render: function TransitionPanelStepsStory(args) {
    const [activeIndex, setActiveIndex] = useState(args.activeIndex);
    return (
      <div className='w-80 space-y-3 text-primary-token'>
        <div className='flex gap-2'>
          {['Find You', 'Claim Your Name', 'Go Live'].map((label, index) => (
            <button
              key={label}
              type='button'
              className='rounded-full border border-subtle px-3 py-1 text-xs'
              onClick={() => setActiveIndex(index)}
            >
              {label}
            </button>
          ))}
        </div>
        <TransitionPanel activeIndex={activeIndex}>
          {[
            <p key='find'>Your name or a link so we can pull your work in.</p>,
            <p key='claim'>The handle people type to reach you.</p>,
            <p key='live'>Your profile, ready to share.</p>,
          ]}
        </TransitionPanel>
      </div>
    );
  },
};
