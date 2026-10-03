import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { AssistantMessageText } from './AssistantMessageText';

const meta = {
  title: 'Jovie/AssistantMessageText',
  component: AssistantMessageText,
  parameters: {
    layout: 'padded',
  },
} satisfies Meta<typeof AssistantMessageText>;

export default meta;
type Story = StoryObj<typeof meta>;

export const PlainMarkdown: Story = {
  args: {
    content: 'Your release is scheduled for next Friday. Anything else?',
  },
};

export const WithEntityMention: Story = {
  args: {
    content:
      "@release:rel_abc123[Midnight Drive] is ready to schedule. Want me to notify @artist:art_xyz[Porter Robinson]'s co-writers?",
  },
};

export const WithSkillMention: Story = {
  args: {
    content: 'Running /skill:generateAlbumArt to draft three concepts.',
  },
};

export const Streaming: Story = {
  args: {
    content: 'Pulling your latest release metrics',
    isStreaming: true,
  },
};
