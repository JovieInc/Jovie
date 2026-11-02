import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { AssistantMessageText } from './AssistantMessageText';

const meta = {
  title: 'Jovie/AssistantMessageText',
  component: AssistantMessageText,
  parameters: { layout: 'centered' },
  decorators: [
    Story => (
      <div className='w-80 bg-base p-3'>
        <Story />
      </div>
    ),
  ],
  args: { content: 'Here is the next step for your work.' },
} satisfies Meta<typeof AssistantMessageText>;

export default meta;
type Story = StoryObj<typeof meta>;

export const PlainText: Story = {};

export const UnavailableReference: Story = {
  args: {
    content:
      'Review @release:missing[Historical private title] before continuing.',
  },
};

export const WithSkill: Story = {
  args: { content: 'Try /skill:generateAlbumArt for the next draft.' },
};

/** Markdown renders from a separate chunk; the text is visible before it loads. */
export const MarkdownWhileStreaming: Story = {
  args: {
    content: 'Your **profile** is ready.\n\n- Claim the page\n- Add a release',
    isStreaming: true,
  },
};
