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

const IN_SIX_DAYS = new Date(Date.now() + 6 * 86_400_000).toISOString();

const BERLIN_SHOW = {
  id: 'story-show-de',
  profileId: 'story-profile',
  externalId: null,
  provider: 'manual',
  eventType: 'tour',
  confirmationStatus: 'confirmed',
  reviewedAt: null,
  title: null,
  startDate: IN_SIX_DAYS,
  startTime: null,
  timezone: null,
  venueName: 'Club Berlin',
  city: 'Berlin',
  region: null,
  country: 'DE',
  latitude: null,
  longitude: null,
  ticketUrl: 'https://tickets.example/berlin',
  ticketStatus: 'available',
  lastSyncedAt: null,
  createdAt: IN_SIX_DAYS,
  updatedAt: IN_SIX_DAYS,
} as const;

/** One right thing: a visitor in the show's country sees the show first. */
export const ShowForVisitorInCountry: StoryObj<typeof ProfileHomeRail> = {
  args: {
    renderMode: 'interactive',
    tourDates: [BERLIN_SHOW],
    latestRelease: {
      title: 'Never Say A Word',
      slug: 'never-say-a-word',
      artworkUrl: '/images/avatars/tim-white.jpg',
      releaseDate: '2025-01-01T00:00:00.000Z',
      releaseType: 'single',
    },
    featuredSeed: { dsp: false, returning: false, country: 'DE' },
  },
};

/** One right thing: a visitor from a streaming service sees the music. */
export const MusicForStreamingVisitor: StoryObj<typeof ProfileHomeRail> = {
  args: {
    renderMode: 'interactive',
    tourDates: [BERLIN_SHOW],
    featuredSeed: { dsp: true, returning: false, country: 'US' },
  },
};
