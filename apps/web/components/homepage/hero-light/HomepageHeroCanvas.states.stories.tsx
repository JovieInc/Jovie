import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { HOMEPAGE_COPY } from '@/data/homepageCopy';
import { HomepageHeroCanvas } from './HomepageHeroCanvas';

const hero = HOMEPAGE_COPY.hero;
type Headline = typeof hero.headline;
type Subhead = typeof hero.subhead;

const meta = {
  title: 'Marketing/HomepageHeroCanvas States',
  component: HomepageHeroCanvas,
  parameters: { layout: 'fullscreen' },
  args: {
    headingId: 'home-hero-heading',
    headline: hero.headline,
    subhead: hero.subhead,
    claim: hero.claim,
    supportNote: hero.supportNote,
    profile: hero.profile,
    sectionOwner: 'apps/web/components/homepage/HomepageArtistProfile.tsx',
  },
  decorators: [
    Story => (
      <div className='dark min-h-svh bg-base text-primary-token'>
        <style>
          {
            '[data-homepage-hero-canvas-states] .homepage-hero-canvas__copy { opacity: 1 !important; }'
          }
        </style>
        <div data-homepage-hero-canvas-states='true'>
          <Story />
        </div>
      </div>
    ),
  ],
} satisfies Meta<typeof HomepageHeroCanvas>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Partial: no proof capture, so the lead holds the copy column alone. */
export const PartialWithoutProof: Story = {
  args: { profile: undefined },
};

/** Long content: three headline beats and a long subhead. */
export const LongContentHeadlineBeats: Story = {
  args: {
    // Story-only copy beyond the locked homepage literal type.
    headline:
      'Be found by every listener. Be understood by every promoter. Be ready for every release.' as Headline,
    subhead:
      'A free profile for your music, bio, links, tour dates and updates. Your latest release leads, every older record stays one tap away, and every fan who finds you can ask to hear about the next one.' as Subhead,
  },
};

/** Right-to-left: Arabic headline and subhead in an Arabic document. */
export const RtlArabic: Story = {
  args: {
    headline: 'كن معروفًا. كن مفهومًا.' as Headline,
    subhead: 'صفحة مجانية لموسيقاك وسيرتك وروابطك.' as Subhead,
  },
  decorators: [
    Story => (
      <div dir='rtl' lang='ar'>
        <Story />
      </div>
    ),
  ],
};
