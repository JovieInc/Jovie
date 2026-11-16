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

/** The first streamed frame can arrive before any text: nothing is drawn. */
export const EmptyReply: Story = {
  args: { content: '', isStreaming: true },
};

/** While the markdown chunk loads the reply shows as plain text in the same box. */
export const LoadingMarkdownChunk: Story = {
  args: {
    content: 'Your **profile** is ready. Next, claim your page.',
    isStreaming: true,
  },
};

/** Mid-stream: half a sentence and a reference the resolver has not filled yet. */
export const PartialStreamingReply: Story = {
  args: {
    content: 'I found @release:rel_pending[Midnight Drive] and the next st',
    isStreaming: true,
  },
};

export const LongContent: Story = {
  args: {
    content: [
      '## Launch plan for The Extended Midnight Drive Sessions (Deluxe Anniversary Edition)',
      '',
      'Here is everything that needs to happen before release day, in order:',
      '',
      '1. Upload the final masters and confirm the ISRC codes match the distributor sheet.',
      '2. Pitch the lead single to editorial playlists at least seven days ahead.',
      '3. Point https://open.spotify.com/artist/0abcdefghijklmnopqrstuvwxyz1234567890 at the new smart link.',
      '4. Schedule the pre-save reminder email for 48 hours before midnight in each time zone.',
      '',
      'Try /skill:generateAlbumArt if you want alternate artwork for the deluxe edition.',
    ].join('\n'),
  },
};

export const RtlReply: Story = {
  args: {
    content:
      'ملفك الشخصي جاهز. استمع إلى @release:rel_1[ليلة في القاهرة] الليلة، ثم شارك الرابط مع جمهورك.',
  },
  decorators: [
    Story => (
      <div dir='rtl' lang='ar'>
        <Story />
      </div>
    ),
  ],
};
