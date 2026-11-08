import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ProfileHomeRail } from './ProfileHomeRail';
import { PROFILE_STORY_ARTIST } from './profile-story-fixture';

const meta: Meta<typeof ProfileHomeRail> = {
  title: 'Profile/ProfileHomeRail',
  component: ProfileHomeRail,
  parameters: {
    layout: 'fullscreen',
    jovie: {
      uncoveredProps: [
        'captureEnabled',
        'previewActionLabel',
        'profilePacAssignment',
        'viewerLocation',
        'resolveNearbyTour',
        'merchCards',
        'releases',
        'hasTip',
        'pacArtPriority',
      ],
    },
  },
  args: {
    artist: PROFILE_STORY_ARTIST,
    latestRelease: {
      title: 'Never Say A Word',
      slug: 'never-say-a-word',
      artworkUrl: '/images/avatars/tim-white.jpg',
      releaseDate: '2026-08-01T00:00:00.000Z',
      releaseType: 'single',
    },
    profileSettings: { showOldReleases: true },
    tourDates: [],
    hasPlayableDestinations: true,
    renderMode: 'preview',
    isSubscribed: false,
  },
  decorators: [
    Story => (
      <div className='bg-base p-6'>
        <Story />
      </div>
    ),
  ],
};

export default meta;

export const FeaturedCard: StoryObj<typeof ProfileHomeRail> = {};

export const Subscribed: StoryObj<typeof ProfileHomeRail> = {
  args: {
    isSubscribed: true,
  },
};

/** Empty: no release, show, merch or tip, so no card renders (only the screen-reader heading). */
export const EmptyNoCardSubject: StoryObj<typeof ProfileHomeRail> = {
  args: { latestRelease: null, hasPlayableDestinations: false },
};

/** Partial: the release has no artwork, so the card falls back to its artwork placeholder. */
export const PartialNoArtwork: StoryObj<typeof ProfileHomeRail> = {
  args: {
    latestRelease: {
      title: 'Never Say A Word',
      slug: 'never-say-a-word',
      artworkUrl: null,
      releaseDate: '2026-08-01T00:00:00.000Z',
      releaseType: 'single',
    },
  },
};

/** Long content: a long release title wraps inside the featured card. */
export const LongReleaseTitle: StoryObj<typeof ProfileHomeRail> = {
  args: {
    latestRelease: {
      title:
        'Never Say A Word (Extended Midnight Radio Orchestra Remix featuring Friends)',
      slug: 'never-say-a-word-extended',
      artworkUrl: '/images/avatars/tim-white.jpg',
      releaseDate: '2026-08-01T00:00:00.000Z',
      releaseType: 'single',
    },
  },
};

/** RTL: the featured card mirrors under a right-to-left document. */
export const RtlFeaturedCard: StoryObj<typeof ProfileHomeRail> = {
  decorators: [
    Story => (
      <div dir='rtl' lang='ar'>
        <Story />
      </div>
    ),
  ],
};
