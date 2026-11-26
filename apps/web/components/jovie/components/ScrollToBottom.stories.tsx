import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import { ScrollToBottom } from './ScrollToBottom';

const meta = {
  title: 'Jovie/ScrollToBottom',
  component: ScrollToBottom,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => (
      <div className='relative h-32 w-64 bg-base'>
        <Story />
      </div>
    ),
  ],
  args: {
    visible: true,
    onClick: fn(),
  },
} satisfies Meta<typeof ScrollToBottom>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Visible: Story = {};

export const Hidden: Story = {
  args: {
    visible: false,
  },
};

/** Empty: the transcript is at the bottom, so nothing is rendered. */
export const EmptyAtBottom: Story = {
  args: {
    visible: false,
  },
};

/** Partial: the button inside a narrow container keeps its size. */
export const PartialNarrowContainer: Story = {
  decorators: [
    function NarrowFrame(Story) {
      return (
        <div className='relative h-32 w-24 bg-base'>
          <Story />
        </div>
      );
    },
  ],
};

/** Rtl: the floating button stays centred in a right-to-left transcript. */
export const RtlTranscript: Story = {
  decorators: [
    function RtlFrame(Story) {
      return (
        <div dir='rtl' className='relative h-32 w-64 bg-base'>
          <Story />
        </div>
      );
    },
  ],
};

/** Long content: the button stays pinned over a tall transcript. */
export const LongContentTallTranscript: Story = {
  decorators: [
    function TallFrame(Story) {
      return (
        <div className='relative h-96 w-64 bg-base'>
          <Story />
        </div>
      );
    },
  ],
};
