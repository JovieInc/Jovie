import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import type { EngineeringStoryRecord } from '@/lib/engineering-publication';
import { EngineeringIndex } from './EngineeringPublication';

const STORY_COPY_HASH = '0'.repeat(64);

const RtlCanvas: Decorator = function RtlCanvas(Story) {
  return (
    <div dir='rtl' lang='ar'>
      <Story />
    </div>
  );
};

function publishedStory(
  slug: string,
  title: string,
  summary: string
): EngineeringStoryRecord {
  return {
    slug,
    body: summary,
    source: {
      id: slug,
      title,
      date: '2026-08-30',
      summary,
      status: 'published',
      availability: 'public',
      capabilities: [
        {
          id: 'changelog',
          availability: 'public',
          receiptId: 'changelog-live',
        },
      ],
      evidence: [
        {
          id: 'changelog-live',
          kind: 'changelog',
          href: 'https://jov.ie/changelog',
          claims: ['What is New page is publicly accessible.'],
        },
      ],
      founderApproval: {
        approvedBy: 'Tim White',
        approvedAt: '2026-08-30',
        copyHash: STORY_COPY_HASH,
      },
    },
    issues: [],
  };
}

/** A record whose source failed to parse: no title, date or summary. */
const SOURCELESS_STORY: EngineeringStoryRecord = {
  slug: 'unparsed-source',
  body: '',
  source: null,
  issues: [{ rule: 'invalid-source', message: 'Frontmatter did not parse' }],
};

/**
 * Rendered states of the engineering publication index. The production
 * public index, founder preview and article stories live in
 * EngineeringPublication.stories.tsx.
 */
const meta = {
  title: 'Marketing/Fixtures/EngineeringPublication/States',
  component: EngineeringIndex,
  parameters: { layout: 'fullscreen' },
  args: { stories: [], preview: false },
} satisfies Meta<typeof EngineeringIndex>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: the public index before any founder-approved story ships. */
export const EmptyPublicIndex: Story = {};

/** Empty: the founder preview gallery with no drafts. */
export const EmptyFounderPreview: Story = {
  args: { preview: true },
};

/** Partial: a founder preview record with no parsed source. */
export const PartialSourcelessRecord: Story = {
  args: { stories: [SOURCELESS_STORY], preview: true },
};

/** Long content: a title past the two-line clamp and a long summary. */
export const LongContentStory: Story = {
  args: {
    stories: [
      publishedStory(
        'long-shipping-record',
        'How every release page, playlist pitch and profile link stayed in step with the catalog through a full week of launches',
        'Artists can read the public What is New page, follow each release from the first demo to the day it ships, and check every change against the receipts that prove it went out.'
      ),
    ],
  },
};

/** Right-to-left: an Arabic story in an Arabic document direction. */
export const RtlArabic: Story = {
  args: {
    stories: [
      publishedStory(
        'arabic-shipping-record',
        'سجل الإصدارات العام',
        'يمكن للفنانين قراءة صفحة الجديد العامة.'
      ),
    ],
  },
  decorators: [RtlCanvas],
};
