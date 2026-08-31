import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import { CHAT_STARTER_CONVERSATIONS } from '@/lib/chat/new-chat-entry-contract';
import { ChatStarterConversationRail } from './ChatStarterConversationRail';

const meta: Meta<typeof ChatStarterConversationRail> = {
  title: 'Jovie/Components/ChatStarterConversationRail',
  component: ChatStarterConversationRail,
  parameters: {
    layout: 'centered',
    jovie: { uncoveredProps: ['disabled'] },
  },
  decorators: [
    Story => (
      <div className='w-full max-w-2xl bg-surface-0 px-12 py-6 text-primary-token'>
        <Story />
      </div>
    ),
  ],
  args: {
    samples: CHAT_STARTER_CONVERSATIONS,
    onSelect: fn(),
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
