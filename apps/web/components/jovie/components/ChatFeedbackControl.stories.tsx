import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ChatFeedbackControl } from './ChatFeedbackControl';

const meta = {
  title: 'Jovie/ChatFeedbackControl',
  component: ChatFeedbackControl,
  parameters: {
    layout: 'centered',
  },
  args: {
    messageId: 'msg_1',
    conversationId: 'conv_1',
  },
} satisfies Meta<typeof ChatFeedbackControl>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const ForToolResult: Story = {
  args: {
    toolCallId: 'call_1',
    toolName: 'generateAlbumArt',
  },
};
