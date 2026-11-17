import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, within } from 'storybook/test';
import { SourceFactCard } from './SourceFactCard';
import { sourceFixture } from './source-evidence.fixtures';

const meta = {
  title: 'Jovie/SourceFactCard',
  component: SourceFactCard,
  args: { fact: sourceFixture() },
} satisfies Meta<typeof SourceFactCard>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/**
 * Empty: a fact with no source references yet. The card names the fact but
 * offers no Open Source link and lists no provenance rows.
 */
export const EmptySourceRefs: Story = {
  args: { fact: sourceFixture({ sourceRefs: [] }) },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).queryByRole('link', { name: 'Open Source' })
    ).toBeNull();
  },
};

/** Long content: a long subject, provider and origin wrap inside the card. */
export const LongContentProvenance: Story = {
  args: {
    fact: sourceFixture({
      subject: {
        id: 'spotify:artist:long',
        type: 'person',
        displayName:
          'The Midnight Collective featuring the Downtown Strings Ensemble',
        roles: ['musician'],
        identity: 'resolved',
      },
      predicate: 'release.title',
      unit: null,
      value: {
        type: 'text',
        value:
          'Midnight Drive (Deluxe Anniversary Edition) [Remastered Extended Mix]',
      },
      sourceRefs: [
        {
          id: 'long-ref',
          subjectId: 'spotify:artist:long',
          kind: 'enrichment',
          provider: 'musicbrainz-community-catalogue-mirror',
          originUrl:
            'https://catalogue.very-long-community-music-database.example.org/release/123',
          url: 'https://catalogue.very-long-community-music-database.example.org/release/123',
          fetchedAt: '2026-11-01T12:00:00.000Z',
          asOf: '2026-10-31T00:00:00.000Z',
          status: 'available',
          freshness: 'fresh',
          verification: 'verified',
          confidence: null,
        },
      ],
    }),
  },
};

/** Right-to-left: an Arabic subject and title inside an RTL panel. */
export const RtlArabicSubject: Story = {
  args: {
    fact: sourceFixture({
      subject: {
        id: 'spotify:artist:ar',
        type: 'person',
        displayName: 'عمرو دياب',
        roles: ['musician'],
        identity: 'resolved',
      },
      predicate: 'track.title',
      unit: null,
      value: { type: 'text', value: 'تملي معاك' },
    }),
  },
  decorators: [
    Story => (
      <div dir='rtl' lang='ar'>
        <Story />
      </div>
    ),
  ],
};
