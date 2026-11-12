import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { PROFILE_STORY_ARTIST } from './profile-story-fixture';
import { StaticArtistPage } from './StaticArtistPage';

const meta = {
  title: 'Profile/StaticArtistPage',
  component: StaticArtistPage,
  parameters: { layout: 'fullscreen', jovie: { uncoveredProps: ['disabled'] } },
  args: {
    mode: 'profile',
    artist: PROFILE_STORY_ARTIST,
    socialLinks: [],
    contacts: [],
    subtitle: 'Artist profile',
    showBackButton: false,
    catalogLoadFailed: false,
    releases: [
      {
        id: 'release-1',
        title: 'Never Say A Word',
        slug: 'never-say-a-word',
        releaseType: 'single',
        releaseDate: '2026-08-01',
        artworkUrl: '/images/avatars/tim-white.jpg',
        artistNames: ['Tim White'],
      },
    ],
  },
} satisfies Meta<typeof StaticArtistPage>;

export default meta;

export const Home: StoryObj<typeof StaticArtistPage> = {
  render: args => (
    <div className='min-h-dvh bg-base'>
      <StaticArtistPage {...args} />
    </div>
  ),
};

const pageFrame = (args: Parameters<typeof StaticArtistPage>[0]) => (
  <div className='min-h-dvh bg-base'>
    <StaticArtistPage {...args} />
  </div>
);

/** A new profile: no releases, links, contacts or tagline yet. */
export const EmptyNewProfile: StoryObj<typeof StaticArtistPage> = {
  args: {
    artist: { ...PROFILE_STORY_ARTIST, tagline: undefined, location: null },
    releases: [],
  },
  render: pageFrame,
};

/** Name and one release, with no photo, tagline or location. */
export const PartialNoPhoto: StoryObj<typeof StaticArtistPage> = {
  args: {
    artist: {
      ...PROFILE_STORY_ARTIST,
      image_url: undefined,
      tagline: undefined,
      location: null,
      settings: {},
    },
  },
  render: pageFrame,
};

export const LongContentNameAndCatalog: StoryObj<typeof StaticArtistPage> = {
  args: {
    artist: {
      ...PROFILE_STORY_ARTIST,
      name: 'Tim White and the Los Angeles After Hours Orchestra',
      tagline:
        'Producer, songwriter, and after-hours romantic scoring late-night drives, sunrise sets and every long walk home in between.',
      location: 'Los Angeles, California, United States of America',
    },
    releases: Array.from({ length: 8 }, (_, index) => ({
      id: `release-${index + 1}`,
      title: `Never Say A Word (Extended Club Mix featuring the Philharmonic Strings) Part ${index + 1}`,
      slug: `never-say-a-word-part-${index + 1}`,
      releaseType: index % 2 === 0 ? 'single' : 'album',
      releaseDate: `2026-0${(index % 9) + 1}-01`,
      artworkUrl: '/images/avatars/tim-white.jpg',
      artistNames: ['Tim White', 'The Los Angeles After Hours Orchestra'],
    })),
  },
  render: pageFrame,
};

export const RtlProfile: StoryObj<typeof StaticArtistPage> = {
  args: {
    artist: {
      ...PROFILE_STORY_ARTIST,
      name: 'تيم وايت',
      tagline: 'منتج وكاتب أغانٍ ورومانسي في ساعات الليل المتأخرة.',
      location: 'لوس أنجلوس',
    },
    subtitle: 'الملف الشخصي للفنان',
  },
  render: args => (
    <div dir='rtl' className='min-h-dvh bg-base'>
      <StaticArtistPage {...args} />
    </div>
  ),
};
