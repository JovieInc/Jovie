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
        artworkUrl: '/images/avatars/tim-white-founder.jpg',
        artistNames: ['Tim White'],
      },
    ],
  },
};

export default meta;

export const Listen: StoryObj<typeof ProfilePrimaryTabPanel> = {};
