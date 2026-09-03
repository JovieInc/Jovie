import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { EngineeringStoryRecord } from '@/lib/engineering-publication';
import { EngineeringArticle, EngineeringIndex } from './EngineeringPublication';

const STORY_COPY_HASH = '0'.repeat(64);

const PUBLISHED_STORY = {
  slug: 'verified-changelog',
  body: 'A bounded public shipping note for the engineering publication.',
  source: {
    id: 'verified-changelog',
    title: 'Public shipping record',
    date: '2026-08-30',
    summary: 'Artists can read the public What is New page.',
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
} satisfies EngineeringStoryRecord;

const BLOCKED_STORY = {
  slug: 'publication-draft',
  body: 'A founder-preview draft that stays out of public indexes.',
  source: {
    id: 'publication-draft',
    title: 'Publication draft',
    date: '2026-08-31',
    summary: 'Founder preview for a proof-led engineering story.',
    status: 'draft',
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
        claims: ['Draft proof references only public shipped surfaces.'],
      },
    ],
    founderApproval: null,
  },
  issues: [
    {
      rule: 'missing-approval',
      message: 'Tim White must approve the exact public copy',
    },
  ],
} satisfies EngineeringStoryRecord;

const meta = {
  title: 'Marketing/Fixtures/EngineeringPublication',
  component: EngineeringIndex,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Bounded publication fixtures for the public engineering index and founder preview article states.',
      },
    },
  },
  args: {
    stories: [PUBLISHED_STORY],
    preview: false,
  },
} satisfies Meta<typeof EngineeringIndex>;

export default meta;
type Story = StoryObj<typeof meta>;

export const PublicIndex: Story = {};

export const FounderPreview: Story = {
  args: {
    stories: [BLOCKED_STORY, PUBLISHED_STORY],
    preview: true,
  },
};

export const PreviewArticle: Story = {
  name: 'founder preview article',
  render: () => (
    <EngineeringArticle
      record={BLOCKED_STORY}
      html='<p>A founder-preview draft that stays out of public indexes.</p>'
      preview
    />
  ),
};
