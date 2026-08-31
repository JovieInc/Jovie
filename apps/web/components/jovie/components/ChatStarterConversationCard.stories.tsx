import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import { CHAT_STARTER_CONVERSATIONS } from '@/lib/chat/new-chat-entry-contract';
import { ChatStarterConversationCard } from './ChatStarterConversationCard';

const meta: Meta<typeof ChatStarterConversationCard> = {
  title: 'Jovie/Components/ChatStarterConversationCard',
  component: ChatStarterConversationCard,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => (
      <div className='w-full max-w-2xl bg-surface-0 p-4 text-primary-token'>
        <Story />
      </div>
    ),
  ],
  args: {
    sample: CHAT_STARTER_CONVERSATIONS[0],
    onSelect: fn(),
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
