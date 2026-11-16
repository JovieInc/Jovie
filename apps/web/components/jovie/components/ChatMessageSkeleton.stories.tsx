import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import {
  ChatConversationComposerSkeleton,
  ChatMessageSkeleton,
} from './ChatMessageSkeleton';

const meta = {
  title: 'Jovie/ChatMessageSkeleton',
  component: ChatMessageSkeleton,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => (
      <div className='w-80 bg-base p-3'>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ChatMessageSkeleton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const ComposerSkeleton: Story = {
  render: () => <ChatConversationComposerSkeleton />,
};

/** The conversation is loading: one user pill and one assistant reply. */
export const LoadingMessages: Story = {};

/** In a right-to-left thread the user pill sits on the inline end. */
export const RtlMessages: Story = {
  decorators: [
    Story => (
      <div dir='rtl' lang='ar'>
        <Story />
      </div>
    ),
  ],
};
