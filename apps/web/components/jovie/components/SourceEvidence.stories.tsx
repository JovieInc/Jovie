import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ChatMarkdown } from './ChatMarkdown';
import { SourceEvidenceProvider } from './SourceEvidence';
import { sourceFixture } from './source-evidence.fixtures';

const meta = {
  title: 'Jovie/SourceEvidence',
  component: SourceEvidenceProvider,
  args: {
    facts: [sourceFixture()],
    children: <ChatMarkdown content='9.9K followers' />,
  },
} satisfies Meta<typeof SourceEvidenceProvider>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** No typed facts arrived with the reply: numbers stay plain prose. */
export const EmptyFacts: Story = {
  args: {
    facts: [],
    children: <ChatMarkdown content='You have 9.9K followers on Spotify.' />,
  },
};

/** Only the count a fact backs becomes inspectable; the other stays plain. */
export const PartialEvidence: Story = {
  args: {
    children: (
      <ChatMarkdown content='9.9K Spotify followers so far, and 19.9K followers is the next milestone.' />
    ),
  },
};

export const LongContent: Story = {
  args: {
    children: (
      <div className='w-80'>
        <ChatMarkdown
          content={[
            'Your Spotify audience grew to 9.9K followers this quarter, which puts the Extended Midnight Drive Sessions campaign ahead of plan.',
            '',
            '- 9,900 followers is the figure Spotify reported on the latest fetch.',
            '- Keep pitching the deluxe edition to editorial playlists to hold the trend through release week.',
          ].join('\n')}
        />
      </div>
    ),
  },
};

export const RtlEvidence: Story = {
  args: {
    children: (
      <div dir='rtl' lang='ar' className='w-80'>
        <ChatMarkdown content='لديك الآن 9.9K followers على سبوتيفاي.' />
      </div>
    ),
  },
};
