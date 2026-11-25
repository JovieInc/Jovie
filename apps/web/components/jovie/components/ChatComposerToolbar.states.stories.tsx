import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import { ComposerSendButton } from './ChatComposerToolbar';

const meta = {
  title: 'Jovie/Components/ChatComposerToolbar/States',
  component: ComposerSendButton,
  parameters: { layout: 'centered', backgrounds: { default: 'dark' } },
  args: {
    canSend: true,
    isStreaming: false,
    reducedMotion: false,
    onMouseDown: fn(),
    onSend: fn(),
    onStop: fn(),
  },
} satisfies Meta<typeof ComposerSendButton>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: an empty composer cannot send, so the button is disabled. */
export const EmptyCannotSend: Story = { args: { canSend: false } };

/** Partial: streaming with a queued message offers interrupt and send. */
export const PartialInterruptAndSend: Story = {
  args: {
    canSend: false,
    canInterruptAndSend: true,
    isStreaming: true,
    onInterruptAndSend: fn(),
  },
};

/** Rtl: the control keeps its size in a right-to-left composer. */
export const RtlSend: Story = {
  decorators: [
    function RtlFrame(Story) {
      return (
        <div dir='rtl'>
          <Story />
        </div>
      );
    },
  ],
};
