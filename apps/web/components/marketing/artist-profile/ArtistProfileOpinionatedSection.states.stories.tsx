import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ARTIST_PROFILE_COPY } from '@/data/artistProfileCopy';
import { getMarketingExportImage } from '@/lib/screenshots/registry';
import { ArtistProfileOpinionatedSection } from './ArtistProfileOpinionatedSection';

const COPY = ARTIST_PROFILE_COPY.opinionated;

/** Rendered states of the opinionated split; the default lives in ArtistProfileOpinionatedSection.stories.tsx. */
const meta = {
  title: 'Marketing/Artist Profile/ArtistProfileOpinionatedSection States',
  component: ArtistProfileOpinionatedSection,
  parameters: { layout: 'fullscreen' },
  args: { opinionated: COPY },
} satisfies Meta<typeof ArtistProfileOpinionatedSection>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Partial: record copy with no principle line and an uncaptioned capture. */
export const PartialNoPrinciple: Story = {
  args: {
    opinionated: { headline: COPY.headline, body: COPY.body },
    preview: getMarketingExportImage('tim-white-profile-subscribe-mobile'),
    sectionOccurrence: 'capture-1',
  },
};

/** Long content: a headline past the clamp, a long body and principle. */
export const LongContentCopy: Story = {
  args: {
    opinionated: {
      headline:
        'One clear action for every listener, every release and every show you will ever announce',
      body: 'Jovie leads each listener to the one thing that matters right now, whether that is the new single, a presave or tickets to a nearby show, instead of a wall of equal links.',
      principle:
        'Principle: one primary action per profile state, chosen for the listener, never a list of everything',
    },
    caption:
      'A Jovie artist profile leading listeners to the current release with a single Listen action.',
  },
};

/** Right-to-left: Arabic split copy in an Arabic document direction. */
export const RtlArabic: Story = {
  args: {
    opinionated: {
      headline: 'إجراء واحد واضح.',
      body: 'يقود جوفي كل مستمع إلى ما يهم الآن.',
      principle: 'المبدأ: إجراء رئيسي واحد.',
    },
  },
  decorators: [
    Story => (
      <div dir='rtl' lang='ar'>
        <Story />
      </div>
    ),
  ],
};
