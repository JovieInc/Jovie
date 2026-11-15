import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { ArtistProfileSectionHeader } from './ArtistProfileSectionHeader';

const SectionHeaderCanvas: Decorator = function SectionHeaderCanvas(Story) {
  return (
    <div className='bg-base px-6 py-16 text-primary-token'>
      <Story />
    </div>
  );
};

const RtlCanvas: Decorator = function RtlCanvas(Story) {
  return (
    <div dir='rtl' lang='ar'>
      <Story />
    </div>
  );
};

/**
 * Rendered states of the artist profile section header. The default
 * centered and left-aligned stories live in
 * ArtistProfileSectionHeader.stories.tsx.
 */
const meta = {
  title: 'Marketing/Artist Profile/ArtistProfileSectionHeader/States',
  component: ArtistProfileSectionHeader,
  parameters: { layout: 'fullscreen' },
  decorators: [SectionHeaderCanvas],
} satisfies Meta<typeof ArtistProfileSectionHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Partial: a headline with no eyebrow and no lead paragraph. */
export const PartialHeadlineOnly: Story = {
  args: {
    headline: 'Own the fan path from first tap.',
  },
};

/** Long content: a headline and lead that wrap across several lines. */
export const LongContentWrappedCopy: Story = {
  args: {
    eyebrow: 'Artist Profile',
    headline:
      'Your music, your shows, your merch and every way a fan can support you stay together on one profile, and the right action leads.',
    body: 'Route every visitor to the next useful action, whether that is a new release, a nearby show, a tip or a sign-up for release alerts, without asking them to search for it first or leave the page to find it.',
  },
};

/** Right-to-left: Arabic copy in an Arabic document direction. */
export const RtlArabic: Story = {
  args: {
    eyebrow: 'ملف الفنان',
    headline: 'موسيقاك تبقى معًا. والخطوة الصحيحة تتقدم.',
    body: 'وجّه كل زائر إلى الخطوة التالية المفيدة.',
    align: 'left',
  },
  decorators: [RtlCanvas],
};
