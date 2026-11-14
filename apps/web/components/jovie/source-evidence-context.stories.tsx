import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, waitFor } from 'storybook/test';
import { ChatMarkdown } from './components/ChatMarkdown';
import { sourceFixture } from './components/source-evidence.fixtures';
import { SourceEvidenceProvider } from './source-evidence-context';

const meta = {
  title: 'Jovie/SourceEvidenceContext',
  component: SourceEvidenceProvider,
  args: {
    facts: [sourceFixture()],
    children: <ChatMarkdown content='9.9K followers' />,
  },
} satisfies Meta<typeof SourceEvidenceProvider>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

const longReply = [
  'Here is what the public sources say about this artist so far.',
  '',
  '- 9.9K followers on Spotify, measured this week, which is the only audience number this reply leans on.',
  '- A long run of release notes, credits and tour history that keeps going so the evidence has to sit beside a long paragraph without crowding it or forcing the thread wider than the reading column.',
  '- More context the reply explains in plain words before it asks what to do next.',
].join('\n');

export const LongContentReply: Story = {
  args: {
    facts: [sourceFixture()],
    children: (
      <div className='w-full max-w-md'>
        <ChatMarkdown content={longReply} />
      </div>
    ),
  },
  play: async ({ canvasElement }) => {
    await waitFor(() =>
      expect(
        canvasElement.querySelector('[data-source-evidence="ready"]')
      ).not.toBeNull()
    );
  },
};

export const RtlReply: Story = {
  args: {
    facts: [sourceFixture()],
    children: (
      <div dir='rtl' lang='ar' className='w-full max-w-md'>
        <ChatMarkdown content='لدى هذا الفنان 9.9K followers على سبوتيفاي، وهذا هو الرقم الوحيد الذي يعتمد عليه هذا الرد.' />
      </div>
    ),
  },
  play: async ({ canvasElement }) => {
    await waitFor(() =>
      expect(
        canvasElement.querySelector('[data-source-evidence="ready"]')
      ).not.toBeNull()
    );
  },
};
