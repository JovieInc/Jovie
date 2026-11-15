import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ARTIST_PROFILE_COPY } from '@/data/artistProfileCopy';
import { ArtistProfileHeroAdaptiveIntro } from './ArtistProfileHeroAdaptiveIntro';

/** Rendered states of the hero and adaptive intro; the default lives in ArtistProfileHeroAdaptiveIntro.stories.tsx. */
const meta = {
  title: 'Marketing/Source/ArtistProfileHeroAdaptiveIntro States',
  component: ArtistProfileHeroAdaptiveIntro,
  parameters: { layout: 'fullscreen' },
  args: {
    hero: ARTIST_PROFILE_COPY.hero,
    adaptive: ARTIST_PROFILE_COPY.adaptive,
    logoPlacement: { page: '/artist-profiles' },
  },
} satisfies Meta<typeof ArtistProfileHeroAdaptiveIntro>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Permission denied: no brand has granted a logo for this page, so no trust strip renders. */
export const PermissionDeniedNoLogoGrant: Story = {
  args: { logoPlacement: { page: '/artist-profiles', audience: 'artists' } },
};

/** Long content: a long hero headline and adaptive body. */
export const LongContentCopy: Story = {
  args: {
    hero: {
      ...ARTIST_PROFILE_COPY.hero,
      headline:
        'One artist profile that adapts to every release, every show and every listener who opens it, all year',
    },
    adaptive: {
      ...ARTIST_PROFILE_COPY.adaptive,
      body: 'Every mode changes what a listener sees first, from presaves before a drop to tickets on tour, so the profile is always pointing at the next useful action without a second tool to update.',
    },
  },
};

/** Right-to-left: Arabic hero copy in an Arabic document direction. */
export const RtlArabic: Story = {
  args: {
    hero: {
      ...ARTIST_PROFILE_COPY.hero,
      headline: 'ملف فني يتكيف معك.',
      subhead: 'الإصدار الصحيح والحفل الصحيح لكل مستمع.',
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
