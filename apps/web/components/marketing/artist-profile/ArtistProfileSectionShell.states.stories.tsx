import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ARTIST_PROFILE_COPY } from '@/data/artistProfileCopy';
import { ArtistProfileSectionHeader } from './ArtistProfileSectionHeader';
import { ArtistProfileSectionShell } from './ArtistProfileSectionShell';

const meta = {
  title: 'Marketing/Artist Profile/ArtistProfileSectionShell States',
  component: ArtistProfileSectionShell,
  parameters: { layout: 'fullscreen' },
  args: { width: 'page', children: null },
} satisfies Meta<typeof ArtistProfileSectionShell>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Partial: a headline-only header with no section marker or body copy. */
export const PartialHeadlineOnly: Story = {
  args: {
    children: (
      <ArtistProfileSectionHeader
        align='left'
        headline={ARTIST_PROFILE_COPY.outcomes.headline}
      />
    ),
  },
};

/** Long content: a prose-width chapter with long headline and body copy. */
export const LongContentProse: Story = {
  args: {
    width: 'prose',
    sectionId: 'feature-grid',
    sectionVariant: 'prose',
    children: (
      <ArtistProfileSectionHeader
        align='left'
        headline='One profile that keeps every listener, show and supporter moving to the right next step, all year.'
        body={`${ARTIST_PROFILE_COPY.outcomes.body} ${ARTIST_PROFILE_COPY.outcomes.body}`}
      />
    ),
  },
};

/** Right-to-left: an Arabic chapter header in an Arabic document. */
export const RtlArabic: Story = {
  args: {
    width: 'landing',
    children: (
      <ArtistProfileSectionHeader
        align='left'
        headline='مبني حول نتائج الجمهور.'
        body='كل زائر يصل إلى الخطوة الصحيحة من ملف واحد.'
      />
    ),
  },
  decorators: [
    function WithArabicDocument(Story) {
      return (
        <div dir='rtl' lang='ar'>
          <Story />
        </div>
      );
    },
  ],
};
