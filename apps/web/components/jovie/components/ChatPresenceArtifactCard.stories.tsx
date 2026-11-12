import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, within } from 'storybook/test';
import { ChatPresenceArtifactCard } from './ChatPresenceArtifactCard';

const facts = [
  { label: 'Repair queue', value: '1 open' },
  { label: 'Collisions', value: '0 to review' },
  { label: 'Placement opportunities', value: '0 found' },
] as const;

const meta = {
  title: 'Jovie/ChatPresenceArtifactCard',
  component: ChatPresenceArtifactCard,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => (
      <div className='w-full max-w-md bg-base p-6'>
        <Story />
      </div>
    ),
  ],
  args: {
    state: 'success',
    title: 'Work opportunities',
    summary:
      'Your Work opportunity queue is ready. Findings stay local and nothing was sent.',
    facts,
  },
} satisfies Meta<typeof ChatPresenceArtifactCard>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A finished presence step with verified facts. */
export const Default: Story = {};

/** A drafted welcome post with its copy and open actions. */
export const DraftWithLink: Story = {
  args: {
    title: 'Welcome post',
    summary: 'A first post you can paste into your profile feed.',
    facts: [],
    draftText:
      'My new single Midnight Drive is out now.\nTap the link to listen wherever you stream.',
    href: 'https://jov.ie/midnight-drive',
  },
};

/** Loading: the presence step is still running and holds its slot. */
export const LoadingRunning: Story = {
  args: {
    state: 'loading',
  },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByTestId('chat-presence-artifact-loading')
    ).toHaveTextContent('Running…');
  },
};

/** Empty: the step finished but nothing is verified yet. */
export const EmptyNothingVerified: Story = {
  args: {
    summary: undefined,
    facts: [],
    empty: true,
  },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByText(
        'Nothing verified yet — connect sources to fill this in.'
      )
    ).toBeVisible();
  },
};

/** Error: the step failed; the card says so without a retry. */
export const ErrorStepFailed: Story = {
  args: {
    state: 'error',
    error: 'Work presence lookup failed.',
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByText('Work opportunities failed')
    ).toBeInTheDocument();
    await expect(canvas.queryByRole('button')).toBeNull();
  },
};

/** Partial: a summary and one fact, with no draft or link to act on. */
export const PartialSummaryAndFact: Story = {
  args: {
    facts: [{ label: 'Stats', value: 'Not connected' }],
  },
};

/** Long content: long fact values and a long draft wrap inside the card. */
export const LongContentDraft: Story = {
  args: {
    title: 'Artist profile assembled from your connected sources',
    facts: [
      {
        label: 'Bio',
        value:
          'Los Angeles producer and DJ whose deluxe anniversary edition of Midnight Drive reached listeners in forty-two countries during its first month.',
      },
      {
        label: 'Links',
        value:
          'https://open.spotify.com/artist/averyveryveryverylongartistidentifier1234567890',
      },
    ],
    draftText:
      'Thank you to everyone who pre-saved the deluxe anniversary edition. '.repeat(
        5
      ),
  },
};

/** Right-to-left: Arabic facts and draft inside an RTL transcript. */
export const RtlArabicFacts: Story = {
  args: {
    title: 'ملف الفنان',
    summary: 'تم تجميع ملفك من المصادر المتصلة.',
    facts: [
      { label: 'المدينة', value: 'القاهرة' },
      { label: 'الإصدار', value: 'ليلة في القاهرة' },
    ],
    draftText: 'أغنيتي الجديدة متاحة الآن.',
  },
  decorators: [
    Story => (
      <div dir='rtl' lang='ar'>
        <Story />
      </div>
    ),
  ],
};
