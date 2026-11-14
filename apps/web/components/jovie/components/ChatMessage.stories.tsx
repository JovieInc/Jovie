import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, within } from 'storybook/test';
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

/**
 * Loading: the stream is open but no token has arrived, so the row holds a
 * compact typing bubble announced as a polite status.
 */
export const LoadingStreamOpen: Story = {
  args: {
    id: 'story-loading-message',
    parts: [],
    isStreaming: true,
  },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByRole('status', { name: 'Jovie Is Responding' })
    ).toBeInTheDocument();
  },
};

/**
 * Empty: a finished assistant turn that produced no text and no tools. The
 * row keeps its frame but shows no reply, copy or feedback controls.
 */
export const EmptyFinishedTurn: Story = {
  args: {
    id: 'story-empty-message',
    parts: [],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByTestId('chat-message-reply')).toBeNull();
    await expect(canvas.queryByRole('button')).toBeNull();
  },
};

/** Partial: a user turn that carried only a file, with no typed text. */
export const PartialAttachmentOnly: Story = {
  args: {
    id: 'story-attachment-message',
    role: 'user',
    parts: [
      {
        type: 'file',
        url: 'https://files.example.com/uploads/press-kit.pdf',
        mediaType: 'application/pdf',
        filename: 'press-kit.pdf',
      },
    ],
  },
};

/** Long content: a multi-paragraph reply and a long user question wrap. */
export const LongContentReply: Story = {
  args: {
    id: 'story-long-message',
    parts: [
      {
        type: 'text',
        text: "Here's the launch plan for Midnight Drive (Deluxe Anniversary Edition):\n\n1. Pin the deluxe smart link to the top of your profile and keep the original single right below it so returning fans find both.\n2. Announce the Austin, Houston and San Antonio dates together, because those three cities drove most of last month's growth.\n3. Send the welcome post to everyone who pre-saved, then follow up with the merch drop on Friday.",
      },
    ],
  },
};

/**
 * Permission denied: the reply touched a tool the plan does not include, so
 * it shows a quiet locked status row and one upgrade prompt, never an error.
 */
export const PermissionDeniedLockedTool: Story = {
  args: {
    id: 'story-locked-message',
    parts: [
      { type: 'text', text: 'I can draft cover art once album art is on.' },
      {
        type: 'dynamic-tool',
        toolName: 'generateAlbumArt',
        toolCallId: 'story-locked-album-art',
        state: 'output-available',
        input: {},
        output: {
          success: true,
          locked: true,
          reason: 'Album art requires the Max plan.',
          plan_required: 'Max',
        },
      },
    ],
  },
};

/** Right-to-left: an Arabic assistant reply inside an RTL transcript. */
export const RtlArabicReply: Story = {
  args: {
    id: 'story-rtl-message',
    parts: [
      {
        type: 'text',
        text: 'إصدارك **ليلة في القاهرة** متاح الآن على جميع المنصات.',
      },
    ],
  },
  decorators: [
    Story => (
      <div dir='rtl' lang='ar'>
        <Story />
      </div>
    ),
  ],
};
