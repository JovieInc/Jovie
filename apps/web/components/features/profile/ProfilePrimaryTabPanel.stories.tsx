import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ProfilePrimaryTabPanel } from './ProfilePrimaryTabPanel';
import {
  PROFILE_STORY_ARTIST,
  PROFILE_STORY_CONTENT_PREFS,
  profileStoryNoop,
} from './profile-story-fixture';

const meta: Meta<typeof ProfilePrimaryTabPanel> = {
  title: 'Profile/ProfilePrimaryTabPanel',
  component: ProfilePrimaryTabPanel,
  parameters: {
    layout: 'centered',
    jovie: {
      uncoveredProps: ['disabled'],
    },
  },
  args: {
    mode: 'listen',
    artist: PROFILE_STORY_ARTIST,
    dsps: [
      {
        key: 'spotify',
        name: 'Spotify',
        url: 'https://open.spotify.com/artist/4u',
        config: {
          name: 'Spotify',
          color: '#1DB954',
          textColor: '#FFFFFF',
          logoSvg: '<svg />',
        },
      },
    ],
    isSubscribed: false,
    contentPrefs: PROFILE_STORY_CONTENT_PREFS,
    onTogglePref: profileStoryNoop,
    onUnsubscribe: profileStoryNoop,
    isUnsubscribing: false,
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
};

export default meta;

type Story = StoryObj<typeof ProfilePrimaryTabPanel>;

export const Listen: Story = {};

// The profile stage: the panel's on-media text is drawn for this surface.
const onProfileStage: NonNullable<Story['decorators']> = [
  Story => (
    <div className='profile-viewport w-sm max-w-full bg-(--profile-stage-bg) p-4'>
      <Story />
    </div>
  ),
];

// Alerts tab while the visitor's experiment assignment is still resolving.
export const LoadingAlertsAssignment: Story = {
  decorators: onProfileStage,
  args: {
    mode: 'subscribe',
    visitorAssignmentResolved: false,
  },
};

// No releases and nowhere to stream yet.
export const EmptyMusic: Story = {
  decorators: onProfileStage,
  args: {
    renderMode: 'preview',
    releases: [],
    dsps: [],
  },
};

export const ErrorCatalogLoadFailed: Story = {
  decorators: onProfileStage,
  args: {
    renderMode: 'preview',
    catalogLoadFailed: true,
  },
};

// Streaming links exist but no release has been imported.
export const PartialStreamingOnly: Story = {
  decorators: onProfileStage,
  args: {
    renderMode: 'preview',
    releases: [],
  },
};

export const LongContent: Story = {
  decorators: onProfileStage,
  args: {
    releases: [
      {
        id: 'release-long-1',
        title:
          'Never Say A Word (Extended Sunrise Rework For The Tenth Anniversary Deluxe Edition)',
        slug: 'never-say-a-word-extended',
        releaseType: 'single',
        releaseDate: '2026-08-01',
        artworkUrl: '/images/avatars/tim-white.jpg',
        artistNames: [
          'Tim White',
          'The After-Hours Romantic Orchestra And Choir',
          'Featuring Everyone Who Played On The Original Session',
        ],
      },
      {
        id: 'release-long-2',
        title:
          'Llanfairpwllgwyngyllgogerychwyrndrobwllllantysiliogogogoch (Live)',
        slug: 'llanfair-live',
        releaseType: 'album',
        releaseDate: '2026-05-12',
        artworkUrl: '/images/avatars/tim-white.jpg',
        artistNames: ['Tim White'],
      },
    ],
  },
};

export const Rtl: Story = {
  decorators: [
    Story => (
      <div
        dir='rtl'
        lang='ar'
        className='profile-viewport w-sm max-w-full bg-(--profile-stage-bg) p-4'
      >
        <Story />
      </div>
    ),
  ],
  args: {
    releases: [
      {
        id: 'release-rtl-1',
        title: 'لا تقل كلمة',
        slug: 'never-say-a-word',
        releaseType: 'single',
        releaseDate: '2026-08-01',
        artworkUrl: '/images/avatars/tim-white.jpg',
        artistNames: ['تيم وايت'],
      },
    ],
  },
};
