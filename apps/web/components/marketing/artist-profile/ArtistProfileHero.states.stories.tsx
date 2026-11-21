import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ARTIST_PROFILE_COPY } from '@/data/artistProfileCopy';
import { ArtistProfileHero } from './ArtistProfileHero';

const HERO = ARTIST_PROFILE_COPY.hero;

/** Rendered states of the artist-profile hero; the default lives in ArtistProfileHero.stories.tsx. */
const meta = {
  title: 'Marketing/Artist Profile/ArtistProfileHero States',
  component: ArtistProfileHero,
  parameters: { layout: 'fullscreen' },
  args: { hero: HERO },
} satisfies Meta<typeof ArtistProfileHero>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Long content: a headline past the two-line clamp and a long subhead. */
export const LongContentHeadline: Story = {
  args: {
    hero: {
      ...HERO,
      headline:
        'One artist profile that adapts to every release, every show and every listener who opens it, all year',
      subhead:
        'Jovie keeps the right release, the right show and the right next step in front of every listener, without a stack of links to maintain by hand.',
      ctaLabel: 'Claim your free artist profile today',
    },
  },
};

/** Right-to-left: Arabic hero copy in an Arabic document direction. */
export const RtlArabic: Story = {
  args: {
    hero: {
      ...HERO,
      headline: 'ملف فني يتكيف معك.',
      subhead: 'الإصدار الصحيح والحفل الصحيح لكل مستمع.',
      ctaLabel: 'احجز ملفك',
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
