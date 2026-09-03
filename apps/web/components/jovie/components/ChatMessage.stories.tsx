import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { MessagePart } from '../types';
import { ChatMessage } from './ChatMessage';

const assistantParts = [
  {
    type: 'text',
    text: 'Your profile update is ready to review.',
  },
] satisfies readonly MessagePart[];

const userParts = [
  {
    type: 'text',
    text: 'Update my bio',
  },
] satisfies readonly MessagePart[];

const meta = {
  title: 'Jovie/Components/ChatMessage',
  component: ChatMessage,
  parameters: {
    layout: 'centered',
  },
  args: {
    id: 'story-assistant-message',
    role: 'assistant',
    parts: assistantParts,
    skipEntrance: true,
  },
} satisfies Meta<typeof ChatMessage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const AssistantReply: Story = {};

export const UserBubble: Story = {
  args: {
    id: 'story-user-message',
    role: 'user',
    parts: userParts,
  },
};

export const StreamingPlaceholder: Story = {
  args: {
    id: 'story-streaming-placeholder',
    role: 'assistant',
    parts: [],
    isThinking: true,
    renderTools: false,
  },
};

export const InlineEmbed: Story = {
  args: {
    id: 'story-inline-message',
    role: 'assistant',
    parts: assistantParts,
    showAssistantActions: false,
    toolVariant: 'inline',
  },
};
